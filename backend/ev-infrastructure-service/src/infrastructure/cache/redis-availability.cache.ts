import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import Redis                  from 'ioredis';

/**
 * Redis Availability Cache — EV Infrastructure Service
 *
 * Key pattern:
 *   ev:infra:charger:status:{chargerId}      → { status, updatedAt }   TTL 60s
 *   ev:infra:station:available:{stationId}   → number                  TTL 30s
 *   ev:infra:stations:list:{hash}            → JSON array              TTL 300s
 *   ev:infra:station:detail:{stationId}      → JSON object             TTL 300s
 *   ev:infra:geo:index                       → Redis Geo Set (persist)
 *   ev:infra:lock:singleflight:{key}         → NX lock for stampede protection
 */
@Injectable()
export class RedisAvailabilityCache {
  private readonly logger  = new Logger(RedisAvailabilityCache.name);
  private readonly client: Redis;

  private readonly CHARGER_TTL       = 60;    // seconds
  private readonly STATION_COUNT_TTL = 30;    // seconds
  private readonly STATION_LIST_TTL  = 300;   // seconds
  private readonly STATION_DETAIL_TTL = 300;  // seconds
  private readonly LOCK_TTL          = 5000;  // milliseconds (PX)

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host:        config.get('REDIS_HOST',     'localhost'),
      port:        parseInt(config.get('REDIS_PORT', '6379')),
      password:    config.get('REDIS_PASSWORD', undefined),
      db:          parseInt(config.get('REDIS_DB', '1')),
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    this.client.on('error', (err) => this.logger.error(`[Redis] ${err.message}`));
    this.client.on('ready', ()    => this.logger.log('[Redis] Connected'));
  }

  // Health

  async healthCheck(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  // Stampede-safe get-or-set

  private async singleFlight<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
  ): Promise<T | null> {
    const cached = await this.client.get(key);
    if (cached !== null) return JSON.parse(cached) as T;

    const lockKey = `ev:infra:lock:singleflight:${key}`;
    const acquired = await this.client.set(lockKey, '1', 'PX', this.LOCK_TTL, 'NX');
    if (!acquired) {
      // Another worker is loading; return null to fall through to DB
      return null;
    }

    try {
      const data = await loader();
      await this.client.set(key, JSON.stringify(data), 'EX', ttl);
      return data;
    } finally {
      await this.client.del(lockKey);
    }
  }

  // Charger availability

  async setChargerStatus(chargerId: string, status: string): Promise<void> {
    const key = `ev:infra:charger:status:${chargerId}`;
    await this.client.set(key, JSON.stringify({ status, updatedAt: new Date().toISOString() }), 'EX', this.CHARGER_TTL);
  }

  async getChargerStatus(chargerId: string): Promise<{ status: string; updatedAt: string } | null> {
    const val = await this.client.get(`ev:infra:charger:status:${chargerId}`);
    return val ? JSON.parse(val) : null;
  }

  async invalidateCharger(chargerId: string): Promise<void> {
    await this.client.del(`ev:infra:charger:status:${chargerId}`);
    this.logger.debug(`[Cache] Invalidated charger ${chargerId}`);
  }

  // Station available count

  async setStationAvailableCount(stationId: string, count: number): Promise<void> {
    await this.client.set(`ev:infra:station:available:${stationId}`, count.toString(), 'EX', this.STATION_COUNT_TTL);
  }

  async getStationAvailableCount(stationId: string): Promise<number | null> {
    const val = await this.client.get(`ev:infra:station:available:${stationId}`);
    return val !== null ? parseInt(val, 10) : null;
  }

  async invalidateStation(stationId: string): Promise<void> {
    await Promise.all([
      this.client.del(`ev:infra:station:available:${stationId}`),
      this.client.del(`ev:infra:station:detail:${stationId}`),
      // Invalidate all list keys via pattern scan (low-cost for small sets)
      this.invalidateListCache(),
    ]);
    this.logger.debug(`[Cache] Invalidated station ${stationId}`);
  }

  // Station list (read-heavy, stampede-protected)

  async getStationList<T>(cacheKey: string, loader: () => Promise<T>): Promise<T | null> {
    const key = `ev:infra:stations:list:${cacheKey}`;
    return this.singleFlight<T>(key, this.STATION_LIST_TTL, loader);
  }

  async setStationList(cacheKey: string, data: unknown): Promise<void> {
    await this.client.set(`ev:infra:stations:list:${cacheKey}`, JSON.stringify(data), 'EX', this.STATION_LIST_TTL);
  }

  async invalidateListCache(): Promise<void> {
    // Scan and delete all station list cache keys
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', 'ev:infra:stations:list:*', 'COUNT', '100');
      cursor = nextCursor;
      if (keys.length > 0) await this.client.del(...keys);
    } while (cursor !== '0');
    this.logger.debug('[Cache] Invalidated all station list keys');
  }

  // Station detail

  async getStationDetail<T>(stationId: string, loader: () => Promise<T>): Promise<T | null> {
    const key = `ev:infra:station:detail:${stationId}`;
    return this.singleFlight<T>(key, this.STATION_DETAIL_TTL, loader);
  }

  // Geo index

  async geoAdd(stationId: string, longitude: number, latitude: number): Promise<void> {
    await this.client.geoadd('ev:infra:geo:index', longitude, latitude, stationId);
  }

  async geoSearch(longitude: number, latitude: number, radiusKm: number): Promise<string[]> {
    const results = await this.client.call(
      'GEOSEARCH',
      'ev:infra:geo:index',
      'FROMLONLAT', longitude, latitude,
      'BYRADIUS', radiusKm, 'km',
      'ASC',
      'COUNT', '50',
    ) as string[];
    return results;
  }
}
