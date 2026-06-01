'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { formatCurrency, formatDate, relativeTimeLocale } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Zap, TrendingUp, Users, Activity, Battery, DollarSign, MapPin, ArrowUpRight, ArrowDownRight,
  Wrench, AlertTriangle, CheckCircle, Clock, CheckCircle2,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import GlassCard from '@/core/theme/GlassCard';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store/auth.store';

interface DashboardData {
  latestKpi: { activeSessions: number; revenue30d: number; newUsers30d: number };
  revenue30d: { date: string; revenueVnd: number; sessions: number }[];
  peakHours: { hourOfDay: number; avgSessions: number; avgKwh: number; totalSessions: number; rank: number; isPeak: boolean; peakScore: number }[];
  topStations: { stationId: string; revenue: number; utilizationRate: number; totalSessions: number; totalKwh: number; totalRevenueVnd: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--card-bg)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--card-border)',
        borderRadius: '14px',
        padding: '10px 14px',
        color: 'var(--text-main)',
        fontSize: 12,
      }}
    >
      <p style={{ color: 'var(--text-faded)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontWeight: 600, color: 'var(--brand-cyan)' }}>{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

function CustomPeakDot(props: any) {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return <g />;
  if (payload.isPeak) {
    return (
      <g key={`peak-dot-${payload.hourOfDay}`}>
        <circle cx={cx} cy={cy} r={4} fill="var(--brand-danger)" stroke="#ffffff" strokeWidth={1} style={{ filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.8))' }} />
        <circle cx={cx} cy={cy} r={7} fill="none" stroke="var(--brand-danger)" strokeWidth={1} className="animate-ping" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      </g>
    );
  }
  return <circle key={`norm-dot-${payload.hourOfDay}`} cx={cx} cy={cy} r={2.5} fill="rgba(255, 255, 255, 0.2)" stroke="none" />;
}

function MetricCard({
  title, value, sub, icon: Icon, gradient, glow, trend
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; gradient: string; glow: string; trend?: number;
}) {
  return (
    <GlassCard
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ translateY: -4 }}
      transition={{ duration: 0.2 }}
      className="p-6"
      showShine
      showMarkers
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center relative overflow-hidden"
          style={{ background: gradient, boxShadow: `0 8px 24px ${glow}` }}
        >
          <div className="absolute inset-0" style={{ background: 'var(--sq-shine)' }} />
          <Icon className="w-5 h-5 text-white relative z-10" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trend >= 0 ? 'text-success' : 'text-danger'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--text-faded)' }}>{title}</p>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-faded)' }}>{sub}</p>}
      </div>
    </GlassCard>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('admin');
  const isStaff = user?.roles?.includes('staff');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // -- Staff: derive assigned station IDs from JWT (no redundant /staff query) --
  const staffStationIds: string[] = user?.stationIds?.length
    ? user.stationIds
    : user?.stationId
      ? [user.stationId]
      : [];

  const primaryStationId = staffStationIds[0] || null;
  const hasNoAssignment = isStaff && staffStationIds.length === 0;

  // -- Staff queries --
  const { data: attendanceData, refetch: refetchAttendance, isLoading: loadingAttendance } = useQuery({
    queryKey: ['my-attendance-dashboard', user?.id],
    queryFn: async () => {
      if (isAdmin) return null;
      const res = await apiClient.get('/attendance');
      const items = res.data?.items || res.data || [];
      return Array.isArray(items) ? items.map((item: any) => ({
        ...item,
        checkIn: item.checkIn || item.checkInTime,
        checkInTime: item.checkInTime || item.checkIn,
        checkOut: item.checkOut || item.checkOutTime,
        checkOutTime: item.checkOutTime || item.checkOut,
      })) : [];
    },
    enabled: !!user && isStaff,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const myTodayAttendance = Array.isArray(attendanceData)
    ? attendanceData.find((a: any) => {
        const isMe = a.userId === user?.id;
        const isToday = a.checkInTime && a.checkInTime.startsWith(todayStr);
        return isMe && isToday;
      })
    : null;

  const { data: staffStation, isLoading: loadingStation } = useQuery({
    queryKey: ['staff-station-detail', primaryStationId],
    queryFn: async () => {
      if (!primaryStationId) return null;
      const res = await apiClient.get(`/stations/${primaryStationId}`);
      return res.data?.data || res.data;
    },
    enabled: !!primaryStationId && isStaff,
  });

  const { data: recentIncidents = [], isLoading: loadingIncidents } = useQuery({
    queryKey: ['staff-recent-incidents', primaryStationId],
    queryFn: async () => {
      if (!primaryStationId) return [];
      const res = await apiClient.get('/stations/incidents', {
        params: { limit: 5, stationId: primaryStationId },
      });
      return Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
    },
    enabled: !!primaryStationId && isStaff,
  });

  const isLoadingStaff = loadingAttendance || loadingStation || loadingIncidents;

  const handleCheckIn = async () => {
    if (!primaryStationId) return;
    try {
      await apiClient.post('/attendance/check-in', { stationId: primaryStationId });
      toast.success(t('dashboard:home.checkin.checkin_success'));
      refetchAttendance();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('dashboard:home.checkin.checkin_failed'));
    }
  };

  const handleCheckOut = async () => {
    try {
      await apiClient.post('/attendance/check-out', {});
      toast.success(t('dashboard:home.checkin.checkout_success'));
      refetchAttendance();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('dashboard:home.checkin.checkout_failed'));
    }
  };

  // -- Admin analytics query --
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['analytics-dashboard'],
    queryFn: async () => (await apiClient.get('/analytics/dashboard')).data,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const kpi = data?.latestKpi;

  const chartData = data?.peakHours
    ? [...data.peakHours].sort((a, b) => a.hourOfDay - b.hourOfDay)
    : [];

  const peakPeriods = data?.peakHours
    ? [...data.peakHours].filter((h) => h.isPeak).sort((a, b) => a.rank - b.rank)
    : [];

  if (isStaff) {
    if (hasNoAssignment) {
      return (
        <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-6 items-center justify-center">
          <GlassCard className="p-10 text-center" showShine showMarkers>
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" style={{ color: 'var(--text-faded)' }} />
            <p className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>{t('dashboard:home.staff_empty')}</p>
          </GlassCard>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-6">
        {/* Staff Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
              {t('dashboard:home.title')}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-faded)' }}>
              {staffStation?.name || primaryStationId}
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.25)' }}>
            <span className="glow-dot bg-success animate-pulse-glow" />
            <span className="text-success text-xs font-semibold">{t('common:common.live')}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
          {isLoadingStaff ? (
            <div className="space-y-4">
              <div className="h-32 rounded-2xl bg-white/5 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
              <div className="h-48 rounded-2xl bg-white/5 animate-pulse" />
            </div>
          ) : (
            <>
              {/* Check-in Widget */}
              <GlassCard className="p-6" showShine showMarkers>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-cyan/10 border border-cyan/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-cyan" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{t('dashboard:home.checkin.title')}</h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-faded)' }}>
                        {staffStation?.name || primaryStationId}
                      </p>
                    </div>
                  </div>
                  <div>
                    {myTodayAttendance?.checkIn && !myTodayAttendance?.checkOut ? (
                      <span className="badge badge-success uppercase text-[10px] animate-pulse">{t('dashboard:home.checkin.checked_in')}</span>
                    ) : myTodayAttendance?.checkIn && myTodayAttendance?.checkOut ? (
                      <span className="badge badge-muted uppercase text-[10px]">{t('dashboard:home.checkin.completed')}</span>
                    ) : (
                      <span className="badge badge-warning uppercase text-[10px]">{t('dashboard:home.checkin.pending')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  {!myTodayAttendance?.checkIn && (
                    <button onClick={handleCheckIn} className="btn-primary flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle className="w-4 h-4" /> {t('dashboard:home.checkin.checkin_btn')}
                    </button>
                  )}
                  {myTodayAttendance?.checkIn && !myTodayAttendance?.checkOut && (
                    <button onClick={handleCheckOut} className="flex-1 py-2 rounded-xl text-xs font-bold text-white shadow-md shadow-danger/20 bg-danger flex items-center justify-center gap-1.5">
                      <Clock className="w-4 h-4" /> {t('dashboard:home.checkin.checkout_btn')}
                    </button>
                  )}
                  {myTodayAttendance?.checkIn && myTodayAttendance?.checkOut && (
                    <div className="flex-1 py-2 rounded-xl text-center text-xs font-semibold text-text-muted bg-white/5 border border-white/10 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-success" /> {t('dashboard:home.checkin.completed_msg')}
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Station KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  title={t('dashboard:home.staff_kpi.station_status')}
                  value={staffStation?.status || '—'}
                  icon={MapPin}
                  gradient="var(--grad-cyan-lime)"
                  glow="var(--glow-cyan)"
                />
                <MetricCard
                  title={t('dashboard:home.staff_kpi.available_chargers')}
                  value={staffStation ? `${staffStation.availableChargers ?? 0}/${staffStation.totalChargers ?? 0}` : '—'}
                  icon={Battery}
                  gradient="var(--grad-blue-cyan)"
                  glow="var(--glow-blue)"
                />
                <MetricCard
                  title={t('dashboard:home.staff_kpi.active_sessions')}
                  value={staffStation ? `${(staffStation.totalChargers ?? 0) - (staffStation.availableChargers ?? 0)}` : '—'}
                  icon={Zap}
                  gradient="var(--grad-yellow-orange)"
                  glow="var(--glow-orange)"
                />
              </div>

              {/* Recent Incidents */}
              <GlassCard className="p-6" showShine showMarkers>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>{t('dashboard:home.staff_incidents.title')}</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-faded)' }}>{t('dashboard:home.staff_incidents.subtitle')}</p>
                  </div>
                  <AlertTriangle className="w-5 h-5 text-danger" />
                </div>
                <div className="overflow-x-auto">
                  <table className="ev-table">
                    <thead>
                      <tr>
                        <th>{t('dashboard:home.staff_incidents.table.description')}</th>
                        <th>{t('dashboard:home.staff_incidents.table.severity')}</th>
                        <th>{t('dashboard:home.staff_incidents.table.status')}</th>
                        <th>{t('dashboard:home.staff_incidents.table.time')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentIncidents.length > 0 ? (
                        recentIncidents.slice(0, 5).map((inc: any) => (
                          <tr key={inc.id}>
                            <td className="max-w-xs truncate text-xs">{inc.description}</td>
                            <td>
                              <span className={`badge ${inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'badge-danger' : 'badge-warning'}`}>
                                {t(`dashboard:data.severity.${inc.severity}`) || inc.severity}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${inc.status?.toUpperCase() === 'RESOLVED' ? 'badge-success' : 'badge-muted'}`}>
                                {t(`dashboard:data.status.${inc.status?.toUpperCase()}`) || inc.status}
                              </span>
                            </td>
                            <td className="text-xs text-text-muted">{relativeTimeLocale(inc.createdAt)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="text-center py-6" style={{ color: 'var(--text-faded)' }}>{t('dashboard:home.staff_incidents.empty')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-6">
      {/* Admin Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
            {t('dashboard:home.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faded)' }}>{t('dashboard:home.subtitle')}</p>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
          }}
        >
          <span className="glow-dot bg-success animate-pulse-glow" />
          <span className="text-success text-xs font-semibold">{t('common:common.live')}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={t('dashboard:home.kpi.active_sessions')}
          value={isLoading ? '—' : (kpi?.activeSessions ?? 0)}
          icon={Battery}
          gradient="var(--grad-cyan-lime)"
          glow="var(--glow-cyan)"
          trend={12}
        />
        <MetricCard
          title={t('dashboard:home.kpi.revenue_30d')}
          value={isLoading ? '—' : formatCurrency(kpi?.revenue30d ?? 0)}
          icon={DollarSign}
          gradient="var(--grad-yellow-orange)"
          glow="var(--glow-orange)"
          trend={8}
        />
        <MetricCard
          title={t('dashboard:home.kpi.new_users_30d')}
          value={isLoading ? '—' : (kpi?.newUsers30d ?? 0)}
          icon={Users}
          gradient="var(--grad-blue-cyan)"
          glow="var(--glow-blue)"
          trend={5}
        />
        <MetricCard
          title={t('dashboard:home.kpi.conversion_rate')}
          value="78.4%"
          icon={TrendingUp}
          gradient="var(--grad-orange-pink)"
          glow="var(--glow-pink)"
          trend={3}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-2 p-7 flex flex-col" showShine showMarkers>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>{t('dashboard:home.charts.revenue_title')}</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-faded)' }}>{t('dashboard:home.charts.revenue_sub')}</p>
            </div>
            <Activity className="w-5 h-5" style={{ color: 'var(--text-faded)' }} />
          </div>
          <div className="flex-1 w-full h-[calc(100%-60px)] min-h-[240px] relative">
            <div className="absolute inset-0">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.revenue30d ?? []} margin={{ top: 10, right: 15, left: 5, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand-cyan)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--brand-lime)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: 'var(--text-faded)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatDate(v, { month: 'short', day: 'numeric' })} />
                    <YAxis width={45} tick={{ fill: 'var(--text-faded)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenueVnd" stroke="var(--brand-cyan)" strokeWidth={2} fill="url(#revenueGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-7 flex flex-col justify-between h-full" showShine showMarkers>
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>{t('dashboard:home.charts.peak_title')}</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-faded)' }}>{t('dashboard:home.charts.peak_sub')}</p>
              </div>
              <Zap className="w-5 h-5 text-danger animate-pulse" />
            </div>

            <div className="w-full h-[180px] relative">
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 15, right: 15, left: 15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="peakHoursGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand-warning)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--brand-warning)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="hourOfDay" tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
                    <YAxis width={30} tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card-bg)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '12px',
                        fontSize: 12,
                        color: 'var(--text-main)',
                      }}
                      cursor={{ stroke: 'rgba(255, 255, 255, 0.1)', strokeWidth: 1 }}
                      formatter={(value: any, name: any) => [
                        `${value} ${t('dashboard:home.charts.peak_tooltip_session')}`,
                        name === 'avgSessions' ? t('dashboard:home.charts.peak_tooltip_load') : name
                      ]}
                      labelFormatter={(label) => t('dashboard:home.charts.peak_tooltip_time', { start: label, end: Number(label) + 1 })}
                    />
                    <Area
                      type="monotone"
                      dataKey="avgSessions"
                      stroke="var(--brand-warning)"
                      strokeWidth={2.5}
                      fill="url(#peakHoursGrad)"
                      dot={CustomPeakDot}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Peak Periods Summary List */}
          {peakPeriods.length > 0 && (
            <div className="pt-4 border-t border-white/5 space-y-2.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                {t('dashboard:home.charts.peak_legend')}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {peakPeriods.slice(0, 3).map((p) => (
                  <div
                    key={p.hourOfDay}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
                        <Zap className="w-3.5 h-3.5 text-danger" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-text-main">
                          {p.hourOfDay.toString().padStart(2, '0')}:00 - {(p.hourOfDay + 1).toString().padStart(2, '0')}:00
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {p.avgSessions.toFixed(2)} {t('dashboard:home.charts.peak_sessions_unit')} • {p.avgKwh.toFixed(0)} {t('dashboard:home.charts.peak_avg_kwh')}
                        </p>
                      </div>
                    </div>
                    <span className="badge badge-danger text-[10px] font-semibold py-0.5 px-2">
                      {t('dashboard:home.charts.peak_load', { percent: (p.peakScore * 100).toFixed(0) })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Top Stations */}
      <GlassCard className="p-7" showShine showMarkers>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>{t('dashboard:home.charts.top_stations_title')}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faded)' }}>{t('dashboard:home.charts.top_stations_sub')}</p>
          </div>
          <MapPin className="w-5 h-5" style={{ color: 'var(--text-faded)' }} />
        </div>
        <div className="overflow-x-auto">
          <table className="ev-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('dashboard:home.table.station_id')}</th>
                <th>{t('dashboard:home.table.revenue')}</th>
                <th>{t('dashboard:home.table.utilization')}</th>
                <th>{t('dashboard:home.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topStations ?? []).map((s, i) => (
                <tr key={s.stationId}>
                  <td style={{ color: 'var(--text-faded)' }}>{i + 1}</td>
                  <td className="font-mono text-xs" style={{ color: 'var(--text-main)' }}>{s.stationId.slice(0, 8)}…</td>
                  <td style={{ color: 'var(--brand-cyan)', fontWeight: 600 }}>{formatCurrency(s.revenue)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sq-3-bg)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${s.utilizationRate}%`,
                            background: 'linear-gradient(135deg, var(--brand-cyan), var(--brand-lime))',
                          }}
                        />
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-faded)' }}>{s.utilizationRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td><span className="badge badge-success">{t('dashboard:data.status.ACTIVE')}</span></td>
                </tr>
              ))}
              {!data?.topStations?.length && (
                <tr>
                  <td colSpan={5} className="text-center py-8" style={{ color: 'var(--text-faded)' }}>{t('common:common.no_data')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
      </div>
    </div>
  );
}