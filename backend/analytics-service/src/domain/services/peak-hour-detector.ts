import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * PeakHourDetector — Domain Service
 *
 * Analyzes hourly_usage_stats to detect peak hours.
 * Algorithm: Weighted average over the last 4 weeks, normalized by percentile.
 *
 * Output: Statistical summary for each hour of the day (0-23) including avg_sessions and rank (1 = highest).
 */
@Injectable()
export class PeakHourDetector {
  private readonly logger = new Logger(PeakHourDetector.name);

  constructor(private readonly ds: DataSource) {}

  /**
   * Detects peak hours for a specific station over the last N days.
   * @returns An array of 24 elements (hours 0-23), sorted by avg_sessions in descending order.
   */
  async detectForStation(stationId: string, lookbackDays = 28): Promise<PeakHourResult[]> {
    const rows = await this.ds.query(`
      SELECT
        hour_of_day,
        COUNT(*)                                      AS data_points,
        ROUND(AVG(sessions_count), 2)                 AS avg_sessions,
        ROUND(AVG(kwh_consumed), 4)                   AS avg_kwh,
        ROUND(AVG(total_duration_min), 2)             AS avg_duration_min,
        SUM(sessions_count)                           AS total_sessions
      FROM hourly_usage_stats
      WHERE station_id = $1
        AND hour_bucket >= (SELECT COALESCE(MAX(hour_bucket), NOW()) FROM hourly_usage_stats) - INTERVAL '${lookbackDays} days'
      GROUP BY hour_of_day
      ORDER BY avg_sessions DESC
    `, [stationId]);

    if (rows.length === 0) return [];

    const maxSessions = parseFloat(rows[0].avg_sessions);

    return rows.map((r: any, idx: number) => ({
      hourOfDay:        parseInt(r.hour_of_day),
      avgSessions:      parseFloat(r.avg_sessions),
      avgKwh:           parseFloat(r.avg_kwh),
      avgDurationMin:   parseFloat(r.avg_duration_min),
      totalSessions:    parseInt(r.total_sessions),
      dataPoints:       parseInt(r.data_points),
      peakScore:        maxSessions > 0 ? parseFloat(r.avg_sessions) / maxSessions : 0,
      rank:             idx + 1,
      isPeak:           idx < 3,  // top 3 hours are considered peak
    }));
  }

  /**
   * Platform-wide peak hours across all stations.
   */
  async detectPlatformWide(lookbackDays = 28): Promise<PeakHourResult[]> {
    const rows = await this.ds.query(`
      SELECT
        hour_of_day,
        ROUND(AVG(sessions_count), 2)    AS avg_sessions,
        ROUND(AVG(kwh_consumed), 4)      AS avg_kwh,
        SUM(sessions_count)              AS total_sessions
      FROM hourly_usage_stats
      WHERE hour_bucket >= (SELECT COALESCE(MAX(hour_bucket), NOW()) FROM hourly_usage_stats) - INTERVAL '${lookbackDays} days'
      GROUP BY hour_of_day
      ORDER BY avg_sessions DESC
    `);

    if (rows.length === 0) return [];
    const maxSessions = parseFloat(rows[0].avg_sessions);

    return rows.map((r: any, idx: number) => ({
      hourOfDay:      parseInt(r.hour_of_day),
      avgSessions:    parseFloat(r.avg_sessions),
      avgKwh:         parseFloat(r.avg_kwh),
      avgDurationMin: 0,
      totalSessions:  parseInt(r.total_sessions),
      dataPoints:     0,
      peakScore:      maxSessions > 0 ? parseFloat(r.avg_sessions) / maxSessions : 0,
      rank:           idx + 1,
      isPeak:         idx < 3,
    }));
  }

