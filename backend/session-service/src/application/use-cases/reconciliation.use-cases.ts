import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';

import { IEventBus, EVENT_BUS } from '../../infrastructure/messaging/event-bus.interface';


// Reconciliation Job

/**
 * Runs every hour:
 * - Find STOPPED sessions > 30 minutes not BILLED -> publish payment request
 * - Flag sessions with discrepancy (endMeter - startMeter vs billed amount)
 */
@Injectable()
export class ReconciliationJob {
  private readonly logger = new Logger(ReconciliationJob.name);
  private readonly STOPPED_TTL_MINUTES = 30;

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  @Cron('0 * * * *') // every hour
  async run(): Promise<void> {
    this.logger.log('Running charging reconciliation job...');

    const cutoff = new Date(Date.now() - this.STOPPED_TTL_MINUTES * 60_000);
    const stuckSessions = await this.sessionRepo.findStoppedBefore(cutoff);

    if (stuckSessions.length === 0) {
      this.logger.log('No stuck sessions found');
      return;
    }

    this.logger.warn(`Found ${stuckSessions.length} stuck STOPPED sessions -> triggering payment`);

    for (const session of stuckSessions) {
      try {
        const kwhConsumed = session.kwhConsumed ?? 0;
        await this.eventBus.publish({
          eventType: 'session.payment_required',
          payload: {
            sessionId:   session.id,
            userId:      session.userId,
            chargerId:   session.chargerId,
            bookingId:   session.bookingId,
            kwhConsumed,
            endTime:     session.endTime,
          },
        });
        this.logger.log(`Payment request published for stuck session ${session.id}`);
      } catch (err) {
        this.logger.error(`Failed to publish payment request for session ${session.id}: ${err}`);
      }
    }
  }
}

// Fault Detection Use Case

export interface TelemetryReading {
  chargerId: string;
  sessionId: string;
  powerKw: number;
  currentA: number;
  voltageV: number;
  errorCode?: string;
  timestamp: Date;
}

/**
 * Receive telemetry events, detect hardware faults using patterns:
 * - Consecutive errorCodes
 * - Power drop > threshold
 */
@Injectable()
export class FaultDetectionService {
  private readonly logger = new Logger(FaultDetectionService.name);

  // In-memory sliding window per chargerId
  private readonly windows = new Map<string, TelemetryReading[]>();
  private readonly WINDOW_SIZE = 5;          // 5 consecutive readings
  private readonly POWER_DROP_THRESHOLD = 0.3; // 30% drop

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async analyze(reading: TelemetryReading): Promise<void> {
    const { chargerId } = reading;

    if (!this.windows.has(chargerId)) {
      this.windows.set(chargerId, []);
    }

    const window = this.windows.get(chargerId)!;
    window.push(reading);

    // Keep window sliding
    if (window.length > this.WINDOW_SIZE) {
      window.shift();
    }

    // Check consecutive errors
    if (reading.errorCode) {
      const allErrors = window.every(r => !!r.errorCode);
      if (allErrors && window.length >= this.WINDOW_SIZE) {
        await this.publishFault(chargerId, reading.sessionId, reading.errorCode);
        this.windows.set(chargerId, []); // reset after alert
        return;
      }
    }

    // Check power drop
    if (window.length >= 2) {
      const prev = window[window.length - 2];
      if (prev.powerKw > 0 && reading.powerKw < prev.powerKw * (1 - this.POWER_DROP_THRESHOLD)) {
        this.logger.warn(
          `Power drop detected on charger ${chargerId}: ${prev.powerKw}kW -> ${reading.powerKw}kW`,
        );
        await this.publishFault(chargerId, reading.sessionId, 'POWER_DROP');
      }
    }
  }

  private async publishFault(chargerId: string, sessionId: string, errorCode: string): Promise<void> {
    this.logger.error(`FAULT: charger=${chargerId} session=${sessionId} code=${errorCode}`);
    await this.eventBus.publish({
      eventType: 'charger.fault.detected',
      payload: {
        chargerId,
        sessionId,
        errorCode,
        detectedAt: new Date().toISOString(),
      },
    });
  }
}
