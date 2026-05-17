'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { formatCurrency } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Zap, TrendingUp, Users, Activity, Battery, DollarSign, MapPin, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts';

interface DashboardData {
  latestKpi: { activeSessions: number; revenue30d: number; newUsers30d: number };
  revenue30d: { period: string; totalRevenueVnd: number }[];
  peakHours: { hour: number; avgSessions: number }[];
  topStations: { stationId: string; revenue: number; utilizationRate: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass px-3 py-2 text-xs text-white">
      <p className="text-text-muted mb-1">{label}</p>
      <p className="font-semibold text-cyan">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

function MetricCard({
  title, value, sub, icon: Icon, color, trend
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; trend?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="metric-card"
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-success' : 'text-danger'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-text-muted text-[11px] uppercase tracking-widest font-medium">{title}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-text-muted text-xs mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['analytics-dashboard'],
    queryFn: async () => (await apiClient.get('/analytics/dashboard')).data,
    refetchInterval: 30_000,
  });

  const kpi = data?.latestKpi;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-white">{t('dashboard:home.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:home.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20">
          <span className="glow-dot bg-success animate-pulse-glow" />
          <span className="text-success text-xs font-semibold">{t('common:common.live')}</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={t('dashboard:home.kpi.active_sessions')}
          value={isLoading ? '—' : (kpi?.activeSessions ?? 0)}
          icon={Battery}
          color="bg-cyan/80"
          trend={12}
        />
        <MetricCard
          title={t('dashboard:home.kpi.revenue_30d')}
          value={isLoading ? '—' : formatCurrency(kpi?.revenue30d ?? 0)}
          icon={DollarSign}
          color="bg-lime/70"
          trend={8}
        />
        <MetricCard
          title={t('dashboard:home.kpi.new_users_30d')}
          value={isLoading ? '—' : (kpi?.newUsers30d ?? 0)}
          icon={Users}
          color="bg-info/80"
          trend={5}
        />
        <MetricCard
          title={t('dashboard:home.kpi.conversion_rate')}
          value="78.4%"
          icon={TrendingUp}
          color="bg-warning/70"
          trend={3}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white">{t('dashboard:home.charts.revenue_title')}</h3>
              <p className="text-text-muted text-xs mt-0.5">{t('dashboard:home.charts.revenue_sub')}</p>
            </div>
            <Activity className="w-5 h-5 text-text-muted" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data?.revenue30d ?? []}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10bfc9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10bfc9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="period" tick={{ fill: '#7d7d7d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7d7d7d', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1e6).toFixed(0)}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="totalRevenueVnd" stroke="#10bfc9" strokeWidth={2} fill="url(#revenueGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white">{t('dashboard:home.charts.peak_title')}</h3>
              <p className="text-text-muted text-xs mt-0.5">{t('dashboard:home.charts.peak_sub')}</p>
            </div>
            <Zap className="w-5 h-5 text-text-muted" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.peakHours ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="hour" tick={{ fill: '#7d7d7d', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
              <YAxis tick={{ fill: '#7d7d7d', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(24,24,24,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: 12 }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="avgSessions" fill="#9aed57" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Stations */}
      <div className="glass p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-white">{t('dashboard:home.charts.top_stations_title')}</h3>
            <p className="text-text-muted text-xs mt-0.5">{t('dashboard:home.charts.top_stations_sub')}</p>
          </div>
          <MapPin className="w-5 h-5 text-text-muted" />
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
                  <td className="text-text-muted">{i + 1}</td>
                  <td className="font-mono text-xs text-white">{s.stationId.slice(0, 8)}…</td>
                  <td className="text-cyan font-semibold">{formatCurrency(s.revenue)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-gradient"
                          style={{ width: `${s.utilizationRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-muted">{s.utilizationRate.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td><span className="badge badge-success">{t('dashboard:data.status.ACTIVE')}</span></td>
                </tr>
              ))}
              {!data?.topStations?.length && (
                <tr>
                  <td colSpan={5} className="text-center text-text-muted py-8">{t('common:common.no_data')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
