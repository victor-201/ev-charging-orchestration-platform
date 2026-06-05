import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PricingRuleOrmEntity,
  ChargingPointOrmEntity,
  ConnectorOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/station.orm-entities';
import { ChargerNotFoundException } from '../../domain/exceptions/station.exceptions';

// Constants: VinFast EV Charging Rate Standard (EVN TOU)

/** Off-peak hours: 22:00 – 06:00 daily */
export const OFF_PEAK_HOURS = [22, 23, 0, 1, 2, 3, 4, 5] as const;

/** Peak hours (EVN peak): 09:30–11:30, 17:00–20:00 */
function isPeakHour(hour: number): boolean {
  return (hour >= 9 && hour < 12) || (hour >= 17 && hour < 20);
}
function isOffPeakHour(hour: number): boolean {
  return hour >= 22 || hour < 6;
}

/** Fallback VinFast default rates (VND/kWh) when no pricing_rule is defined */
const DEFAULT_RATE: Record<string, Record<string, number>> = {
  CCS:     { off_peak: 2_500, normal: 3_500, peak: 4_500 },
  'CCS2':  { off_peak: 2_500, normal: 3_500, peak: 4_500 },
  CHAdeMO: { off_peak: 2_500, normal: 3_500, peak: 4_500 },
  Type2:   { off_peak: 2_300, normal: 3_200, peak: 4_200 },
  'GB/T':  { off_peak: 2_000, normal: 2_800, peak: 3_800 },
  Other:   { off_peak: 2_000, normal: 2_800, peak: 3_800 },
};

/** Default idle fee when no pricing_rule is defined (VinFast standard) */
const DEFAULT_IDLE_GRACE_MINUTES = 20;
const DEFAULT_IDLE_FEE_PER_MINUTE = 1_000; // 1,000 VND/minute

export interface PricingQuote {
  stationId:             string;
  chargerId:             string;
  connectorType:         string;
  pricePerKwhVnd:        number;    // current price in VND/kWh (TOU)
  pricePerMinuteVnd:     number;    // time-based fee (if applicable)
  idleGraceMinutes:      number;    // grace period minutes after full charge
  idleFeePerMinuteVnd:   number;    // VND/minute after grace period
  isPeakHour:            boolean;
  isOffPeakHour:         boolean;
  estimatedTotalVnd:     number;
  recommendedDepositVnd: number;    // estimated × 1.20 (includes idle fee buffer)
  ruleId:                string | null;
  validFrom:             Date | null;
  validTo:               Date | null;
  label:                 string | null;
  currency:              string;
}

export interface SessionFeeBreakdown {
  energyFeeVnd:    number;   // energy fee = kwhConsumed × pricePerKwh (TOU)
  idleFeeVnd:      number;   // occupancy fee = max(0, idleMinutes - grace) × idleFeePerMinute
  totalFeeVnd:     number;   // energyFee + idleFee
  pricePerKwhVnd:  number;   // applied TOU rate
  idleGraceMinutes: number;
  idleFeePerMinuteVnd: number;
  chargeableIdleMinutes: number;  // chargeable minutes (grace period deducted)
  ruleId:          string | null;
  tier:            'peak' | 'off_peak' | 'normal';
}

// GetPricingUseCase

/**
 * GetPricingUseCase — Calculates charging price based on:
 *   - Connector type (CCS, CHAdeMO, Type2, GB/T)
 *   - EVN TOU time slots (peak / off-peak / normal)
 *   - Day of the week (day_mask bitmask)
 *   - Admin-configurable idle fee (idle_grace_minutes, idle_fee_per_minute)
 */
@Injectable()
export class GetPricingUseCase {
  private readonly logger = new Logger(GetPricingUseCase.name);

  static readonly EFFICIENCY_FACTOR = 0.85;
  static readonly DEPOSIT_BUFFER    = 1.20; // 20% buffer to cover idle fee

  constructor(
    @InjectRepository(PricingRuleOrmEntity)
    private readonly pricingRepo: Repository<PricingRuleOrmEntity>,
    @InjectRepository(ChargingPointOrmEntity)
    private readonly chargerRepo: Repository<ChargingPointOrmEntity>,
    @InjectRepository(ConnectorOrmEntity)
    private readonly connectorRepo: Repository<ConnectorOrmEntity>,
  ) {}

