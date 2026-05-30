import {
  Controller, Get, Post, Patch, Body, Param, Query,
  HttpCode, HttpStatus, ParseUUIDPipe, NotFoundException,
  BadRequestException, Logger, UnauthorizedException,
  UseGuards, Header,
} from '@nestjs/common';
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
  ) {}

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

    // Booking flow: verify QR token first
    if (dto.bookingId) {
      if (!dto.qrToken) {
        throw new BadRequestException(
          'qrToken is required when bookingId is provided.',
        );
      }
      sessionUserId = this.verifyQrToken(dto.qrToken, dto.bookingId, currentUser);
    }

    return this.startSession.execute({
      userId:       sessionUserId,
      chargerId:    dto.chargerId,
      bookingId:    dto.bookingId,
      startMeterWh: dto.startMeterWh,
    });
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
    // Ownership check
    const session = await this.getSession.execute(id);
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== currentUser.id) {
      throw new UnauthorizedException('You do not have permission to stop this session');
    }

    return this.stopSession.execute({
      sessionId:  id,
      endMeterWh: dto.endMeterWh,
      reason:     dto.reason,
    });
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
  ) {
    return this.stopSession.execute({
      sessionId:  id,
      endMeterWh: dto.endMeterWh,
      reason:     dto.reason ?? 'admin_intervention',
    });
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
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    const session = await this.getSession.execute(id);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /**
   * GET /api/v1/charging/charger/:chargerId/active
   * Staff views active session for a specific charger.
   */
  @Get('charger/:chargerId/active')
  @Roles('staff', 'admin', 'kiosk')
  async getActiveByCharger(@Param('chargerId', ParseUUIDPipe) chargerId: string) {
    const session = await this.getSession.getActiveByCharger(chargerId);
    if (!session) throw new NotFoundException('No active session for this charger');
    return session;
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
    @Query('limit') limit?: number,
  ) {
    return this.getSession.getUserHistory(user.id, limit ?? 20);
  }

  /**
   * Verifies QR token generated by app during booking.
   * QR token is a short-lived JWT (15 mins) containing: { bookingId, userId }.
   * Ensures:
   *   - Token is valid and not expired.
   *   - bookingId in token matches request.
   *   - userId in token matches currently logged-in user.
   */
  private verifyQrToken(qrToken: string, bookingId: string, caller: AuthenticatedUser): string {
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
    const isKiosk = caller.id === 'kiosk-device' || caller.role === 'kiosk' || caller.roles?.includes('kiosk');
    if (!isKiosk && payload.userId !== caller.id) {
      throw new UnauthorizedException('QR code does not belong to the current account.');
    }
    return payload.userId;
  }
}
