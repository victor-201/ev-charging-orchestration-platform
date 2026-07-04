CREATE DATABASE IF NOT EXISTS ev_telemetry;

CREATE TABLE IF NOT EXISTS ev_telemetry.telemetry_logs (
  event_id           String,
  charger_id         String,
  session_id         String,
  power_kw           Nullable(Float32),
  current_a          Nullable(Float32),
  voltage_v          Nullable(Float32),
  meter_wh           Nullable(Float64),
  soc_percent        Nullable(Float32),
  temperature_c      Nullable(Float32),
  error_code         Nullable(String),
  hardware_timestamp DateTime64(3, 'Asia/Ho_Chi_Minh'),
  received_at        DateTime64(3, 'Asia/Ho_Chi_Minh') DEFAULT now64()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(hardware_timestamp)
ORDER BY (charger_id, hardware_timestamp)
TTL toDateTime(hardware_timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;