  async execute(opts: {
    stationId:     string;
    chargerId:     string;
    connectorType: string;
    startTime:     Date;
    endTime:       Date;
  }): Promise<PricingQuote> {
    const charger = await this.chargerRepo.findOne({
      where: { id: opts.chargerId, stationId: opts.stationId },
      relations: ['connectors'],
    });
    if (!charger) throw new ChargerNotFoundException(opts.chargerId);

    const connector = charger.connectors?.find(
      (c) => c.connectorType === opts.connectorType,
    );
    if (!connector) {
      throw new Error(
        `Charger ${opts.chargerId} does not have connector type ${opts.connectorType}. ` +
        `Available: ${charger.connectors?.map((c) => c.connectorType).join(', ')}`,
      );
    }

    const hour      = opts.startTime.getHours();
    const dayOfWeek = opts.startTime.getDay() || 7;

    const rule = await this.findBestPricingRule(
      opts.stationId, opts.connectorType, opts.startTime, hour, dayOfWeek,
    );

    let pricePerKwhVnd: number;
    let pricePerMinuteVnd    = 0;
    let idleGraceMinutes     = DEFAULT_IDLE_GRACE_MINUTES;
    let idleFeePerMinuteVnd  = DEFAULT_IDLE_FEE_PER_MINUTE;
    let ruleId: string | null = null;
    let validFrom: Date | null = null;
    let validTo: Date | null   = null;
    let label: string | null   = null;

    if (rule) {
      pricePerKwhVnd      = Number(rule.pricePerKwh);
      pricePerMinuteVnd   = rule.pricePerMinute ? Number(rule.pricePerMinute) : 0;
      idleGraceMinutes    = rule.idleGraceMinutes;
      idleFeePerMinuteVnd = Number(rule.idleFeePerMinute);
      ruleId              = rule.id;
      validFrom           = rule.validFrom;
      validTo             = rule.validTo;
      label               = rule.label ?? null;
    } else {
      const tier = isPeakHour(hour) ? 'peak' : isOffPeakHour(hour) ? 'off_peak' : 'normal';
      const rates = DEFAULT_RATE[opts.connectorType] ?? DEFAULT_RATE['Other'];
      pricePerKwhVnd = rates[tier];
      this.logger.debug(
        `No rule for station=${opts.stationId} connector=${opts.connectorType}. ` +
        `Fallback: ${pricePerKwhVnd} VND/kWh (${tier})`,
      );
    }

    const durationMs    = opts.endTime.getTime() - opts.startTime.getTime();
    const durationHours = durationMs / (1000 * 3600);
    const maxPowerKw    = Number(charger.maxPowerKw) || 22;
    const estimatedKwh  = durationHours * maxPowerKw * GetPricingUseCase.EFFICIENCY_FACTOR;
    const estimatedTotalVnd = Math.ceil(estimatedKwh * pricePerKwhVnd);

    const recommendedDepositVnd = Math.ceil(estimatedTotalVnd * GetPricingUseCase.DEPOSIT_BUFFER);

    return {
      stationId:            opts.stationId,
      chargerId:            opts.chargerId,
      connectorType:        opts.connectorType,
      pricePerKwhVnd,
      pricePerMinuteVnd,
      idleGraceMinutes,
      idleFeePerMinuteVnd,
      isPeakHour:           isPeakHour(hour),
      isOffPeakHour:        isOffPeakHour(hour),
      estimatedTotalVnd,
      recommendedDepositVnd,
      ruleId,
      validFrom,
      validTo,
      label,
      currency: 'VND',
    };
  }

  private async findBestPricingRule(
    stationId:     string,
    connectorType: string,
    startTime:     Date,
    hour:          number,
    dayOfWeek:     number,
  ): Promise<PricingRuleOrmEntity | null> {
    const dayBit = 1 << (dayOfWeek - 1);
    const rules = await this.pricingRepo
      .createQueryBuilder('pr')
      .where('pr.station_id = :stationId', { stationId })
      .andWhere('pr.connector_type = :connectorType', { connectorType })
      .andWhere('pr.valid_from <= :now', { now: startTime })
      .andWhere('(pr.valid_to IS NULL OR pr.valid_to >= :now)', { now: startTime })
      .andWhere('(pr.day_mask = 0 OR (pr.day_mask & :dayBit) > 0)', { dayBit })
      .andWhere('(pr.hour_start IS NULL OR pr.hour_start <= :hour)', { hour })
      .andWhere('(pr.hour_end IS NULL OR pr.hour_end > :hour)', { hour })
      .orderBy('pr.valid_from', 'DESC')
      .getMany();
    return rules[0] ?? null;
  }
}

