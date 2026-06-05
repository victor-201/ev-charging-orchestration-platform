import {
  Controller,
  Post, Get, Delete, Patch,
  Body, Param, Query,
  HttpCode, HttpStatus,
  ParseUUIDPipe, NotFoundException, UnauthorizedException, BadRequestException,
  UseGuards,
  Inject,
  Header,
  Headers,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChargerReadModelOrmEntity, BookingOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { CreateBookingUseCase, GetAvailabilityUseCase } from '../../application/use-cases/create-booking.use-case';
import { CancelBookingUseCase, AutoConfirmBookingUseCase } from '../../application/use-cases/booking-lifecycle.use-case';
import { GetQueuePositionUseCase } from '../../application/use-cases/booking-jobs.use-case';
import {
  JoinQueueUseCase,
  LeaveQueueUseCase,
} from '../../application/use-cases/queue.use-case';
import { CreateBookingDto, CancelBookingDto, JoinQueueDto, AvailabilityQueryDto, SuggestChargerDto } from '../../application/dtos/booking.dto';
import { BookingResponseDto, AvailabilitySlotDto, QueuePositionResponseDto, SuggestChargerResponseDto } from '../../application/dtos/response.dto';
import { SuggestChargerUseCase } from '../../application/use-cases/suggest-charger.use-case';
import { Booking } from '../../domain/aggregates/booking.aggregate';
import { CompositeAuthGuard } from '../../shared/guards/composite-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import { ArrearsGuard, SkipArrearsCheck } from '../../shared/guards/arrears.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../shared/guards/jwt-auth.guard';
import { BOOKING_REPOSITORY } from './booking.tokens';
import type { IBookingRepository } from '../../domain/repositories/booking.repository.interface';

/**
 * BookingController - Fully automated, no permanent staff required
 *
 * Flow:
 *   POST /bookings         -> Create booking (PENDING_PAYMENT) + emit deposit request
 *   GET  /bookings/availability -> View availability by day / charger
 *   GET  /bookings/:id     -> Booking details (with QR token if confirmed)
 *   GET  /bookings/me      -> Current user's bookings
 *   DELETE /bookings/:id   -> Cancel booking -> auto refund deposit to wallet
 *
 *   POST /queue            -> Join queue (when charger is full)
 *   DELETE /queue/:chargerId -> Leave queue
 *   GET  /queue/:chargerId/position -> Queue position
 *
 * NOTE: confirm/complete endpoints have been REMOVED.
 *   Confirm: automatic after payment.completed event is received.
 *   Complete: automatic after session.started event is received.
 */
@Controller('bookings')
@UseGuards(CompositeAuthGuard, RolesGuard, ArrearsGuard)
export class BookingController {
  constructor(
    private readonly createBooking:       CreateBookingUseCase,
    private readonly cancelBooking:        CancelBookingUseCase,
    private readonly autoConfirmBooking:   AutoConfirmBookingUseCase,
    private readonly getAvailability:      GetAvailabilityUseCase,
    private readonly joinQueue:            JoinQueueUseCase,
    private readonly leaveQueue:           LeaveQueueUseCase,
    private readonly getQueuePosition:     GetQueuePositionUseCase,
    private readonly suggestCharger:       SuggestChargerUseCase,
    @Inject(BOOKING_REPOSITORY)
    private readonly bookingRepo:          IBookingRepository,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerReadRepo:      Repository<ChargerReadModelOrmEntity>,
    @InjectRepository(BookingOrmEntity)
    private readonly bookingOrmRepo:       Repository<BookingOrmEntity>,
  ) {}

  /**
   * Recommends optimal charging stations and time slots.
   *
   * Bypasses outstanding debt checks to allow users to plan routes and view charging options
   * even if a payment dispute or outstanding balance is active.
   *
   * @param dto - Search criteria (location coordinates, connector type, and budget)
   * @param user - Authenticated user session
   */
  @Get('suggest')
  @SkipArrearsCheck()
  async suggest(
    @Query() dto: SuggestChargerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SuggestChargerResponseDto[]> {
    return this.suggestCharger.execute(dto, user.id);
  }

  // GET /api/v1/bookings/availability
  /**
   * View availability by day for a charger.
   * Returns an array of 30-minute slots, each with isBooked: true/false.
   * @SkipArrearsCheck: user in debt can still VIEW availability (only blocks new bookings).
   */
  @Get('availability')
  @SkipArrearsCheck()
  async getAvailabilitySlots(
    @Query() query: AvailabilityQueryDto,
    @Query('stationId') stationId?: string,
    @Query('connectorType') connectorType?: string,
  ) {
    const date = new Date(query.date);
    return this.getAvailability.execute(
      query.chargerId,
      stationId ?? '',
      connectorType ?? '',
      date,
    );
  }

  // GET /api/v1/bookings
  /**
   * List of all bookings in the system - for admin/staff.
   */
  @Get()
  @Roles('admin', 'staff')
  @SkipArrearsCheck()
  async getAllBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
    @Query('userId') userId?: string,
    @Query('chargerId') chargerId?: string,
    @Query('status') status?: string,
  ): Promise<{ items: BookingResponseDto[]; total: number }> {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

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
          throw new UnauthorizedException('You do not have permission to view bookings for this charger');
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

    const result = await this.bookingRepo.findAll(+limit, +offset, userId, chargerId, status, chargerIds);
    return {
      items: result.items.map((b) => this.toDto(b)),
      total: result.total,
    };
  }

  // GET /api/v1/bookings/me
  /**
   * Current user's bookings - paginated.
   * @SkipArrearsCheck: user in debt can still VIEW old bookings.
   */
  @Get('me')
  @SkipArrearsCheck()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getMyBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
    @Query('status') status?: string,
  ): Promise<{ items: BookingResponseDto[]; total: number }> {
    const result = await this.bookingRepo.findByUser(user.id, +limit, +offset, status);
    return {
      items: result.items.map((b) => this.toDto(b)),
      total: result.total,
    };
  }

  // POST /api/v1/bookings
  /**
   * Create a new booking.
   * userId is extracted from JWT token (client cannot set it).
   * After creation: system automatically deducts deposit from wallet.
   * If payment is successful: booking is auto CONFIRMED + QR generated.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<BookingResponseDto> {
    const booking = await this.createBooking.execute({
      userId:         user.id,
      chargerId:      dto.chargerId,
      stationId:      dto.stationId,
      connectorType:  dto.connectorType,
      startTime:      new Date(dto.startTime),
      endTime:        new Date(dto.endTime),
      idempotencyKey,
    });
    return this.toDto(booking);
  }

  // GET /api/v1/bookings/:id
  /**
   * Booking details - normal user can only view their own bookings.
   * Response includes qrToken (null if not confirmed).
   * @SkipArrearsCheck: user in debt can still view old booking details.
   */
  @Get(':id')
  @SkipArrearsCheck()
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) throw new NotFoundException(`Booking ${id} does not exist`);

    const isPrivileged = user.roles?.some((r) => ['admin', 'staff'].includes(r));
    if (!isPrivileged && booking.userId !== user.id) {
      throw new NotFoundException(`Booking ${id} does not exist`);
    }
    return this.toDto(booking);
  }

  // DELETE /api/v1/bookings/:id
  /**
   * User cancels their own booking, or Admin/Staff cancels booking.
   * Deposit will be automatically refunded 100% to wallet after event processing.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) {
      throw new NotFoundException(`Booking ${id} does not exist`);
    }

    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      const charger = await this.chargerReadRepo.findOne({
        where: { chargerId: booking.chargerId },
      });
      if (!charger || !allowedStations.includes(charger.stationId)) {
        throw new UnauthorizedException('You do not have permission to cancel this booking');
      }
    } else if (!isAdmin && booking.userId !== user.id) {
      throw new UnauthorizedException('You do not have permission to cancel this booking');
    }

    await this.cancelBooking.execute({
      bookingId: id,
      userId:    booking.userId,
      reason:    dto.reason ?? (isAdmin ? 'Admin cancelled' : isStaff ? 'Staff cancelled' : 'User cancelled'),
    });
  }

  // Admin intervention endpoints

  /**
   * POST /api/v1/bookings/:id/confirm
   * Admin/Staff manually confirms a booking (bypasses payment deposit flow).
   * Useful for walk-ins or when payment gateway fails but payment was received.
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'staff')
  @SkipArrearsCheck()
  async adminConfirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookingResponseDto> {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) throw new NotFoundException(`Booking ${id} does not exist`);

    const terminatedStatuses = ['cancelled', 'completed', 'no_show'];
    if (terminatedStatuses.includes(booking.status.toLowerCase())) {
      throw new BadRequestException(`Cannot confirm a booking with status: ${booking.status}`);
    }

    const transactionId = `admin-manual-${Date.now()}-${user.id.slice(0, 8)}`;
    const confirmed = await this.autoConfirmBooking.execute({ bookingId: id, transactionId });
    if (!confirmed) {
      throw new BadRequestException('Booking could not be confirmed. It may already be confirmed or in an invalid state.');
    }
    return this.toDto(confirmed);
  }

  /**
   * DELETE /api/v1/bookings/:id/record
   * Admin permanently removes a booking record from the database.
   * Only for terminal-state bookings (cancelled, completed, no_show).
   */
  @Delete(':id/record')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  @SkipArrearsCheck()
  async adminHardDelete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) throw new NotFoundException(`Booking ${id} does not exist`);

    const allowedStatuses = ['cancelled', 'completed', 'no_show'];
    if (!allowedStatuses.includes(booking.status.toLowerCase())) {
      throw new BadRequestException(
        `Cannot delete booking with status: ${booking.status}. Only cancelled/completed/no_show bookings can be deleted.`,
      );
    }

    await this.bookingOrmRepo.delete({ id });
  }

  // Queue endpoints

  /**
   * POST /api/v1/bookings/queue
   * Join queue when charger is full.
   * When a slot is available, system will Push Notification to user.
   */
  @Post('queue')
  @HttpCode(HttpStatus.CREATED)
  async handleJoinQueue(
    @Body() dto: JoinQueueDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QueuePositionResponseDto> {
    return this.joinQueue.execute({
      userId:        user.id,
      chargerId:     dto.chargerId,
      connectorType: dto.connectorType,
      userPriority:  1,
      urgencyScore:  dto.urgencyScore ?? 0,
    });
  }

  /**
   * DELETE /api/v1/bookings/queue/:chargerId
   * Leave queue.
   */
  @Delete('queue/:chargerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handleLeaveQueue(
    @Param('chargerId', ParseUUIDPipe) chargerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.leaveQueue.execute({ userId: user.id, chargerId });
  }

  /**
   * GET /api/v1/bookings/queue/:chargerId/position
   * View queue position.
   */
  @Get('queue/:chargerId/position')
  async getQueuePos(
    @Param('chargerId', ParseUUIDPipe) chargerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QueuePositionResponseDto> {
    return this.getQueuePosition.execute(user.id, chargerId);
  }

  // Mapper

  private toDto(b: Booking): BookingResponseDto {
    return {
      id:              b.id,
      userId:          b.userId,
      chargerId:       b.chargerId,
      startTime:       b.timeRange.startTime,
      endTime:         b.timeRange.endTime,
      status:          b.status,
      durationMinutes: b.timeRange.durationMinutes(),
      qrToken:         b.qrToken,
      depositAmount:   b.depositAmount,
      connectorType:   b.connectorType,
      createdAt:       b.createdAt,
    };
  }
}
