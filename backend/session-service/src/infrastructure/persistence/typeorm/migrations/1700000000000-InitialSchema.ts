import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
    name = 'InitialSchema1700000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE bookings_status_enum AS ENUM ('pending', 'pending_payment', 'confirmed', 'cancelled', 'completed', 'expired', 'no_show');
CREATE TYPE event_outbox_status_enum AS ENUM ('pending', 'processed', 'published', 'failed');
CREATE TYPE queue_entries_status_enum AS ENUM ('waiting', 'notified', 'served', 'cancelled', 'expired');
CREATE TYPE charger_state_availability_enum AS ENUM ('available', 'occupied', 'faulted', 'offline', 'reserved');
CREATE TYPE charging_sessions_status_enum AS ENUM ('init', 'active', 'stopped', 'billed', 'completed', 'error', 'interrupted');

CREATE TABLE bookings (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    vehicle_id UUID,
    charger_id UUID NOT NULL,
    pricing_snapshot_id UUID,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status bookings_status_enum NOT NULL DEFAULT 'pending_payment',
    expires_at TIMESTAMPTZ,
    notes TEXT,
    deposit_amount NUMERIC(12, 0),
    deposit_transaction_id UUID,
    qr_token VARCHAR(128),
    penalty_amount NUMERIC(12, 0) DEFAULT 0,
    connector_type VARCHAR(20),
    price_per_kwh_snapshot NUMERIC(10, 2),
    idempotency_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_book_user_status ON bookings (user_id, status, start_time);
CREATE INDEX idx_book_charger_time ON bookings (charger_id, start_time);
CREATE INDEX idx_book_confirmed_start ON bookings (status, start_time) WHERE status = 'confirmed';
CREATE INDEX idx_book_connector ON bookings (charger_id, connector_type, start_time);
CREATE INDEX idx_book_pending_payment ON bookings (status, created_at) WHERE status = 'pending_payment';
CREATE INDEX idx_book_deposit_tx ON bookings (deposit_transaction_id) WHERE deposit_transaction_id IS NOT NULL;

CREATE TABLE booking_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by UUID,
    reason TEXT
);

CREATE INDEX idx_bsh_booking ON booking_status_history (booking_id);

CREATE TABLE pricing_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    charger_id UUID NOT NULL,
    connector_type VARCHAR(20) NOT NULL,
    price_per_kwh NUMERIC(10, 4) NOT NULL,
    price_per_minute NUMERIC(10, 4),
    currency CHAR(3) NOT NULL DEFAULT 'VND',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_psnap_charger ON pricing_snapshots (charger_id);

CREATE TABLE queue_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    charger_id UUID NOT NULL,
    vehicle_id UUID,
    priority SMALLINT NOT NULL DEFAULT 100,
    status queue_entries_status_enum NOT NULL DEFAULT 'waiting',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at TIMESTAMPTZ,
    served_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_queue_user ON queue_entries (user_id, status);
CREATE INDEX idx_queue_charger ON queue_entries (charger_id, priority, joined_at) WHERE status = 'waiting';

CREATE TABLE scheduling_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    charger_id UUID NOT NULL,
    user_id UUID NOT NULL,
    vehicle_id UUID,
    suggested_start TIMESTAMPTZ NOT NULL,
    suggested_end TIMESTAMPTZ NOT NULL,
    confidence_score NUMERIC(4, 3),
    algorithm VARCHAR(50),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    booking_id UUID
);

CREATE INDEX idx_slot_charger ON scheduling_slots (charger_id, suggested_start);
CREATE INDEX idx_slot_user ON scheduling_slots (user_id) WHERE accepted_at IS NULL;

