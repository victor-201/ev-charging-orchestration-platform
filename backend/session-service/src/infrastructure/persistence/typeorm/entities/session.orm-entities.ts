import {
  Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

// charging_sessions

@Entity('charging_sessions')
@Index('idx_session_user_status',    ['userId', 'status'])
@Index('idx_session_charger_status', ['chargerId', 'status'])
@Index('idx_session_booking',        ['bookingId'], { where: `booking_id IS NOT NULL` })
@Index('idx_session_active',         ['chargerId', 'startTime'], { where: `status = 'active'` })
export class SessionOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid', nullable: true, unique: true })
  bookingId: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'charger_id', type: 'uuid' })
  chargerId: string;

  @Column({ name: 'start_time', type: 'timestamptz', default: () => 'NOW()' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz', nullable: true })
  endTime: Date | null;

  @Column({ name: 'start_soc_percent', type: 'smallint', nullable: true })
  startSocPercent: number | null;

  @Column({ name: 'start_meter_wh', type: 'bigint', default: 0 })
  startMeterWh: number;

  @Column({ name: 'end_meter_wh', type: 'bigint', nullable: true })
  endMeterWh: number | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'active', 'completed', 'error', 'interrupted'],
    default: 'pending',
  })
  status: string;

  @Column({ name: 'error_reason', type: 'varchar', length: 500, nullable: true })
  errorReason: string | null;

  @Column({ name: 'initiated_by', length: 20, default: 'user' })
  initiatedBy: string;

  /**
   * Scheduled forced stop time (UTC).
   * Set when a walk-in session starts while a booking is coming up.
   * The ForceStopJob will call StopSession at this timestamp.
   */
  @Column({ name: 'scheduled_stop_at', type: 'timestamptz', nullable: true })
  scheduledStopAt: Date | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ name: 'energy_fee_vnd', type: 'numeric', precision: 12, scale: 0, default: 0 })
  energyFeeVnd: number;

  @Column({ name: 'idle_fee_vnd', type: 'numeric', precision: 12, scale: 0, default: 0 })
  idleFeeVnd: number;

  @Column({ name: 'stopped_at', type: 'timestamptz', nullable: true })
  stoppedAt: Date | null;

  @Column({ name: 'billed_at', type: 'timestamptz', nullable: true })
  billedAt: Date | null;

  @Column({ name: 'deposit_amount', type: 'numeric', precision: 12, scale: 0, default: 0 })
  depositAmount: number;

  @Column({ name: 'deposit_transaction_id', type: 'uuid', nullable: true })
  depositTransactionId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

// session_telemetry
// Time-series table. High write throughput. Separate to prevent session rows bloat.

@Entity('session_telemetry')
@Index('idx_telemetry_session', ['sessionId', 'recordedAt'])
export class TelemetryOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'NOW()' })
  recordedAt: Date;

  @Column({ name: 'power_kw', type: 'decimal', precision: 8, scale: 3, nullable: true })
  powerKw: number | null;

  @Column({ name: 'meter_wh', type: 'bigint', nullable: true })
  meterWh: number | null;

  @Column({ name: 'voltage_v', type: 'decimal', precision: 7, scale: 2, nullable: true })
  voltageV: number | null;

  @Column({ name: 'current_a', type: 'decimal', precision: 7, scale: 3, nullable: true })
  currentA: number | null;

  @Column({ name: 'soc_percent', type: 'smallint', nullable: true })
  socPercent: number | null;

  @Column({ name: 'temperature_c', type: 'decimal', precision: 5, scale: 2, nullable: true })
  temperatureC: number | null;

  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode: string | null;
}

// charger_state
// Real-time charger operational state (1 row per charger, upserted on change).
// Read by Socket.IO gateway for realtime status.

@Entity('charger_state')
export class ChargerStateOrmEntity {
  @PrimaryColumn({ name: 'charger_id', type: 'uuid' })
  chargerId: string;

  @Column({
    type: 'enum',
    enum: ['available', 'occupied', 'faulted', 'offline', 'reserved'],
    default: 'available',
  })
  availability: string;

  @Column({ name: 'active_session_id', type: 'uuid', nullable: true })
  activeSessionId: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode: string | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  /**
   * Timestamp when the last session was released (cable unplugged / session stopped).
   * Used by QueueCleanupJob to determine if 3-minute physical wait has elapsed.
   * Cleared (set to null) once the queue has been notified or charger transitions away.
   */
  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'NOW()' })
  updatedAt: Date;
}

export { ProcessedEventOrmEntity, OutboxOrmEntity } from './booking.orm-entities';

// user_debt_read_models
// Read-model sync from Payment Service (wallet.arrears events).
// Used by ChargingArrearsGuard to block user from starting charging if in debt.

@Entity('user_debt_read_models')
export class UserDebtReadModelOrmEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** true = block user from starting charging session */
  @Column({ name: 'has_outstanding_debt', default: false })
  hasOutstandingDebt: boolean;

  /** Debt amount (VND) */
  @Column({ name: 'arrears_amount', type: 'numeric', precision: 12, scale: 0, default: 0 })
  arrearsAmount: number;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'NOW()' })
  syncedAt: Date;
}

// booking_read_models
// Read-model sync from Booking Service (booking.confirmed event).
// Used by StartSessionUseCase to validate QR time window:
//   - Do not allow QR scanning earlier than 15 minutes before startTime
//   - Do not allow QR scanning later than 5 minutes after endTime

@Entity('booking_read_models')
@Index('idx_brm_charger', ['chargerId'])
export class BookingReadModelOrmEntity {
  @PrimaryColumn({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'charger_id', type: 'uuid' })
  chargerId: string;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime: Date;

  /** QR token generated after successful payment */
  @Column({ name: 'qr_token', type: 'varchar', length: 40, nullable: true })
  qrToken: string | null;

  @Column({ name: 'deposit_amount', type: 'numeric', precision: 12, scale: 0, default: 0 })
  depositAmount: number;

  @Column({ name: 'deposit_transaction_id', type: 'uuid', nullable: true })
  depositTransactionId: string | null;

  @Column({ name: 'connector_type', type: 'varchar', length: 20, nullable: true })
  connectorType: string | null;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'NOW()' })
  syncedAt: Date;
}