// CalculateSessionFeeUseCase

/**
 * Calculates actual invoice details after session completion.
 *
 * Billing logic:
 *   1. Look up pricing rule at startTime (TOU — Time Of Use)
 *   2. energyFee = kwhConsumed × pricePerKwh
 *   3. idleFee   = max(0, idleMinutes - idleGraceMinutes) × idleFeePerMinute
 *   4. totalFee  = energyFee + idleFee
 *
 * Note: idle_grace_minutes and idle_fee_per_minute are configured by Admin in
 * pricing_rules — not hardcoded.
 */
@Injectable()
export class CalculateSessionFeeUseCase {
  private readonly logger = new Logger(CalculateSessionFeeUseCase.name);

  constructor(
    @InjectRepository(PricingRuleOrmEntity)
    private readonly pricingRepo: Repository<PricingRuleOrmEntity>,
    @InjectRepository(ChargingPointOrmEntity)
    private readonly chargerRepo: Repository<ChargingPointOrmEntity>,
  ) {}

  async execute(opts: {
    chargerId:     string;
    stationId:     string;
    connectorType: string;
    startTime:     Date;   // charging start time (used for TOU rule lookup)
    kwhConsumed:   number; // actual kWh consumed
    idleMinutes:   number; // minutes of occupancy after full charge (from OCPP event)
  }): Promise<SessionFeeBreakdown> {
    const charger = await this.chargerRepo.findOne({
      where: { id: opts.chargerId, stationId: opts.stationId },
    });

    const hour      = opts.startTime.getHours();
    const dayOfWeek = opts.startTime.getDay() || 7;
    const dayBit    = 1 << (dayOfWeek - 1);

    // Lookup pricing rule
    const rules = await this.pricingRepo
      .createQueryBuilder('pr')
      .where('pr.station_id = :stationId', { stationId: opts.stationId })
      .andWhere('pr.connector_type = :connectorType', { connectorType: opts.connectorType })
      .andWhere('pr.valid_from <= :now', { now: opts.startTime })
      .andWhere('(pr.valid_to IS NULL OR pr.valid_to >= :now)', { now: opts.startTime })
      .andWhere('(pr.day_mask = 0 OR (pr.day_mask & :dayBit) > 0)', { dayBit })
      .andWhere('(pr.hour_start IS NULL OR pr.hour_start <= :hour)', { hour })
      .andWhere('(pr.hour_end IS NULL OR pr.hour_end > :hour)', { hour })
      .orderBy('pr.valid_from', 'DESC')
      .getMany();

    const rule = rules[0] ?? null;

    // Determine TOU tier & rate
    let pricePerKwhVnd: number;
    let idleGraceMinutes    = DEFAULT_IDLE_GRACE_MINUTES;
    let idleFeePerMinuteVnd = DEFAULT_IDLE_FEE_PER_MINUTE;
    let ruleId: string | null = null;
    let tier: 'peak' | 'off_peak' | 'normal';

    if (isPeakHour(hour))       tier = 'peak';
    else if (isOffPeakHour(hour)) tier = 'off_peak';
    else                         tier = 'normal';

    if (rule) {
      pricePerKwhVnd      = Number(rule.pricePerKwh);
      idleGraceMinutes    = rule.idleGraceMinutes;
      idleFeePerMinuteVnd = Number(rule.idleFeePerMinute);
      ruleId              = rule.id;
    } else {
      const rates = DEFAULT_RATE[opts.connectorType] ?? DEFAULT_RATE['Other'];
      pricePerKwhVnd = rates[tier];
      this.logger.warn(
        `No pricing rule — fallback for charger=${opts.chargerId} tier=${tier}: ${pricePerKwhVnd} VND/kWh`,
      );
    }

    // Calculate fees
    let energyFeeVnd = Math.ceil(opts.kwhConsumed * pricePerKwhVnd);
    if (energyFeeVnd < 1000) {
      energyFeeVnd = 1000;
    }
    const chargeableIdleMinutes = Math.max(0, opts.idleMinutes - idleGraceMinutes);
    const idleFeeVnd   = Math.ceil(chargeableIdleMinutes * idleFeePerMinuteVnd);
    const totalFeeVnd  = energyFeeVnd + idleFeeVnd;

    this.logger.log(
      `SessionFee: charger=${opts.chargerId} ` +
      `energy=${energyFeeVnd}VND (${opts.kwhConsumed}kWh × ${pricePerKwhVnd}) ` +
      `idle=${idleFeeVnd}VND (${chargeableIdleMinutes}min × ${idleFeePerMinuteVnd}) ` +
      `total=${totalFeeVnd}VND tier=${tier}`,
    );

    return {
      energyFeeVnd,
      idleFeeVnd,
      totalFeeVnd,
      pricePerKwhVnd,
      idleGraceMinutes,
      idleFeePerMinuteVnd,
      chargeableIdleMinutes,
      ruleId,
      tier,
    };
  }
}