CREATE TABLE charger_state (
    charger_id UUID PRIMARY KEY,
    availability charger_state_availability_enum NOT NULL DEFAULT 'available',
    active_session_id UUID,
    error_code VARCHAR(100),
    last_heartbeat_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_charger_state_released ON charger_state (released_at) WHERE released_at IS NOT NULL AND availability = 'available';

CREATE TABLE charging_sessions (
    id UUID PRIMARY KEY,
    booking_id UUID UNIQUE,
    user_id UUID NOT NULL,
    charger_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    start_soc_percent SMALLINT,
    start_meter_wh BIGINT NOT NULL DEFAULT 0,
    end_meter_wh BIGINT,
    status charging_sessions_status_enum NOT NULL DEFAULT 'init',
    error_reason VARCHAR(500),
    initiated_by VARCHAR(20) NOT NULL DEFAULT 'user',
    idempotency_key VARCHAR(128) UNIQUE,
    energy_fee_vnd NUMERIC(12, 0) DEFAULT 0,
    idle_fee_vnd NUMERIC(12, 0) DEFAULT 0,
    stopped_at TIMESTAMPTZ,
    billed_at TIMESTAMPTZ,
    deposit_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
    deposit_transaction_id UUID,
    scheduled_stop_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_user_status ON charging_sessions (user_id, status);
CREATE INDEX idx_session_charger_status ON charging_sessions (charger_id, status);
CREATE INDEX idx_session_active ON charging_sessions (charger_id, start_time) WHERE status = 'active';
CREATE INDEX idx_session_stopped ON charging_sessions (status, end_time) WHERE status = 'stopped';
CREATE INDEX idx_session_booking ON charging_sessions (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_session_scheduled_stop ON charging_sessions (scheduled_stop_at) WHERE scheduled_stop_at IS NOT NULL AND status = 'active';

CREATE TABLE session_telemetry (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES charging_sessions(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    power_kw NUMERIC(8, 3),
    meter_wh BIGINT,
    voltage_v NUMERIC(7, 2),
    current_a NUMERIC(7, 3),
    soc_percent SMALLINT,
    temperature_c NUMERIC(5, 2),
    error_code VARCHAR(50)
);

CREATE INDEX idx_telemetry_session ON session_telemetry (session_id, recorded_at);

-- Read Models (Mirrored from other services via CQRS)
CREATE TABLE charger_read_models (
    charger_id UUID PRIMARY KEY,
    station_id UUID NOT NULL,
    station_name VARCHAR(255) NOT NULL,
    city_name VARCHAR(100),
    connector_type VARCHAR(20) NOT NULL,
    max_power_kw NUMERIC(8, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE connector_read_models (
    connector_id UUID PRIMARY KEY,
    charger_id UUID NOT NULL,
    connector_type VARCHAR(20) NOT NULL,
    max_power_kw NUMERIC(8, 2),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicle_read_models (
    vehicle_id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    plate_number VARCHAR(20) NOT NULL,
    connector_type VARCHAR(20),
    model_label VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_debt_read_models (
    user_id UUID PRIMARY KEY,
    has_outstanding_debt BOOLEAN NOT NULL DEFAULT false,
    arrears_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_debt_outstanding ON user_debt_read_models (has_outstanding_debt) WHERE has_outstanding_debt = true;

CREATE TABLE user_read_models (
    user_id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_read_models (
    booking_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    charger_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    qr_token VARCHAR(40),
    deposit_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
    deposit_transaction_id UUID,
    connector_type VARCHAR(20),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brm_user ON booking_read_models (user_id);
CREATE INDEX idx_brm_charger ON booking_read_models (charger_id);
CREATE INDEX idx_brm_qr ON booking_read_models (qr_token) WHERE qr_token IS NOT NULL;
CREATE INDEX idx_brm_charger_start ON booking_read_models (charger_id, start_time);

-- Event outbox / Processing
CREATE TABLE event_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status event_outbox_status_enum NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    retry_count SMALLINT NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE INDEX idx_outbox_pending ON event_outbox (status, created_at) WHERE status = 'pending';

CREATE TABLE processed_events (
    event_id VARCHAR(100) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert schema
    }
}
