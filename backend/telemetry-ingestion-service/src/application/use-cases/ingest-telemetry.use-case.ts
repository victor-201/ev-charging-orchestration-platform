import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { TelemetryReadingVO } from '../../domain/value-objects/telemetry-reading.vo';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseTelemetryService } from './clickhouse-telemetry.service';

/**
 * TelemetryBuffer - in-memory sliding buffer per charger.
 *
 * Purpose: accumulate readings before flushing to downstream services.
 * Flush triggers: batch size >= BATCH_SIZE or timer (handled by IngestUseCase).
 */
export interface BufferedReading {
  reading:    TelemetryReadingVO;
  receivedAt: Date;
}

@Injectable()
export class TelemetryBuffer {
  private readonly buffers = new Map<string, BufferedReading[]>();
  private readonly BATCH_SIZE = 10;

  push(reading: TelemetryReadingVO): BufferedReading[] | null {
    const key = reading.chargerId;
    if (!this.buffers.has(key)) {
      this.buffers.set(key, []);
    }
    const buf = this.buffers.get(key)!;
    buf.push({ reading, receivedAt: new Date() });

    if (buf.length >= this.BATCH_SIZE) {
      return this.flush(key);
    }
    return null;
  }

  flush(chargerId: string): BufferedReading[] {
    const buf = this.buffers.get(chargerId) ?? [];
    this.buffers.set(chargerId, []);
    return buf;
  }

  flushAll(): Map<string, BufferedReading[]> {
    const result = new Map<string, BufferedReading[]>();
    for (const [key, buf] of this.buffers.entries()) {
      if (buf.length > 0) {
        result.set(key, [...buf]);
        this.buffers.set(key, []);
      }
    }
    return result;
  }

  getBufferSizes(): Record<string, number> {
    const sizes: Record<string, number> = {};
    for (const [key, buf] of this.buffers.entries()) {
      sizes[key] = buf.length;
    }
    return sizes;
  }
}



/**
 * IngestTelemetryUseCase
 *
 * Scope responsibilities:
 *  1. Receive raw telemetry from charger (HTTP or MQTT bridge)
 *  2. Validate & normalize readings via TelemetryReadingVO
 *  3. Buffer data in-memory (TelemetryBuffer)
 *  4. Publish normalized event to RabbitMQ (routing key: telemetry.ingested)
 *     -> consumed by charging-service (session update) and analytics-service (metrics)
 */
@Injectable()
export class IngestTelemetryUseCase {
  private readonly logger = new Logger(IngestTelemetryUseCase.name);

  constructor(
    private readonly buffer:     TelemetryBuffer,
    private readonly amqp:       AmqpConnection,
    private readonly clickHouse: ClickHouseTelemetryService,
  ) {}

  async execute(raw: {
    chargerId:         string;
    sessionId:         string;
    powerKw?:          number;
    currentA?:         number;
    voltageV?:         number;
    meterWh?:          number;
    socPercent?:       number;
    temperatureC?:     number;
    errorCode?:        string;
    hardwareTimestamp?: string;   // ISO string from hardware (Task 5.1 Offline Resilience)
  }): Promise<{ accepted: boolean; eventId: string; errors: string[] }> {

    // Step 1: Create VO (structure validation)
    let vo: TelemetryReadingVO;
    try {
      vo = new TelemetryReadingVO(raw);
    } catch (err: any) {
      this.logger.warn(`Telemetry rejected from charger ${raw.chargerId}: ${err.message}`);
      return { accepted: false, eventId: '', errors: [err.message] };
    }

    // Step 2: Range validation
    const errors = vo.validate();
    if (errors.length > 0) {
      this.logger.warn(`Telemetry range errors [${raw.chargerId}]: ${errors.join(', ')}`);
      // Normalize (clamp) rather than reject — continue with normalized reading
    }

    // Step 3: Normalize sensor values
    const normalized = vo.normalize();

    // Step 4: Buffer & possibly batch-publish
    const flushed = this.buffer.push(normalized);
    const eventId = uuidv4();

    // Always publish individual normalized reading immediately for real-time telemetry
    await this.publishSingle(normalized, eventId, raw.hardwareTimestamp);

    if (flushed && flushed.length > 0) {
      await this.publishBatch(flushed, eventId);
    }

    // Task 3.2: Async ingest to ClickHouse (non-blocking)
    this.clickHouse.ingest({
      eventId,
      chargerId:         normalized.chargerId,
      sessionId:         normalized.sessionId,
      powerKw:           normalized.powerKw,
      currentA:          normalized.currentA,
      voltageV:          normalized.voltageV,
      meterWh:           normalized.meterWh,
      socPercent:        normalized.socPercent,
      temperatureC:      normalized.temperatureC,
      errorCode:         normalized.errorCode,
      hardwareTimestamp: raw.hardwareTimestamp ?? null,
      recordedAt:        new Date().toISOString(),
    }).catch((err) => this.logger.error(`ClickHouse ingest error: ${err.message}`));

    return { accepted: true, eventId, errors };
  }

  /** Flush all buffers immediately (called by periodic job) */
  async flushAll(): Promise<number> {
    const all = this.buffer.flushAll();
    let published = 0;
    for (const [, readings] of all.entries()) {
      if (readings.length > 0) {
        await this.publishBatch(readings, uuidv4());
        published += readings.length;
      }
    }
    return published;
  }

  private async publishSingle(
    reading: TelemetryReadingVO,
    eventId: string,
    hardwareTimestamp?: string,
  ): Promise<void> {
    try {
      await this.amqp.publish('ev.telemetry', 'telemetry.ingested', {
        eventId,
        eventType:          'telemetry.ingested',
        chargerId:          reading.chargerId,
        sessionId:          reading.sessionId,
        powerKw:            reading.powerKw,
        currentA:           reading.currentA,
        voltageV:           reading.voltageV,
        meterWh:            reading.meterWh,
        socPercent:         reading.socPercent,
        temperatureC:       reading.temperatureC,
        errorCode:          reading.errorCode,
        hardwareTimestamp:  hardwareTimestamp ?? null,
        recordedAt:         reading.recordedAt.toISOString(),
        publishedAt:        new Date().toISOString(),
      });
    } catch (err: any) {
      this.logger.error(`Failed to publish telemetry event: ${err.message}`);
    }
  }

  private async publishBatch(readings: { reading: TelemetryReadingVO }[], batchId: string): Promise<void> {
    try {
      await this.amqp.publish('ev.telemetry', 'telemetry.batch', {
        batchId,
        eventType:   'telemetry.batch',
        count:       readings.length,
        readings:    readings.map(r => ({
          chargerId:    r.reading.chargerId,
          sessionId:    r.reading.sessionId,
          powerKw:      r.reading.powerKw,
          currentA:     r.reading.currentA,
          voltageV:     r.reading.voltageV,
          meterWh:      r.reading.meterWh,
          socPercent:   r.reading.socPercent,
          temperatureC: r.reading.temperatureC,
          errorCode:    r.reading.errorCode,
          recordedAt:   r.reading.recordedAt.toISOString(),
        })),
        publishedAt:  new Date().toISOString(),
      });
      this.logger.log(`Batch published: batchId=${batchId} count=${readings.length}`);
    } catch (err: any) {
      this.logger.error(`Failed to publish telemetry batch: ${err.message}`);
    }
  }
}
