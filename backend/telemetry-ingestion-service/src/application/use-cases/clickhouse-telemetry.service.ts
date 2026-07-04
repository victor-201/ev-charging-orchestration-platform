import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';

/**
 * ClickHouseTelemetryService
 *
 * Writes telemetry data (V/A/kW) to ClickHouse instead of PostgreSQL.
 * ClickHouse is optimized for time-series data, capable of inserting millions
 * of records per second without system degradation.
 *
 * Table: telemetry_logs (partitioned by toYYYYMMDD(recorded_at))
 *
 * Fallback: If ClickHouse is unavailable, logs are captured and processing continues
 * (must not block the primary RabbitMQ event stream).
 */
@Injectable()
export class ClickHouseTelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickHouseTelemetryService.name);
  private client: ClickHouseClient | null = null;
  private connected = false;
  private readonly BATCH_BUFFER: TelemetryRow[] = [];
  private readonly MAX_BATCH = 100;
  private readonly FLUSH_INTERVAL_MS = 5_000;
  private flushTimer: NodeJS.Timeout | null = null;
  private _database: string = 'ev_telemetry';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url      = this.config.get<string>('CLICKHOUSE_URL', 'http://localhost:8123');
    const database = this.config.get<string>('CLICKHOUSE_DATABASE', 'ev_telemetry');
    const username = this.config.get<string>('CLICKHOUSE_USER', 'default');
    const password = this.config.get<string>('CLICKHOUSE_PASSWORD', '');

    this._database = database;

    try {
      // Step 1: Connect WITHOUT database first so DDL (CREATE DATABASE) works
      this.client = createClient({ url, username, password });
      await this.client.ping();
      this.logger.log(`ClickHouse ping OK: ${url}`);

      // Step 2: Ensure database exists (no database context required for DDL)
      await this.ensureTable();

      // Step 3: Reconnect WITH the database context for queries
      await this.client.close();
      this.client = createClient({ url, database, username, password });
      await this.client.ping();

      this.connected = true;
      this.logger.log(`ClickHouse connected: ${url} database=${database}`);

      this.flushTimer = setInterval(() => this.flushBatch(), this.FLUSH_INTERVAL_MS);
    } catch (err: any) {
      this.connected = false;
      this.logger.warn(
        `ClickHouse not available (${err?.message ?? err}). Telemetry will only be published to RabbitMQ.`,
      );
      this.client = null;
    }
  }

  private async ensureTable(): Promise<void> {
    if (!this.client) return;

    await this.client.command({
      query: `CREATE DATABASE IF NOT EXISTS ev_telemetry;`,
    });

    await this.client.command({
      query: `
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
      `,
    });

    this.logger.log('ClickHouse table telemetry_logs ensured');
  }

   /**
   * Add a record to the buffer.
   * Flushes immediately when buffer reaches MAX_BATCH.
   */
  async ingest(row: TelemetryRow): Promise<void> {
    if (!this.client) return;

    this.BATCH_BUFFER.push(row);

    if (this.BATCH_BUFFER.length >= this.MAX_BATCH) {
      await this.flushBatch();
    }
  }

  /** Flush buffer to ClickHouse via batch insert. */
  async flushBatch(): Promise<void> {
    if (!this.client || this.BATCH_BUFFER.length === 0) return;

    const batch = this.BATCH_BUFFER.splice(0, this.BATCH_BUFFER.length);

    try {
      await this.client.insert({
        table:  'telemetry_logs',
        values: batch.map((r) => ({
          event_id:           r.eventId,
          charger_id:         r.chargerId,
          session_id:         r.sessionId,
          power_kw:           r.powerKw      ?? null,
          current_a:          r.currentA     ?? null,
          voltage_v:          r.voltageV     ?? null,
          meter_wh:           r.meterWh      ?? null,
          soc_percent:        r.socPercent   ?? null,
          temperature_c:      r.temperatureC ?? null,
          error_code:         r.errorCode    ?? null,
          hardware_timestamp: this.formatDateForClickHouse(r.hardwareTimestamp ?? r.recordedAt),
        })),
        format: 'JSONEachRow',
      });

      this.logger.debug(`ClickHouse batch inserted: ${batch.length} records`);
    } catch (err: any) {
      this.logger.error(`ClickHouse batch insert failed: ${err?.message ?? err}`);
    }
  }

   /**
   * Query sampled time-series data for analytics.
   */
  async getSessionTimeSeries(
    sessionId: string,
    intervalSeconds = 30,
  ): Promise<TimeSeriesPoint[]> {
    if (!this.client) return [];

    try {
      const result = await this.client.query({
        query: `
          SELECT
            toUnixTimestamp64Milli(
              toStartOfInterval(hardware_timestamp, INTERVAL {interval:UInt32} SECOND)
            )                                        AS ts,
            avg(power_kw)                            AS avg_power_kw,
            avg(current_a)                           AS avg_current_a,
            avg(voltage_v)                           AS avg_voltage_v,
            max(meter_wh)                            AS max_meter_wh,
            avg(soc_percent)                         AS avg_soc_percent
          FROM telemetry_logs
          WHERE session_id = {session_id:String}
          GROUP BY ts
          ORDER BY ts ASC
        `,
        query_params: {
          session_id: sessionId,
          interval:   intervalSeconds,
        },
        format: 'JSONEachRow',
      });

      return (await result.json()) as TimeSeriesPoint[];
    } catch (err: any) {
      this.logger.error(`ClickHouse getSessionTimeSeries failed: ${err?.message ?? err}`);
      return [];
    }
  }

  async getSessionEnergyKwh(sessionId: string): Promise<number> {
    if (!this.client) return 0;

    try {
      const result = await this.client.query({
        query: `
          SELECT (max(meter_wh) - min(meter_wh)) / 1000 AS total_kwh
          FROM telemetry_logs
          WHERE session_id = {session_id:String}
        `,
        query_params: { session_id: sessionId },
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as Array<{ total_kwh: number }>;
      return rows[0]?.total_kwh ?? 0;
    } catch {
      return 0;
    }
  }

  async getLatestReading(chargerId: string): Promise<TelemetryRow | null> {
    if (!this.client) return null;

    try {
      const result = await this.client.query({
        query: `
          SELECT
            event_id, charger_id, session_id,
            power_kw, current_a, voltage_v, meter_wh,
            soc_percent, temperature_c, error_code,
            hardware_timestamp, received_at
          FROM telemetry_logs
          WHERE charger_id = {charger_id:String}
          ORDER BY hardware_timestamp DESC
          LIMIT 1
        `,
        query_params: { charger_id: chargerId },
        format: 'JSONEachRow',
      });
      const rows = (await result.json()) as any[];
      if (!rows.length) return null;
      const r = rows[0];
      return {
        eventId:           r.event_id,
        chargerId:         r.charger_id,
        sessionId:         r.session_id,
        powerKw:           r.power_kw,
        currentA:          r.current_a,
        voltageV:          r.voltage_v,
        meterWh:           r.meter_wh,
        socPercent:        r.soc_percent,
        temperatureC:      r.temperature_c,
        errorCode:         r.error_code,
        hardwareTimestamp: r.hardware_timestamp,
        recordedAt:        r.received_at,
      };
    } catch (err: any) {
      this.logger.error(`ClickHouse getLatestReading failed: ${err?.message ?? err}`);
      return null;
    }
  }

  private formatDateForClickHouse(val: string | Date | null | undefined): string | null {
    if (!val) return null;
    const date = typeof val === 'string' ? new Date(val) : val;
    if (isNaN(date.getTime())) return null;

    // Convert to Asia/Ho_Chi_Minh (UTC+7)
    const tzOffset = 7 * 60 * 60 * 1000; // 7 hours in ms
    const localDate = new Date(date.getTime() + tzOffset);

    const yyyy = localDate.getUTCFullYear();
    const mm = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(localDate.getUTCDate()).padStart(2, '0');
    const hh = String(localDate.getUTCHours()).padStart(2, '0');
    const min = String(localDate.getUTCMinutes()).padStart(2, '0');
    const sec = String(localDate.getUTCSeconds()).padStart(2, '0');
    const ms = String(localDate.getUTCMilliseconds()).padStart(3, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}.${ms}`;
  }

  getConnectionStatus(): { connected: boolean; database: string; bufferedRows: number } {
    return {
      connected:   this.connected,
      database:    this._database,
      bufferedRows: this.BATCH_BUFFER.length,
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flushBatch();
    await this.client?.close();
    this.connected = false;
  }
}

// Types

export interface TelemetryRow {
  eventId:            string;
  chargerId:          string;
  sessionId:          string;
  powerKw?:           number | null;
  currentA?:          number | null;
  voltageV?:          number | null;
  meterWh?:           number | null;
  socPercent?:        number | null;
  temperatureC?:      number | null;
  errorCode?:         string | null;
  hardwareTimestamp?: string | null;
  recordedAt:         string;
}

export interface TimeSeriesPoint {
  ts:              number;
  avg_power_kw:    number;
  avg_current_a:   number;
  avg_voltage_v:   number;
  max_meter_wh:    number;
  avg_soc_percent: number;
}
