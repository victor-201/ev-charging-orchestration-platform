import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus, ParseUUIDPipe, NotFoundException,
  BadRequestException, Logger, UnauthorizedException,
  UseGuards, Header,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChargerReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { BookingReadModelOrmEntity, TelemetryOrmEntity, SessionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import {
  StartSessionUseCase, StopSessionUseCase,
  RecordTelemetryUseCase, GetSessionUseCase,
} from '../../application/use-cases/session.use-cases';
import {
  StartSessionDto,
  StopSessionDto,
  RecordTelemetryDto,
} from '../../application/dtos/session.dto';
import { JwtAuthGuard }             from '../../shared/guards/jwt-auth.guard';
import { CompositeAuthGuard }       from '../../shared/guards/composite-auth.guard';
import { RolesGuard }               from '../../shared/guards/roles.guard';
import { ChargingArrearsGuard, SkipChargingArrearsCheck } from '../../shared/guards/charging-arrears.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUser }   from '../../shared/guards/jwt-auth.guard';
import * as jwt from 'jsonwebtoken';
import { KIOSK_GUEST_USER_ID } from '../../shared/constants';

/**
 * SessionController - Self-service kiosk model:
 *
 *   POST /start              -> @JwtAuthGuard  (user starts charging at kiosk)
 *   POST /stop/:id           -> @JwtAuthGuard  (user stops charging at kiosk)
 *
 *   --- Intervention (Admin/Staff only) ---
 *   POST /admin/stop/:id     -> @Roles('staff','admin')  (force stop on incident)
 *   POST /telemetry/:id      -> @Roles('staff','admin')  (manual telemetry entry)
 *
 *   --- Read Access ---
 *   GET  /session/:id        -> @JwtAuthGuard             (user views own session)
 *   GET  /charger/:id/active -> @Roles('staff','admin')  (staff checks charger status)
 *   GET  /history            -> @JwtAuthGuard             (user views history)
 */
@Controller('charging')
@UseGuards(CompositeAuthGuard, RolesGuard, ChargingArrearsGuard)
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  constructor(
    private readonly startSession:    StartSessionUseCase,
    private readonly stopSession:     StopSessionUseCase,
    private readonly recordTelemetry: RecordTelemetryUseCase,
    private readonly getSession:      GetSessionUseCase,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerReadRepo: Repository<ChargerReadModelOrmEntity>,
    @InjectRepository(BookingReadModelOrmEntity)
    private readonly bookingReadRepo: Repository<BookingReadModelOrmEntity>,
    @InjectRepository(TelemetryOrmEntity)
    private readonly telemetryRepo: Repository<TelemetryOrmEntity>,
    @InjectRepository(SessionOrmEntity)
    private readonly sessionOrmRepo: Repository<SessionOrmEntity>,
  ) {}

  /**
   * Map domain aggregate to plain DTO.
   * Domain getters (startTime, status, etc.) live on the prototype and are
   * NOT serialized by JSON.stringify — this helper copies them to own props.
   */
  private toSessionDto(
    session: import('../../domain/entities/charging-session.aggregate').ChargingSession,
    charger?: ChargerReadModelOrmEntity | null,
  ) {
    return {
      id:              session.id,
      userId:          session.userId,
      chargerId:       session.chargerId,
      bookingId:       session.bookingId,
      status:          session.status,
      startTime:       session.startTime,
      endTime:         session.endTime,
      startMeterWh:    session.startMeterWh,
      startSocPercent: session.startSocPercent,
      endMeterWh:      session.endMeterWh,
      createdAt:       session.createdAt,
      energyKwh:       session.kwhConsumed ?? 0,
      amountDue:       session.totalFeeVnd,
      stationName:     charger?.stationName ?? null,
      cityName:        charger?.cityName ?? null,
      connectorType:   charger?.connectorType ?? null,
      maxPowerKw:      charger?.maxPowerKw ? Number(charger.maxPowerKw) : null,
    };
  }

  /**
   * Map stopped domain aggregate to the StopSessionResponse shape the frontend expects.
   * Domain getter names differ from the API contract:
   *   kwhConsumed → totalKwh
   *   totalFeeVnd → totalCostVnd
   *   errorReason → stopReason
   */
  private toStopDto(session: import('../../domain/entities/charging-session.aggregate').ChargingSession) {
    return {
      id:           session.id,
      status:       session.status,
      startTime:    session.startTime,
      endTime:      session.endTime,
      totalKwh:     session.kwhConsumed ?? 0,
      totalCostVnd: session.totalFeeVnd ?? 0,
      stopReason:   session.errorReason ?? null,
    };
  }

  /**
   * POST /api/v1/charging/start
   *
   * Flow 1 - Pre-booked:
   *   Kiosk scans QR from app -> sends { chargerId, bookingId, qrToken }.
   *   System verifies qrToken (short-lived JWT) containing bookingId and userId.
   *   If valid -> starts session.
   *
   * Flow 2 - Walk-in (no booking):
   *   Kiosk sends { chargerId } based on user's JWT.
   *   System automatically starts session.
   */
  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  async start(
    @Body() dto: StartSessionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    let sessionUserId = currentUser.id;
    let resolvedBookingId = dto.bookingId;

    // Booking flow: verify QR token first
    if (dto.bookingId) {
      if (!dto.qrToken) {
        throw new BadRequestException(
          'qrToken is required when bookingId is provided.',
        );
      }
      const result = await this.verifyQrToken(dto.qrToken, dto.bookingId, currentUser);
      sessionUserId = result.userId;
    } else if (dto.qrToken) {
      // Kiosk scanned booking QR without bookingId — look up by qrToken
      const result = await this.verifyQrToken(dto.qrToken, '', currentUser);
      sessionUserId = result.userId;
      resolvedBookingId = result.bookingId;
    }

    const session = await this.startSession.execute({
      userId:       sessionUserId,
      chargerId:    dto.chargerId,
      bookingId:    resolvedBookingId,
      startMeterWh: dto.startMeterWh,
    });
    const charger = await this.chargerReadRepo.findOneBy({ chargerId: session.chargerId });
    return this.toSessionDto(session, charger);
  }

  /**
   * POST /api/v1/charging/stop/:id
   *
   * User stops charging at kiosk.
   * System verifies session ownership before allowing stop.
   */
  @Post('stop/:id')
  @HttpCode(HttpStatus.OK)
  async stop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StopSessionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    // Ownership check — kiosk device may stop any session it started
    const session = await this.getSession.execute(id);
    if (!session) throw new NotFoundException('Session not found');
    const isKiosk = currentUser.role === 'kiosk' || currentUser.roles?.includes('kiosk');
    if (!isKiosk && session.userId !== currentUser.id) {
      throw new UnauthorizedException('You do not have permission to stop this session');
    }

    const stopped = await this.stopSession.execute({
      sessionId:  id,
      endMeterWh: dto.endMeterWh ?? 0,
      reason:     dto.reason,
    });
    return this.toStopDto(stopped);
  }

  /**
   * POST /api/v1/charging/admin/stop/:id
   * Admin/Staff force-stops session on station incident (no ownership required).
   * @SkipChargingArrearsCheck: admin can stop session even if user has arrears.
   */
  @Post('admin/stop/:id')
  @HttpCode(HttpStatus.OK)
  @Roles('staff', 'admin')
  @SkipChargingArrearsCheck()
  async adminStop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StopSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const session = await this.getSession.execute(id);
    if (!session) throw new NotFoundException('Session not found');

    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      const charger = await this.chargerReadRepo.findOne({
        where: { chargerId: session.chargerId },
      });
      if (!charger || !allowedStations.includes(charger.stationId)) {
        throw new UnauthorizedException('You do not have permission to force-stop a session on this charger');
      }
    }

    const stopped = await this.stopSession.execute({
      sessionId:  id,
      endMeterWh: dto.endMeterWh ?? 0,
      reason:     dto.reason ?? 'admin_intervention',
    });
    return this.toStopDto(stopped);
  }

  /**
   * POST /api/v1/charging/telemetry/:id
   * Staff/charger firmware sends manual telemetry data.
   */
  @Post('telemetry/:id')
  @HttpCode(HttpStatus.CREATED)
  @Roles('staff', 'admin')
  @SkipChargingArrearsCheck()
  async telemetry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordTelemetryDto,
  ) {
    return this.recordTelemetry.execute(id, dto);
  }

  /**
   * GET /api/v1/charging/session/:id
   * User views own session.
   */
  @Get('session/:id')
  @SkipChargingArrearsCheck()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const session = await this.getSession.execute(id);
    if (!session) throw new NotFoundException('Session not found');
    const charger = await this.chargerReadRepo.findOneBy({ chargerId: session.chargerId });
    return this.toSessionDto(session, charger);
  }

  /**
   * GET /api/v1/charging/charger/:chargerId/active
   * Staff views active session for a specific charger.
   */
  @Get('charger/:chargerId/active')
  @Roles('staff', 'admin', 'kiosk')
  async getActiveByCharger(
    @Param('chargerId', ParseUUIDPipe) chargerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin && user.role !== 'kiosk') {
      const allowedStations = user.stationIds || [];
      const charger = await this.chargerReadRepo.findOne({
        where: { chargerId },
      });
      if (!charger || !allowedStations.includes(charger.stationId)) {
        throw new UnauthorizedException('You do not have permission to view active sessions for this charger');
      }
    }

    const session = await this.getSession.getActiveByCharger(chargerId);
    if (!session) throw new NotFoundException('No active session for this charger');
    const charger = await this.chargerReadRepo.findOneBy({ chargerId: session.chargerId });
    return this.toSessionDto(session, charger);
  }

  /**
   * GET /api/v1/charging/history
   * User views charging history.
   * @SkipChargingArrearsCheck: user can view history even with arrears.
   */
  @Get('history')
  @SkipChargingArrearsCheck()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
    @Query('userId') userId?: string,
    @Query('chargerId') chargerId?: string,
    @Query('status') status?: string,
  ) {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');
    
    // Only administrators see other users' history globally.
    // Staff members see other users' history scoped strictly to their stations.
    const targetUserId = isAdmin ? (userId || undefined) : (isStaff ? undefined : user.id);

    let chargerIds: string[] | undefined = undefined;

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (allowedStations.length === 0) {
        return { items: [], total: 0 };
      }

      if (chargerId) {
        const charger = await this.chargerReadRepo.findOne({
          where: { chargerId },
        });
        if (!charger || !allowedStations.includes(charger.stationId)) {
          throw new UnauthorizedException('You do not have permission to view charging history for this charger');
        }
      } else {
        const chargers = await this.chargerReadRepo.find({
          where: { stationId: In(allowedStations) },
          select: ['chargerId'],
        });
        chargerIds = chargers.map((c) => c.chargerId);
        if (chargerIds.length === 0) {
          return { items: [], total: 0 };
        }
      }
    }

    const result = await this.getSession.getAllHistoryPaginated(
      +limit,
      +offset,
      targetUserId,
      chargerId || undefined,
      status || undefined,
      chargerIds,
    );
    const uniqueChargerIds = [...new Set(result.items.map((s) => s.chargerId))];
    const chargers = uniqueChargerIds.length > 0
      ? await this.chargerReadRepo.findBy({ chargerId: In(uniqueChargerIds) })
      : [];
    const chargerMap = new Map(chargers.map((c) => [c.chargerId, c]));
    return {
      items: result.items.map((s) => this.toSessionDto(s, chargerMap.get(s.chargerId))),
      total: result.total,
    };
  }

  /**
   * GET /api/v1/charging/telemetry/:sessionId
   * Staff views latest telemetry readings for a session.
   */
  @Get('telemetry/:sessionId')
  @Roles('staff', 'admin')
  @SkipChargingArrearsCheck()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getTelemetry(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    const session = await this.getSession.execute(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      const charger = await this.chargerReadRepo.findOne({
        where: { chargerId: session.chargerId },
      });
      if (!charger || !allowedStations.includes(charger.stationId)) {
        throw new UnauthorizedException('You do not have permission to view telemetry for this session');
      }
    }

    const readings = await this.telemetryRepo.find({
      where: { sessionId },
      order: { recordedAt: 'DESC' },
      take: 20,
    });

    return {
      sessionId,
      chargerId: session.chargerId,
      readings: readings.map((r) => ({
        id: r.id,
        recordedAt: r.recordedAt,
        powerKw: r.powerKw ? Number(r.powerKw) : null,
        meterWh: r.meterWh ? Number(r.meterWh) : null,
        voltageV: r.voltageV ? Number(r.voltageV) : null,
        currentA: r.currentA ? Number(r.currentA) : null,
        socPercent: r.socPercent,
        temperatureC: r.temperatureC ? Number(r.temperatureC) : null,
        errorCode: r.errorCode,
      })),
    };
  }

  /**
   * DELETE /api/v1/charging/session/:id
   * Admin permanently deletes a session record from the database.
   * Only for completed/stopped/interrupted sessions (not active).
   */
  @Delete('session/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  @SkipChargingArrearsCheck()
  async adminDeleteSession(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const session = await this.sessionOrmRepo.findOneBy({ id });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    if (session.status === 'active') {
      throw new BadRequestException('Cannot delete an active session. Force-stop it first.');
    }
    await this.sessionOrmRepo.delete({ id });
    this.logger.log(`Admin permanently deleted session ${id}`);
  }

  /**
   * Verifies QR token generated by app during booking.
   * Supports standard non-JWT 'EV-XXXX-XXXX' format by querying database,
   * with fallback to legacy JWT verification for test compatibility.
   */
  private async verifyQrToken(qrToken: string, bookingId: string, caller: AuthenticatedUser): Promise<{ userId: string; bookingId: string }> {
    // 1. Check standard booking QR code format EV-XXXX-XXXX
    if (qrToken.startsWith('EV-') || !qrToken.includes('.')) {
      const booking = bookingId
        ? await this.bookingReadRepo.findOneBy({ bookingId })
        : await this.bookingReadRepo.findOneBy({ qrToken });
      if (!booking) {
        throw new BadRequestException('Booking not found or not confirmed.');
      }
      if (bookingId && booking.qrToken !== qrToken) {
        throw new BadRequestException('QR code does not match this booking.');
      }

      const isKiosk = caller.id === KIOSK_GUEST_USER_ID || 
                      caller.id === 'kiosk-device' || 
                      caller.role === 'kiosk' || 
                      caller.roles?.includes('kiosk');
      if (!isKiosk && booking.userId !== caller.id) {
        throw new UnauthorizedException('QR code does not belong to the current account.');
      }
      return { userId: booking.userId, bookingId: booking.bookingId };
    }

    // 2. Fallback to JWT-based verification
    const secret = process.env.QR_TOKEN_SECRET ?? process.env.JWT_SECRET ?? 'qr-secret';
    let payload: any;
    try {
      payload = jwt.verify(qrToken, secret);
    } catch {
      throw new BadRequestException('Invalid or expired QR code.');
    }
    if (payload.bookingId !== bookingId) {
      throw new BadRequestException('QR code does not match this booking.');
    }
    const isKiosk = caller.id === KIOSK_GUEST_USER_ID || caller.id === 'kiosk-device' || caller.role === 'kiosk' || caller.roles?.includes('kiosk');
    if (!isKiosk && payload.userId !== caller.id) {
      throw new UnauthorizedException('QR code does not belong to the current account.');
    }
    return { userId: payload.userId, bookingId: payload.bookingId };
  }
}
