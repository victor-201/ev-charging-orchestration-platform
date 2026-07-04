/**
 * Integration test - ClickHouse + telemetry-ingestion-service
 *
 * Requirement: ClickHouse is running at CLICKHOUSE_TEST_URL (default http://localhost:8123)
 * Run with Docker: npm run test:integration
 * Run local:       CLICKHOUSE_TEST_URL=http://localhost:8123 npm run test:integration
 *
 * Auto SKIP (not FAIL) when ClickHouse is unavailable - CI-friendly.
 */

import { createClient, ClickHouseClient } from '@clickhouse/client';
import * as fs from 'fs';
import * as path from 'path';

// Load .env file if available
try {
  const envPath = path.join(__dirname, '../../../../deployment/docker/.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        // Remove surrounding quotes if any
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  // ignore
}

const CLICKHOUSE_URL = process.env.CLICKHOUSE_TEST_URL ?? process.env.CLICKHOUSE_URL ?? 'http://localhost:8123';
const TEST_DB        = 'ev_telemetry_test';
const TEST_TABLE     = `${TEST_DB}.telemetry_logs_test`;

// Connectivity check BEFORE describing tests
// We run a synchronous-style check using a module-level promise resolved in globalSetup-like
// pattern. Jest allows async module-level state via beforeAll.

let client: ClickHouseClient;
let chAvailable = false; // Set in the first beforeAll of outer describe

// Suite

describe('ClickHouse Integration - ev_telemetry_test', () => {

  // Lifecycle

  beforeAll(async () => {
    const username = process.env.CLICKHOUSE_USER ?? 'default';
    const password = process.env.CLICKHOUSE_PASSWORD ?? '';
    client = createClient({
      url: CLICKHOUSE_URL,
      database: 'default',
      username,
      password,
    });
    try {
      const pingResult = await client.ping();
      chAvailable = pingResult.success;
    } catch {
      chAvailable = false;
    }

    if (!chAvailable) {
      console.warn(
        `\n  [WARNING] ClickHouse not reachable at ${CLICKHOUSE_URL}\n` +
        `     All integration tests will be SKIPPED (not failed).\n` +
        `     Start ClickHouse with: docker compose -f deployment/docker/docker-compose.yml up -d clickhouse\n`,
      );
      return;
    }

    // Create test DB and table
    await client.command({ query: `CREATE DATABASE IF NOT EXISTS ${TEST_DB}` });
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${TEST_TABLE} (
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
        SETTINGS index_granularity = 8192
      `,
    });
  }, 30_000);

  afterAll(async () => {
    if (chAvailable) {
      await client.command({ query: `DROP TABLE IF EXISTS ${TEST_TABLE}` }).catch(() => {});
      await client.close().catch(() => {});
    }
  });

  beforeEach(async () => {
    if (!chAvailable) return;
    await client.command({ query: `TRUNCATE TABLE ${TEST_TABLE}` }).catch(() => {});
  });

  // Helper: skip if ClickHouse not available

  function skip(): boolean {
    if (!chAvailable) {
      console.log('    -> skipped (ClickHouse not available)');
      return true;
    }
    return false;
  }

  // Helper: insert rows and wait for MergeTree visibility

  async function insertRows(rows: object[]) {
    await client.insert({ table: TEST_TABLE, values: rows, format: 'JSONEachRow' });
    await new Promise((r) => setTimeout(r, 500)); // MergeTree flush delay
  }

  async function countRows(): Promise<number> {
    const result = await client.query({
      query:  `SELECT count() AS cnt FROM ${TEST_TABLE}`,
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<{ cnt: string }>;
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }

  // TESTS

  // Connection

  it('pings ClickHouse successfully', async () => {
    if (skip()) return;
    const ok = await client.ping();
    expect(ok.success).toBe(true);
  });

  it('test database and table exist', async () => {
    if (skip()) return;
    const result = await client.query({
      query:  `SELECT name FROM system.tables WHERE database = '${TEST_DB}' AND name = 'telemetry_logs_test'`,
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('telemetry_logs_test');
  });

  // Insert

  it('inserts single row and reads it back', async () => {
    if (skip()) return;
    await insertRows([{
      event_id:           'test-evt-001',
      charger_id:         'charger-A',
      session_id:         'session-1',
      power_kw:           22.5,
      current_a:          32.0,
      voltage_v:          230.0,
      meter_wh:           10000,
      soc_percent:        75,
      temperature_c:      35,
      error_code:         null,
      hardware_timestamp: '2025-01-15 10:00:00.000',
    }]);
    expect(await countRows()).toBe(1);
  });

  it('inserts batch of 100 rows', async () => {
    if (skip()) return;
    const rows = Array.from({ length: 100 }, (_, i) => ({
      event_id:           `batch-evt-${i}`,
      charger_id:         'charger-B',
      session_id:         'session-batch',
      power_kw:           Math.random() * 50,
      current_a:          Math.random() * 63,
      voltage_v:          230,
      meter_wh:           i * 100,
      soc_percent:        Math.min(100, i),
      temperature_c:      25 + Math.random() * 10,
      error_code:         null,
      hardware_timestamp: `2025-01-15 ${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000`,
    }));
    await insertRows(rows);
    expect(await countRows()).toBe(100);
  });

  it('inserts rows with null optional fields and error_code', async () => {
    if (skip()) return;
    await insertRows([{
      event_id:           'null-fields-evt',
      charger_id:         'charger-C',
      session_id:         'session-2',
      power_kw:           null,
      current_a:          null,
      voltage_v:          null,
      meter_wh:           null,
      soc_percent:        null,
      temperature_c:      null,
      error_code:         'E_COMM_TIMEOUT',
      hardware_timestamp: '2025-01-15 11:00:00.000',
    }]);
    const result = await client.query({
      query:  `SELECT error_code, power_kw FROM ${TEST_TABLE} WHERE event_id = 'null-fields-evt'`,
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].error_code).toBe('E_COMM_TIMEOUT');
    expect(rows[0].power_kw).toBeNull();
  });

  // Queries

  it('computes total kWh for a session correctly', async () => {
    if (skip()) return;
    await insertRows([
      { event_id: 'e1', charger_id: 'ch', session_id: 'sess-kwh', power_kw: 22, current_a: 32, voltage_v: 230, meter_wh: 0,     soc_percent: 10, temperature_c: 30, error_code: null, hardware_timestamp: '2025-01-15 09:00:00.000' },
      { event_id: 'e2', charger_id: 'ch', session_id: 'sess-kwh', power_kw: 22, current_a: 32, voltage_v: 230, meter_wh: 11000, soc_percent: 60, temperature_c: 30, error_code: null, hardware_timestamp: '2025-01-15 09:30:00.000' },
      { event_id: 'e3', charger_id: 'ch', session_id: 'sess-kwh', power_kw: 22, current_a: 32, voltage_v: 230, meter_wh: 22000, soc_percent: 90, temperature_c: 30, error_code: null, hardware_timestamp: '2025-01-15 10:00:00.000' },
    ]);
    const result = await client.query({
      query:  `SELECT (max(meter_wh) - min(meter_wh)) / 1000 AS total_kwh FROM ${TEST_TABLE} WHERE session_id = {session_id:String}`,
      query_params: { session_id: 'sess-kwh' },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<{ total_kwh: number }>;
    expect(rows[0].total_kwh).toBeCloseTo(22, 1);
  });

  it('retrieves latest reading by charger ordered by hardware_timestamp', async () => {
    if (skip()) return;
    await insertRows([
      { event_id: 'old', charger_id: 'ch-latest', session_id: 's1', power_kw: 10, current_a: 15, voltage_v: 230, meter_wh: 100,  soc_percent: 20, temperature_c: 25, error_code: null, hardware_timestamp: '2025-01-15 08:00:00.000' },
      { event_id: 'new', charger_id: 'ch-latest', session_id: 's1', power_kw: 50, current_a: 63, voltage_v: 400, meter_wh: 5000, soc_percent: 80, temperature_c: 40, error_code: null, hardware_timestamp: '2025-01-15 09:00:00.000' },
    ]);
    const result = await client.query({
      query:  `SELECT event_id, power_kw FROM ${TEST_TABLE} WHERE charger_id = {charger_id:String} ORDER BY hardware_timestamp DESC LIMIT 1`,
      query_params: { charger_id: 'ch-latest' },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as any[];
    expect(rows[0].event_id).toBe('new');
    expect(rows[0].power_kw).toBeCloseTo(50, 0);
  });

  it('returns 0 rows for unknown session', async () => {
    if (skip()) return;
    const result = await client.query({
      query:  `SELECT count() AS cnt FROM ${TEST_TABLE} WHERE session_id = {sid:String}`,
      query_params: { sid: 'non-existent-session-id' },
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<{ cnt: string }>;
    expect(parseInt(rows[0].cnt, 10)).toBe(0);
  });

  // Schema

  it('table has correct column types', async () => {
    if (skip()) return;
    const result = await client.query({
      query:  `SELECT name, type FROM system.columns WHERE database = '${TEST_DB}' AND table = 'telemetry_logs_test' ORDER BY name`,
      format: 'JSONEachRow',
    });
    const cols = (await result.json()) as Array<{ name: string; type: string }>;
    const colMap = Object.fromEntries(cols.map((c) => [c.name, c.type]));

    expect(colMap['event_id']).toBe('String');
    expect(colMap['charger_id']).toBe('String');
    expect(colMap['session_id']).toBe('String');
    expect(colMap['power_kw']).toBe('Nullable(Float32)');
    expect(colMap['meter_wh']).toBe('Nullable(Float64)');
    expect(colMap['hardware_timestamp']).toContain('DateTime64');
  });
});
