import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import {
  ClickHouseTelemetryService,
  TelemetryRow,
} from '../../src/application/use-cases/clickhouse-telemetry.service';


// ─── Mock @clickhouse/client ─────────────────────────────────────────────────

const mockCommand = jest.fn().mockResolvedValue(undefined);
const mockExec    = jest.fn().mockResolvedValue(undefined);
const mockInsert  = jest.fn().mockResolvedValue(undefined);
const mockQuery   = jest.fn();
const mockPing    = jest.fn().mockResolvedValue(true);
const mockClose   = jest.fn().mockResolvedValue(undefined);

jest.mock('@clickhouse/client', () => ({
  createClient: jest.fn(() => ({
    ping:    mockPing,
    command: mockCommand,
    exec:    mockExec,
    insert:  mockInsert,
    query:   mockQuery,
    close:   mockClose,
  })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRow(overrides: Partial<TelemetryRow> = {}): TelemetryRow {
  return {
    eventId:    'evt-001',
    chargerId:  'charger-abc',
    sessionId:  'session-xyz',
    powerKw:    22.5,
    currentA:   32.0,
    voltageV:   230.0,
    meterWh:    5000,
    socPercent: 75,
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Track instances to destroy them
const activeServices: ClickHouseTelemetryService[] = [];

async function buildService(overrides: Record<string, string> = {}): Promise<ClickHouseTelemetryService> {
  const configValues: Record<string, string> = {
    CLICKHOUSE_URL:      'http://localhost:8123',
    CLICKHOUSE_DATABASE: 'ev_telemetry',
    CLICKHOUSE_USER:     'default',
    CLICKHOUSE_PASSWORD: '',
    ...overrides,
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ClickHouseTelemetryService,
      {
        provide:  ConfigService,
        useValue: { get: (key: string, def?: string) => configValues[key] ?? def },
      },
    ],
  }).compile();

  const svc = module.get(ClickHouseTelemetryService);
  activeServices.push(svc);
  return svc;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClickHouseTelemetryService – Unit Tests', () => {

  beforeAll(() => {
    // Suppress logs during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup any leaked timers
    while (activeServices.length > 0) {
      const svc = activeServices.pop();
      if (svc) await svc.onModuleDestroy();
    }
  });

  // ── onModuleInit ────────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('connects, pings, and ensures table on init', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      // 2 pings: initial (no db) + after reconnect (with db context)
      expect(mockPing).toHaveBeenCalledTimes(2);
      // command called twice: CREATE DATABASE + CREATE TABLE
      expect(mockCommand).toHaveBeenCalledTimes(2);
      // close once before reconnecting
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(svc.getConnectionStatus().connected).toBe(true);
    });

    it('sets connected=false when ping throws', async () => {
      mockPing.mockRejectedValueOnce(new Error('connection refused'));
      const svc = await buildService();
      await svc.onModuleInit();

      expect(svc.getConnectionStatus().connected).toBe(false);
    });
  });

  // ── getConnectionStatus ──────────────────────────────────────────────────────

  describe('getConnectionStatus()', () => {
    it('returns correct initial state (not yet initialized)', async () => {
      const svc = await buildService();
      // Before onModuleInit
      const status = svc.getConnectionStatus();
      expect(status.connected).toBe(false);
      expect(status.database).toBe('ev_telemetry');
      expect(status.bufferedRows).toBe(0);
    });

    it('reports bufferedRows correctly', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      await svc.ingest(buildRow());
      await svc.ingest(buildRow({ eventId: 'evt-002' }));
      expect(svc.getConnectionStatus().bufferedRows).toBe(2);
    });
  });

  // ── ingest ───────────────────────────────────────────────────────────────────

  describe('ingest()', () => {
    it('adds row to buffer (does NOT flush until MAX_BATCH)', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      await svc.ingest(buildRow());

      expect(mockInsert).not.toHaveBeenCalled();
      expect(svc.getConnectionStatus().bufferedRows).toBe(1);
    });

    it('auto-flushes when MAX_BATCH (100) is reached', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      for (let i = 0; i < 100; i++) {
        await svc.ingest(buildRow({ eventId: `evt-${i}` }));
      }

      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(svc.getConnectionStatus().bufferedRows).toBe(0);

      const callArgs = mockInsert.mock.calls[0][0];
      expect(callArgs.table).toBe('telemetry_logs');
      expect(callArgs.values).toHaveLength(100);
      expect(callArgs.format).toBe('JSONEachRow');
    });

    it('does nothing when ClickHouse is not connected', async () => {
      mockPing.mockRejectedValueOnce(new Error('offline'));
      const svc = await buildService();
      await svc.onModuleInit();

      await svc.ingest(buildRow());

      expect(svc.getConnectionStatus().bufferedRows).toBe(0);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // ── flushBatch ────────────────────────────────────────────────────────────────

  describe('flushBatch()', () => {
    it('inserts all buffered rows and clears buffer', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      await svc.ingest(buildRow({ eventId: 'e1' }));
      await svc.ingest(buildRow({ eventId: 'e2' }));
      await svc.flushBatch();

      expect(mockInsert).toHaveBeenCalledTimes(1);
      const values = mockInsert.mock.calls[0][0].values;
      expect(values).toHaveLength(2);
      expect(svc.getConnectionStatus().bufferedRows).toBe(0);
    });

    it('maps row fields to snake_case ClickHouse columns', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      const row = buildRow({
        eventId:    'e1',
        chargerId:  'ch-1',
        sessionId:  'sess-1',
        powerKw:    7.4,
        currentA:   32,
        voltageV:   230,
        meterWh:    12000,
        socPercent: 80,
        temperatureC: 35,
        errorCode:  null,
        hardwareTimestamp: '2025-01-01T00:00:00Z',
        recordedAt: '2025-01-01T00:00:01Z',
      });

      await svc.ingest(row);
      await svc.flushBatch();

      const inserted = mockInsert.mock.calls[0][0].values[0];
      expect(inserted.event_id).toBe('e1');
      expect(inserted.charger_id).toBe('ch-1');
      expect(inserted.session_id).toBe('sess-1');
      expect(inserted.power_kw).toBe(7.4);
      expect(inserted.current_a).toBe(32);
      expect(inserted.voltage_v).toBe(230);
      expect(inserted.meter_wh).toBe(12000);
      expect(inserted.soc_percent).toBe(80);
      expect(inserted.temperature_c).toBe(35);
      expect(inserted.error_code).toBeNull();
      expect(inserted.hardware_timestamp).toBe('2025-01-01 07:00:00.000');
    });

    it('uses recordedAt as hardware_timestamp fallback when hardwareTimestamp is null', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      const row = buildRow({ hardwareTimestamp: null, recordedAt: '2025-06-01T12:00:00Z' });
      await svc.ingest(row);
      await svc.flushBatch();

      const inserted = mockInsert.mock.calls[0][0].values[0];
      expect(inserted.hardware_timestamp).toBe('2025-06-01 19:00:00.000');
    });

    it('does nothing if buffer is empty', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      await svc.flushBatch();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('does not throw if ClickHouse insert fails (non-blocking)', async () => {
      const svc = await buildService();
      await svc.onModuleInit();
      mockInsert.mockRejectedValueOnce(new Error('insert timeout'));

      await svc.ingest(buildRow());
      await expect(svc.flushBatch()).resolves.not.toThrow();
    });
  });

  // ── getSessionTimeSeries ──────────────────────────────────────────────────────

  describe('getSessionTimeSeries()', () => {
    it('returns parsed time-series points', async () => {
      const points = [
        { ts: 1700000000000, avg_power_kw: 22, avg_current_a: 30, avg_voltage_v: 230, max_meter_wh: 10000, avg_soc_percent: 75 },
      ];
      mockQuery.mockResolvedValueOnce({ json: async () => points });

      const svc = await buildService();
      await svc.onModuleInit();

      const result = await svc.getSessionTimeSeries('sess-1', 30);
      expect(result).toEqual(points);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const queryArg = mockQuery.mock.calls[0][0];
      expect(queryArg.query_params.session_id).toBe('sess-1');
      expect(queryArg.query_params.interval).toBe(30);
    });

    it('returns [] when ClickHouse is disconnected', async () => {
      mockPing.mockRejectedValueOnce(new Error('offline'));
      const svc = await buildService();
      await svc.onModuleInit();

      const result = await svc.getSessionTimeSeries('sess-1');
      expect(result).toEqual([]);
    });

    it('returns [] on query error (non-throwing)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('query failed'));
      const svc = await buildService();
      await svc.onModuleInit();

      const result = await svc.getSessionTimeSeries('sess-1');
      expect(result).toEqual([]);
    });
  });

  // ── getSessionEnergyKwh ───────────────────────────────────────────────────────

  describe('getSessionEnergyKwh()', () => {
    it('returns computed kWh value', async () => {
      mockQuery.mockResolvedValueOnce({ json: async () => [{ total_kwh: 18.5 }] });
      const svc = await buildService();
      await svc.onModuleInit();

      const kwh = await svc.getSessionEnergyKwh('sess-1');
      expect(kwh).toBe(18.5);
    });

    it('returns 0 when no rows found', async () => {
      mockQuery.mockResolvedValueOnce({ json: async () => [] });
      const svc = await buildService();
      await svc.onModuleInit();

      const kwh = await svc.getSessionEnergyKwh('sess-1');
      expect(kwh).toBe(0);
    });

    it('returns 0 on error (non-throwing)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('query failed'));
      const svc = await buildService();
      await svc.onModuleInit();

      const kwh = await svc.getSessionEnergyKwh('sess-1');
      expect(kwh).toBe(0);
    });

    it('returns 0 when disconnected', async () => {
      mockPing.mockRejectedValueOnce(new Error('offline'));
      const svc = await buildService();
      await svc.onModuleInit();

      expect(await svc.getSessionEnergyKwh('sess-1')).toBe(0);
    });
  });

  // ── getLatestReading ──────────────────────────────────────────────────────────

  describe('getLatestReading()', () => {
    it('returns mapped TelemetryRow for matching charger', async () => {
      const fakeRow = {
        event_id: 'e1', charger_id: 'ch-1', session_id: 's-1',
        power_kw: 22.5, current_a: 32, voltage_v: 230, meter_wh: 5000,
        soc_percent: 80, temperature_c: 35, error_code: null,
        hardware_timestamp: '2025-01-01T00:00:00Z',
        received_at: '2025-01-01T00:00:01Z',
      };
      mockQuery.mockResolvedValueOnce({ json: async () => [fakeRow] });

      const svc = await buildService();
      await svc.onModuleInit();

      const result = await svc.getLatestReading('ch-1');
      expect(result).not.toBeNull();
      expect(result!.chargerId).toBe('ch-1');
      expect(result!.powerKw).toBe(22.5);
      expect(result!.recordedAt).toBe('2025-01-01T00:00:01Z');
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ json: async () => [] });
      const svc = await buildService();
      await svc.onModuleInit();

      const result = await svc.getLatestReading('ch-unknown');
      expect(result).toBeNull();
    });

    it('returns null when disconnected', async () => {
      mockPing.mockRejectedValueOnce(new Error('offline'));
      const svc = await buildService();
      await svc.onModuleInit();

      expect(await svc.getLatestReading('ch-1')).toBeNull();
    });
  });

  // ── onModuleDestroy ─────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('flushes remaining buffer and closes connection', async () => {
      const svc = await buildService();
      await svc.onModuleInit();

      await svc.ingest(buildRow());
      await svc.onModuleDestroy();

      expect(mockInsert).toHaveBeenCalledTimes(1); // flushed remaining
      expect(mockClose).toHaveBeenCalledTimes(2); // reconnect close + destroy close
      expect(svc.getConnectionStatus().connected).toBe(false);
    });

    it('does not throw if called before init', async () => {
      const svc = await buildService();
      await expect(svc.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
