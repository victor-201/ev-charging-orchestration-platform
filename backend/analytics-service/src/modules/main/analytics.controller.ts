import {
  Controller, Get, Query, Param,
  ParseUUIDPipe, ParseIntPipe,
  DefaultValuePipe, ParseBoolPipe,
  Logger, UseGuards, ForbiddenException,
} from '@nestjs/common';
import {
  GetStationUsageUseCase,
  GetRevenueUseCase,
  GetPeakHoursUseCase,
  GetSystemMetricsUseCase,
  GetUserBehaviorUseCase,
  DashboardUseCase,
} from '../../application/use-cases/analytics.use-cases';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';

/**
 * AnalyticsController — Admin Reporting API & Staff Station Analytics
 *
 * Routes (prefix: /api/v1/analytics):
 *
 *   GET /system                              — Platform KPI dashboard (Admin only)
 *   GET /revenue?range=monthly&stationId=   — Revenue analytics (Admin & Staff)
 *   GET /usage?stationId=&days=             — Station usage metrics (Admin & Staff)
 *   GET /peak-hours?stationId=&forecast=    — Peak hour analysis + demand forecast (Admin & Staff)
 *   GET /users/:userId?days=                — User behavior analytics (Admin only)
 *   GET /stations/:stationId/metrics         - Per-station metrics summary (Admin & Staff)
 *   GET /dashboard                           — Composite view for admin dashboard (Admin only)
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly systemMetrics: GetSystemMetricsUseCase,
    private readonly revenue:       GetRevenueUseCase,
    private readonly stationUsage:  GetStationUsageUseCase,
    private readonly peakHours:     GetPeakHoursUseCase,
    private readonly userBehavior:  GetUserBehaviorUseCase,
    private readonly dashboard:     DashboardUseCase,
  ) {}

  private validateStaffStation(user: any, stationId?: string): string | undefined {
    const userRoles = user.roles ?? (user.role ? [user.role] : []);
    const isStaff = userRoles.includes('staff') && !userRoles.includes('admin');
    if (!isStaff) {
      return stationId;
    }

    const assignedIds = user.stationIds || (user.stationId ? [user.stationId] : []);
    if (assignedIds.length === 0) {
      throw new ForbiddenException('No stations assigned to this staff member');
    }

    if (!stationId) {
      return assignedIds[0];
    }

    if (!assignedIds.includes(stationId)) {
      throw new ForbiddenException('You do not have permission to access analytics for this station');
    }

    return stationId;
  }

  /**
   * Platform-wide KPI: active sessions, revenue 30d, booking funnel, top users.
   *
   * @example GET /api/v1/analytics/system
   */
  @Get('system')
  @Roles('admin')
  async getSystemMetrics() {
    this.logger.log('GET /analytics/system');
    return this.systemMetrics.execute();
  }

  /**
   * Revenue analytics.
   *
   * @param range       'monthly' | 'daily' (default: 'monthly')
   * @param stationId   UUID — filter by station (optional)
   * @param days        Number of days (only applicable if range=daily, default: 30)
   *
   * @example GET /api/v1/analytics/revenue?range=monthly
   * @example GET /api/v1/analytics/revenue?range=daily&stationId=xxx&days=7
   */
  @Get('revenue')
  async getRevenue(
    @CurrentUser() user: any,
    @Query('range')     range:     string  = 'monthly',
    @Query('stationId') stationId: string | undefined,
    @Query('days',  new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    if (range !== 'monthly' && range !== 'daily') {
      return { error: "Range must be either 'monthly' or 'daily'" };
    }
    const validatedStationId = this.validateStaffStation(user, stationId);
    return this.revenue.execute({ range, stationId: validatedStationId || undefined, days });
  }

  /**
   * Station usage analytics.
   *
   * @param stationId  UUID — if not provided, returns top 10 stations
   * @param days       Recent number of days (default: 30)
   *
   * @example GET /api/v1/analytics/usage?stationId=xxx&days=14
   * @example GET /api/v1/analytics/usage
   */
  @Get('usage')
  async getUsage(
    @CurrentUser() user: any,
    @Query('stationId') stationId: string | undefined,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    const validatedStationId = this.validateStaffStation(user, stationId);
    return this.stationUsage.execute({ stationId: validatedStationId || undefined, days });
  }

  /**
   * Peak hour detection + demand forecast.
   *
   * @param stationId    UUID — filter by station (optional, default: platform-wide)
   * @param lookbackDays Historical analysis window in days (default: 28)
   * @param forecast     true — include EWA demand forecast for tomorrow
   *
   * @example GET /api/v1/analytics/peak-hours?stationId=xxx&forecast=true
   * @example GET /api/v1/analytics/peak-hours?lookbackDays=14
   */
  @Get('peak-hours')
  async getPeakHours(
    @CurrentUser() user: any,
    @Query('stationId')    stationId:    string | undefined,
    @Query('lookbackDays', new DefaultValuePipe(28), ParseIntPipe) lookbackDays: number,
    @Query('forecast',     new DefaultValuePipe(false), ParseBoolPipe) withForecast: boolean,
  ) {
    const validatedStationId = this.validateStaffStation(user, stationId);
    return this.peakHours.execute({ stationId: validatedStationId || undefined, lookbackDays, withForecast });
  }

  /**
   * User behavior analytics.
   *
   * @param userId  User UUID
   * @param days    Recent number of days for daily breakdown (default: 30)
   *
   * @example GET /api/v1/analytics/users/abc-uuid?days=90
   */
  @Get('users/:userId')
  @Roles('admin')
  async getUserBehavior(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.userBehavior.execute(userId, days);
  }

  /**
   * Convenience shorthand: per-station summary (alias for usage with stationId).
   */
  @Get('stations/:stationId/metrics')
  async getStationMetrics(
    @CurrentUser() user: any,
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    const validatedStationId = this.validateStaffStation(user, stationId);
    if (!validatedStationId) {
      throw new ForbiddenException('Station ID is required');
    }
    return this.stationUsage.execute({ stationId: validatedStationId, days });
  }

  /**
   * Dashboard shortcut API: composite view for admin dashboard.
   *
   * @example GET /api/v1/analytics/dashboard
   */
  @Get('dashboard')
  @Roles('admin')
  async getDashboard() {
    this.logger.log('GET /analytics/dashboard');
    return this.dashboard.execute();
  }
}