// UpsertPricingRuleUseCase (Admin)

function getHoursSet(start: number | null | undefined, end: number | null | undefined): Set<number> {
  const set = new Set<number>();
  if (start === null || end === null || start === undefined || end === undefined) {
    for (let i = 0; i < 24; i++) set.add(i);
    return set;
  }
  if (start === end) {
    return set;
  }
  if (start < end) {
    for (let i = start; i < end; i++) set.add(i);
  } else {
    for (let i = start; i < 24; i++) set.add(i);
    for (let i = 0; i < end; i++) set.add(i);
  }
  return set;
}

function getContiguousIntervals(hours: Set<number>): { hourStart: number; hourEnd: number }[] {
  if (hours.size === 0) return [];
  if (hours.size === 24) return [{ hourStart: 0, hourEnd: 24 }];

  let startScan = 0;
  for (let h = 0; h < 24; h++) {
    if (!hours.has(h)) {
      startScan = (h + 1) % 24;
      break;
    }
  }

  const intervals: { hourStart: number; hourEnd: number }[] = [];
  let inInterval = false;
  let intervalStart = 0;

  for (let i = 0; i < 24; i++) {
    const h = (startScan + i) % 24;
    const hasHour = hours.has(h);

    if (hasHour && !inInterval) {
      inInterval = true;
      intervalStart = h;
    } else if (!hasHour && inInterval) {
      inInterval = false;
      intervals.push({ hourStart: intervalStart, hourEnd: h });
    }
  }

  if (inInterval) {
    intervals.push({ hourStart: intervalStart, hourEnd: startScan });
  }

  return intervals;
}

/**
 * Admin creates or updates a pricing rule.
 * Never deletes old rules — only sets valid_to for deactivation.
 */
@Injectable()
export class UpsertPricingRuleUseCase {
  constructor(
    @InjectRepository(PricingRuleOrmEntity)
    private readonly pricingRepo: Repository<PricingRuleOrmEntity>,
  ) {}

  async execute(dto: {
    id?:                string;   // if present: update, otherwise: create
    stationId:          string;
    connectorType:      string;
    validFrom:          Date;
    validTo?:           Date;
    hourStart?:         number;
    hourEnd?:           number;
    dayMask?:           number;
    pricePerKwh:        number;   // VND/kWh (new TOU rate)
    pricePerMinute?:    number;
    idleGraceMinutes?:  number;   // free idle minutes (default 20)
    idleFeePerMinute?:  number;   // VND/minute idle (default 1,000)
    label?:             string;
    currency?:          string;
  }): Promise<PricingRuleOrmEntity> {
    const existing = dto.id
      ? await this.pricingRepo.findOne({ where: { id: dto.id } })
      : null;

    const entity = existing ?? this.pricingRepo.create({ id: crypto.randomUUID() });

    entity.stationId         = dto.stationId;
    entity.connectorType     = dto.connectorType as any;
    entity.validFrom         = dto.validFrom;
    entity.validTo           = dto.validTo ?? null;
    entity.hourStart         = dto.hourStart ?? null;
    entity.hourEnd           = dto.hourEnd   ?? null;
    entity.dayMask           = dto.dayMask   ?? 0;
    entity.pricePerKwh       = dto.pricePerKwh;
    entity.pricePerMinute    = dto.pricePerMinute ?? null;
    entity.idleGraceMinutes  = dto.idleGraceMinutes  ?? 20;
    entity.idleFeePerMinute  = dto.idleFeePerMinute  ?? 1_000;
    entity.label             = dto.label    ?? null;
    entity.currency          = dto.currency ?? 'VND';

    const savedEntity = await this.pricingRepo.save(entity);

    // Resolve hour overlaps for other active rules of the same station and connector type
    const newHours = getHoursSet(entity.hourStart, entity.hourEnd);
    if (newHours.size > 0) {
      const activeRules = await this.pricingRepo.find({
        where: {
          stationId: entity.stationId,
          connectorType: entity.connectorType,
        }
      });

      const now = new Date();

      for (const rule of activeRules) {
        if (rule.id === savedEntity.id) continue;
        if (rule.validTo && rule.validTo <= now) continue;

        const oldHours = getHoursSet(rule.hourStart, rule.hourEnd);
        const remainingHours = new Set<number>();
        for (const h of oldHours) {
          if (!newHours.has(h)) {
            remainingHours.add(h);
          }
        }

        if (remainingHours.size === 0) {
          rule.validTo = now;
          await this.pricingRepo.save(rule);
          continue;
        }

        if (remainingHours.size < oldHours.size) {
          const intervals = getContiguousIntervals(remainingHours);
          if (intervals.length === 0) {
            rule.validTo = now;
            await this.pricingRepo.save(rule);
          } else {
            const firstInterval = intervals[0];
            rule.hourStart = firstInterval.hourStart === 0 && firstInterval.hourEnd === 24 ? null : firstInterval.hourStart;
            rule.hourEnd = firstInterval.hourStart === 0 && firstInterval.hourEnd === 24 ? null : firstInterval.hourEnd;
            await this.pricingRepo.save(rule);

            for (let i = 1; i < intervals.length; i++) {
              const interval = intervals[i];
              const splitRule = this.pricingRepo.create({
                ...rule,
                id: crypto.randomUUID(),
                hourStart: interval.hourStart,
                hourEnd: interval.hourEnd,
                validFrom: savedEntity.validFrom,
              });
              await this.pricingRepo.save(splitRule);
            }
          }
        }
      }
    }

    return savedEntity;
  }
}

