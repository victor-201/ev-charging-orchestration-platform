/**
 * Concurrency Integration Test — CreateBookingUseCase
 *
 * Requires a real PostgreSQL instance running.
 * Run with: npm run test:integration
 *
 * Tests that ONLY 1 booking succeeds when N concurrent requests target the exact same slot.
 */
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CreateBookingUseCase } from '../../src/application/use-cases/create-booking.use-case';
import { BookingRepository } from '../../src/infrastructure/persistence/typeorm/repositories/booking.repository';
import { ChargerRepository } from '../../src/infrastructure/persistence/typeorm/repositories/charger.repository';
import { OutboxEventBus } from '../../src/infrastructure/messaging/outbox/outbox-event-bus';
import { BookingOrmEntity } from '../../src/infrastructure/persistence/typeorm/entities/booking.orm-entity';
import { ChargerOrmEntity } from '../../src/infrastructure/persistence/typeorm/entities/charger.orm-entity';
import { OutboxOrmEntity } from '../../src/infrastructure/messaging/outbox/outbox.orm-entity';
import { BOOKING_REPOSITORY } from '../../src/domain/repositories/booking.repository.interface';
import { CHARGER_REPOSITORY } from '../../src/domain/repositories/charger.repository.interface';
import { EVENT_BUS } from '../../src/infrastructure/messaging/event-bus.interface';

/**
 * INTEGRATION TEST - Requires PostgreSQL.
 * Run: RUN_INTEGRATION_TESTS=true npm run test:integration
 * Skipped automatically when RUN_INTEGRATION_TESTS env var is not set.
 */
const describeOrSkip = process.env.RUN_INTEGRATION_TESTS ? describe : describe.skip;
const CHARGER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const START = new Date(Date.now() + 2 * 60 * 60 * 1000);
const END = new Date(Date.now() + 3 * 60 * 60 * 1000);

describeOrSkip('[INTEGRATION] CreateBookingUseCase (needs RUN_INTEGRATION_TESTS=true) — concurrent conflict prevention', () => {
  let createBooking: CreateBookingUseCase;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST ?? 'localhost',
          port: parseInt(process.env.DB_PORT ?? '5432'),
          username: process.env.DB_USER ?? 'ev_user',
          password: process.env.DB_PASSWORD ?? 'ev_secret',
          database: process.env.DB_NAME ?? 'ev_booking_db',
          entities: [BookingOrmEntity, ChargerOrmEntity, OutboxOrmEntity],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([BookingOrmEntity, ChargerOrmEntity, OutboxOrmEntity]),
      ],
      providers: [
        { provide: BOOKING_REPOSITORY, useClass: BookingRepository },
        { provide: CHARGER_REPOSITORY, useClass: ChargerRepository },
        { provide: EVENT_BUS, useClass: OutboxEventBus },
        CreateBookingUseCase,
      ],
    }).compile();

    createBooking = moduleRef.get(CreateBookingUseCase);
    dataSource = moduleRef.get(DataSource);

    // Seed charger
    await dataSource.query(
      `INSERT INTO chargers (id, station_id, connector_type, status)
       VALUES ($1, gen_random_uuid(), 'CCS', 'available')
       ON CONFLICT (id) DO NOTHING`,
      [CHARGER_ID],
    );
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM bookings WHERE charger_id = $1`, [CHARGER_ID]);
    await dataSource.destroy();
  });

  it('only 1 of 10 concurrent requests succeeds for same time slot', async () => {
    const requests = Array.from({ length: 10 }, (_, i) =>
      createBooking.execute({
        userId:        `user-${i}`,
        chargerId:     CHARGER_ID,
        stationId:     'station-uuid-1',
        connectorType: 'CCS2',
        startTime:     START,
        endTime:       END,
      }),
    );

    const results = await Promise.allSettled(requests);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected  = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(9);

    // Verify DB has exactly 1 booking
    const count = await dataSource.query(
      `SELECT COUNT(*) FROM bookings WHERE charger_id = $1 AND status IN ('pending','confirmed')`,
      [CHARGER_ID],
    );
    expect(parseInt(count[0].count)).toBe(1);
  });
});
