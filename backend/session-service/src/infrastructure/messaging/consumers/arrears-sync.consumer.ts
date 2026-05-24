import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ProcessedEventOrmEntity } from '../../persistence/typeorm/entities/booking.orm-entities';
import { UserDebtReadModelOrmEntity } from '../../persistence/typeorm/entities/session.orm-entities';
// WalletArrearsCreatedConsumer

/**
 * Listens for wallet.arrears.created from Payment Service.
 * Updates local read-model user_debt_read_models in booking-service DB.
 * Allows ArrearsGuard to check locally without calling remote service.
 */
@Injectable()
export class BookingArrearsCreatedConsumer {
  private readonly logger = new Logger(BookingArrearsCreatedConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(UserDebtReadModelOrmEntity)
    private readonly debtRepo: Repository<UserDebtReadModelOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'wallet.arrears.created',
    queue:        'booking-svc.wallet.arrears.created',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?: string;
    userId: string;
    walletId: string;
    arrearsAmount: number;
    sessionId: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.arrears.created:${payload.sessionId}`;
    if (await this.peRepo.existsBy({ eventId })) return;
    await this.peRepo.save({ eventId, eventType: 'wallet.arrears.created' });

    // Upsert read-model
    const existing = await this.debtRepo.findOneBy({ userId: payload.userId });
    if (existing) {
      await this.debtRepo.update(payload.userId, {
        hasOutstandingDebt: true,
        arrearsAmount:      Number(existing.arrearsAmount) + payload.arrearsAmount,
        syncedAt:           new Date(),
      } as any);
    } else {
      await this.debtRepo.save(this.debtRepo.create({
        userId:             payload.userId,
        hasOutstandingDebt: true,
        arrearsAmount:      payload.arrearsAmount,
        syncedAt:           new Date(),
      }));
    }

    this.logger.warn(
      `[ARREARS LOCK] Booking-service recorded debt user=${payload.userId} ` +
      `amount=${payload.arrearsAmount}VND - booking blocked`,
    );
  }
}

// WalletArrearsClearedConsumer

/**
 * Listens for wallet.arrears.cleared from Payment Service.
 * Resets debt flag -> user is allowed to book again.
 */
@Injectable()
export class BookingArrearsClearedConsumer {
  private readonly logger = new Logger(BookingArrearsClearedConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(UserDebtReadModelOrmEntity)
    private readonly debtRepo: Repository<UserDebtReadModelOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'wallet.arrears.cleared',
    queue:        'booking-svc.wallet.arrears.cleared',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?: string;
    userId: string;
    walletId: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.arrears.cleared:${payload.userId}:${Date.now()}`;
    if (await this.peRepo.existsBy({ eventId })) return;
    await this.peRepo.save({ eventId, eventType: 'wallet.arrears.cleared' });

    await this.debtRepo.update(
      { userId: payload.userId },
      { hasOutstandingDebt: false, arrearsAmount: 0, syncedAt: new Date() } as any,
    );

    this.logger.log(
      `[ARREARS CLEARED] Booking-service unlocked user=${payload.userId} - booking allowed again`,
    );
  }
}