// DeactivatePricingRuleUseCase (Admin)

@Injectable()
export class DeactivatePricingRuleUseCase {
  constructor(
    @InjectRepository(PricingRuleOrmEntity)
    private readonly pricingRepo: Repository<PricingRuleOrmEntity>,
  ) {}

  async execute(ruleId: string): Promise<void> {
    const now = new Date();

    // 1. Load the rule to be removed
    const target = await this.pricingRepo.findOne({ where: { id: ruleId } });
    if (!target) {
      await this.pricingRepo.update(ruleId, { validTo: now });
      return;
    }

    // 2. Load all other active rules for the same station + connector
    const siblings = await this.pricingRepo
      .createQueryBuilder('pr')
      .where('pr.station_id = :stationId', { stationId: target.stationId })
      .andWhere('pr.connector_type = :connectorType', { connectorType: target.connectorType })
      .andWhere('pr.id != :id', { id: ruleId })
      .andWhere('pr.valid_from <= :now', { now })
      .andWhere('(pr.valid_to IS NULL OR pr.valid_to > :now)', { now })
      .getMany();

    // 3. Try to find the preceding rule whose hourEnd === target.hourStart
    //    (supports wrap-around: e.g. target=13→19, preceding=4→13)
    const preceding = siblings.find(r => r.hourEnd === target.hourStart);

    if (preceding) {
      // Expand the preceding rule to absorb the deleted range
      preceding.hourEnd = target.hourEnd;
      await this.pricingRepo.save(preceding);
    } else {
      // Fallback: find the following rule whose hourStart === target.hourEnd
      const following = siblings.find(r => r.hourStart === target.hourEnd);
      if (following) {
        following.hourStart = target.hourStart;
        await this.pricingRepo.save(following);
      }
      // If neither sibling found (isolated rule), just soft-delete without expansion
    }

    // 4. Soft-delete the target rule
    await this.pricingRepo.update(ruleId, { validTo: now });
  }
}

// ListPricingRulesUseCase

@Injectable()
export class ListPricingRulesUseCase {
  constructor(
    @InjectRepository(PricingRuleOrmEntity)
    private readonly pricingRepo: Repository<PricingRuleOrmEntity>,
  ) {}

  async execute(stationId?: string, activeOnly = false): Promise<PricingRuleOrmEntity[]> {
    const qb = this.pricingRepo.createQueryBuilder('pr').orderBy('pr.valid_from', 'DESC');
    if (stationId) qb.where('pr.station_id = :stationId', { stationId });
    if (activeOnly) {
      const now = new Date();
      qb.andWhere('pr.valid_from <= :now', { now })
        .andWhere('(pr.valid_to IS NULL OR pr.valid_to >= :now)', { now });
    }
    return qb.getMany();
  }
}
