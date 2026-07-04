import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  SessionOrmEntity,
  TelemetryOrmEntity,
} from '../persistence/typeorm/entities/session.orm-entities';
import { ChargingGateway } from './charging.gateway';

interface SessionSimState {
  meterWh: number;
  socPercent: number;
}

@Injectable()
export class SimulatedTelemetryService {
  private readonly logger = new Logger(SimulatedTelemetryService.name);
  private readonly simState = new Map<string, SessionSimState>();
  private readonly SIM_POWER_KW = 22;
  private readonly SIM_TICK_MS = 1_000;

  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(TelemetryOrmEntity)
    private readonly telemetryRepo: Repository<TelemetryOrmEntity>,
    private readonly chargingGateway: ChargingGateway,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/1 * * * * *')
  async simulate(): Promise<void> {
    // In this orchestration platform, we allow simulated telemetry to run across all environments to support UI testing/demo
    // unless explicitly disabled.
    if (this.configService.get('DISABLE_TELEMETRY_SIMULATION') === 'true') return;

    const sessions = await this.sessionRepo.find({
      where: { status: 'active' },
      select: ['id', 'userId', 'chargerId', 'startMeterWh', 'startSocPercent'],
    });

    if (!sessions.length) {
      this.simState.clear();
      return;
    }

    const recentCutoff = new Date(Date.now() - 800);
    const recentTelemetry = await this.telemetryRepo.find({
      where: { recordedAt: MoreThan(recentCutoff) },
      select: ['sessionId'],
    });
    const recentSessionIds = new Set(recentTelemetry.map((t) => t.sessionId));

    const activeIds = new Set(sessions.map((s) => s.id));
    for (const [id] of this.simState) {
      if (!activeIds.has(id)) {
        this.simState.delete(id);
      }
    }

    for (const session of sessions) {
      if (recentSessionIds.has(session.id)) continue;

      try {
        let state = this.simState.get(session.id);
        if (!state) {
          const startMeterWh = Number(session.startMeterWh ?? 0);
          const startSocPercent = Number(session.startSocPercent ?? 30);

          const latestReal = await this.telemetryRepo.findOne({
            where: { sessionId: session.id },
            order: { recordedAt: 'DESC' },
            select: ['meterWh', 'socPercent'],
          });

          state = {
            meterWh: latestReal?.meterWh != null ? Number(latestReal.meterWh) : startMeterWh,
            socPercent: latestReal?.socPercent ?? startSocPercent,
          };
          this.simState.set(session.id, state);
        }

        const powerKw = this.SIM_POWER_KW + (Math.random() - 0.5) * 1.5;
        const deltaWh = powerKw * (this.SIM_TICK_MS / 3_600_000) * 1000;
        state.meterWh += deltaWh;
        state.socPercent = Math.min(100, state.socPercent + 0.06);

        const voltageV = parseFloat((380 + (Math.random() - 0.5) * 3).toFixed(1));
        const currentA = parseFloat((powerKw / 0.38 + (Math.random() - 0.5) * 1).toFixed(1));
        const temperatureC = parseFloat(
          (32 + (state.socPercent / 100) * 15 + (Math.random() - 0.5) * 1.5).toFixed(1),
        );

        const payload = {
          eventType: 'session.telemetry',
          sessionId: session.id,
          userId: session.userId,
          chargerId: session.chargerId,
          powerKw: parseFloat(powerKw.toFixed(1)),
          meterWh: Math.round(state.meterWh),
          socPercent: Math.round(state.socPercent),
          voltageV,
          currentA,
          temperatureC,
          errorCode: null,
          amountDue: null,
          recordedAt: new Date().toISOString(),
        };

        // Persist to telemetry_readings so HTTP API returns latest data
        await this.telemetryRepo.save({
          id: uuidv4(),
          sessionId: session.id,
          chargerId: session.chargerId,
          powerKw: payload.powerKw,
          meterWh: payload.meterWh,
          voltageV: payload.voltageV,
          currentA: payload.currentA,
          socPercent: payload.socPercent,
          temperatureC: payload.temperatureC,
          recordedAt: new Date(payload.recordedAt),
        });

        // Broadcast immediately via WebSocket
        this.chargingGateway.broadcastToSession(session.id, 'charging_updated', payload);
        this.chargingGateway.broadcastToCharger(session.chargerId, 'charging_updated', payload);

        this.logger.debug(
          `[Sim] Session ${session.id}: power=${payload.powerKw}kW soc=${payload.socPercent}% meterWh=${payload.meterWh}`,
        );
      } catch (err) {
        this.logger.error(`[Sim] Failed to simulate telemetry for session ${session.id}: ${err}`);
      }
    }
  }
}