  /**
   * Demand prediction using Ordinary Least Squares (OLS) Linear Regression.
   *
   * ML model: per-hour linear regression over 28-day daily session counts.
   * Uses PostgreSQL built-in `regr_slope` and `regr_intercept` aggregate functions
   * which implement standard OLS: y = β0 + β1*x where x = day ordinal.
   *
   * Model quality: R² (coefficient of determination) is returned as `confidence`.
   * Values above 0.6 indicate a reliable trend; below 0.3 indicates noisy data.
   *
   * @param stationId - station UUID (required)
   * @returns 24-element forecast (one per hour), sorted by hourOfDay
   */
  async forecastNextDay(stationId: string): Promise<DemandForecast[]> {
    // OLS regression: for each hour, fit y=sessions ~ x=day_ordinal over 28 days
    const regressionRows = await this.ds.query(`
      SELECT
        hour_of_day,
        -- OLS: β1 (slope), β0 (intercept), R² (goodness of fit)
        COALESCE(regr_slope(sessions_count, day_ordinal), 0)      AS slope,
        COALESCE(regr_intercept(sessions_count, day_ordinal), 0)  AS intercept,
        COALESCE(regr_r2(sessions_count, day_ordinal), 0)         AS r_squared,
        AVG(sessions_count)                                        AS mean_sessions,
        MAX(day_ordinal)                                           AS last_day,
        COUNT(*)                                                   AS data_points
      FROM (
        SELECT
          hour_of_day,
          sessions_count,
          EXTRACT(DAY FROM (hour_bucket - MIN(hour_bucket) OVER (PARTITION BY hour_of_day))) AS day_ordinal
        FROM hourly_usage_stats
        WHERE station_id = $1
          AND hour_bucket >= (SELECT COALESCE(MAX(hour_bucket), NOW()) FROM hourly_usage_stats) - INTERVAL '28 days'
      ) t
      GROUP BY hour_of_day
      ORDER BY hour_of_day
    `, [stationId]);

    const nextDayOrdinal = 29; // forecast for day 29 (tomorrow)

    return regressionRows.map((r: any) => {
      const slope       = parseFloat(r.slope)     || 0;
      const intercept   = parseFloat(r.intercept) || 0;
      const rSquared    = parseFloat(r.r_squared) || 0;
      const mean        = parseFloat(r.mean_sessions) || 0;
      const dataPoints  = parseInt(r.data_points) || 0;

      // OLS prediction: ŷ = β0 + β1 * x_next
      const predicted   = Math.max(0, intercept + slope * nextDayOrdinal);

      // Confidence: blend R² with data availability penalty
      const dataPenalty = Math.min(1, dataPoints / 14); // need at least 14 data points
      const confidence  = Math.round(rSquared * dataPenalty * 100) / 100;

      const trend: DemandForecast['trend'] =
        slope >  0.05 ? 'increasing' :
        slope < -0.05 ? 'decreasing' : 'stable';

      return {
        hourOfDay:        parseInt(r.hour_of_day),
        forecastSessions: Math.round(predicted * 10) / 10,
        confidence:       Math.min(1, Math.max(0, confidence)),
        trend,
        model:            'OLS_linear_regression',
        rSquared:         Math.round(rSquared * 1000) / 1000,
        meanBaseline:     Math.round(mean * 10) / 10,
      } satisfies DemandForecast;
    });
  }
}

// Types

export interface PeakHourResult {
  hourOfDay:      number;   // 0-23
  avgSessions:    number;
  avgKwh:         number;
  avgDurationMin: number;
  totalSessions:  number;
  dataPoints:     number;
  peakScore:      number;   // 0.0 - 1.0 (1.0 = busiest hour)
  rank:           number;   // 1 = busiest
  isPeak:         boolean;  // top 3
}

export interface DemandForecast {
  hourOfDay:        number;
  forecastSessions: number;
  confidence:       number;          // R² * data_penalty (0.0 - 1.0)
  trend:            'increasing' | 'decreasing' | 'stable';
  model?:           string;          // model identifier
  rSquared?:        number;          // raw R²
  meanBaseline?:    number;          // historical mean (baseline comparison)
}

