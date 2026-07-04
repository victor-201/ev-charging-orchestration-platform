'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, Zap, BarChart2, Users, Filter,
  RefreshCw, ShieldAlert,
} from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend, Cell,
} from 'recharts';
import { formatCurrency } from '@/i18n/formatter';
import { useAuthStore } from '@/features/auth/store/auth.store';

// ─── Types ────────────────────────────────────────────────────────────────────

type RevenueRow  = { metric_date?: string; billing_month?: string; total_revenue_vnd: string; total_sessions?: string; total_transactions?: string };
type UsageRow    = { station_id: string; total_sessions: string; total_kwh: string; total_revenue_vnd: string; avg_session_min?: string };
type PeakHour    = { hourOfDay: number; avgSessions: number; avgKwh: number; totalSessions: number; isPeak: boolean; peakScore: number; rank: number };
type ForecastItem = { hourOfDay: number; forecastSessions: number; confidence: number };

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function GlassTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card-bg)', backdropFilter: 'blur(20px)',
      border: '1px solid var(--card-border)', borderRadius: '12px',
      padding: '10px 14px', fontSize: 12, color: 'var(--text-main)',
    }}>
      <p style={{ color: 'var(--text-faded)', marginBottom: 4 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color ?? '#10bfc9', fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number'
            ? formatCurrency(p.value)
            : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, subtitle, icon: Icon, accent, children, filters }: {
  title: string; subtitle: string; icon: React.ElementType;
  accent: string; children: React.ReactNode; filters?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-6 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-text-main">{title}</h3>
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          </div>
        </div>
        {filters && <div className="flex flex-wrap gap-2 items-center">{filters}</div>}
      </div>
      {children}
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user, isCheckingAuth } = useAuthStore();
  const { t } = useTranslation('dashboard');

  const isAdmin = user?.roles?.includes('admin');

  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-danger animate-pulse" />
        <h2 className="text-xl font-bold text-text-main">Không có quyền truy cập</h2>
        <p className="text-text-muted text-sm max-w-sm text-center">
          Bạn không có quyền quản trị để xem trang này. Vui lòng liên hệ với quản trị viên hệ thống để biết thêm chi tiết.
        </p>
      </div>
    );
  }

  // ── Revenue filters ──
  const [revRange, setRevRange]   = useState<'monthly' | 'daily'>('daily');
  const [revDays, setRevDays]     = useState(30);
  const [revStation, setRevStation] = useState('');

  // ── Usage filters ──
  const [usageStation, setUsageStation] = useState('');
  const [usageDays, setUsageDays]       = useState(30);

  // ── Peak hours filters ──
  const [peakStation, setPeakStation]   = useState('');
  const [peakLookback, setPeakLookback] = useState(28);
  const [peakForecast, setPeakForecast] = useState(false);

  // ── Pagination for usage top stations ──
  const USAGE_LIMIT = 20;
  const [usagePage, setUsagePage] = useState(1);

  // ── Queries ──

  const { data: revenueData, isLoading: loadingRev, refetch: refetchRev } = useQuery({
    queryKey: ['analytics-revenue', revRange, revDays, revStation],
    queryFn: async () => {
      const params: any = { range: revRange, days: revDays };
      if (revStation.trim()) params.stationId = revStation.trim();
      return (await apiClient.get('/analytics/revenue', { params })).data;
    },
  });

  const { data: usageData, isLoading: loadingUsage, refetch: refetchUsage } = useQuery({
    queryKey: ['analytics-usage', usageStation, usageDays],
    queryFn: async () => {
      const params: any = { days: usageDays };
      if (usageStation.trim()) params.stationId = usageStation.trim();
      return (await apiClient.get('/analytics/usage', { params })).data;
    },
  });

  const { data: peakData, isLoading: loadingPeak, refetch: refetchPeak } = useQuery({
    queryKey: ['analytics-peak-hours', peakStation, peakLookback, peakForecast],
    queryFn: async () => {
      const params: any = { lookbackDays: peakLookback, forecast: peakForecast };
      if (peakStation.trim()) params.stationId = peakStation.trim();
      return (await apiClient.get('/analytics/peak-hours', { params })).data;
    },
  });

  // ── Derived data ──

  const revRows: RevenueRow[] = revRange === 'monthly'
    ? (revenueData?.monthly ?? [])
    : (revenueData?.daily   ?? []);

  const chartRevRows = revRows.map((r: any) => ({
    label: r.metric_date?.slice(0, 10) ?? r.billing_month ?? '',
    revenue: parseInt(r.total_revenue_vnd ?? r.revenue_vnd ?? '0'),
    sessions: parseInt(r.total_sessions ?? r.sessions ?? '0'),
  }));

  const topStations: UsageRow[] = usageData?.topStations ?? [];
  const paged = topStations.slice((usagePage - 1) * USAGE_LIMIT, usagePage * USAGE_LIMIT);
  const usageTotalPages = Math.max(1, Math.ceil(topStations.length / USAGE_LIMIT));

  const peakHours: PeakHour[] = [...(peakData?.peakHours ?? [])].sort((a, b) => a.hourOfDay - b.hourOfDay);
  const forecastItems: ForecastItem[] = peakData?.forecast ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">{t('analytics.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('analytics.subtitle')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
      {/* ── Revenue Analytics ─────────────────────────────────────── */}
      <Section
        title={t('analytics.revenue_breakdown.title')}
        subtitle={t('analytics.revenue_breakdown.subtitle')}
        icon={TrendingUp}
        accent="bg-gradient-to-br from-cyan to-lime"
        filters={
          <>
            <CustomSelect
              value={revRange}
              onChange={(val) => setRevRange(val as 'monthly' | 'daily')}
              options={[
                { value: 'daily', label: 'Theo ngày' },
                { value: 'monthly', label: 'Theo tháng' },
              ]}
              className="w-32 h-8"
            />
            {revRange === 'daily' && (
              <CustomSelect
                value={String(revDays)}
                onChange={(val) => setRevDays(Number(val))}
                options={[
                  { value: '7', label: '7 ngày' },
                  { value: '14', label: '14 ngày' },
                  { value: '30', label: '30 ngày' },
                  { value: '90', label: '90 ngày' },
                ]}
                className="w-28 h-8"
              />
            )}
            <input
              value={revStation}
              onChange={(e) => setRevStation(e.target.value)}
              placeholder="UUID Trạm (tuỳ chọn)"
              className="ev-input h-8 text-xs w-48 font-mono"
            />
            <button onClick={() => refetchRev()} className="btn-secondary p-1.5 h-8">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </>
        }
      >
        {loadingRev ? (
          <div className="h-52 flex items-center justify-center text-text-muted text-sm">Đang tải...</div>
        ) : chartRevRows.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartRevRows}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10bfc9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10bfc9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1e6).toFixed(0)}M`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<GlassTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: 'var(--text-muted)' }} />
              <Area yAxisId="left" type="monotone" dataKey="revenue" name="Doanh thu (VND)" stroke="#10bfc9" strokeWidth={2} fill="url(#revGrad)" />
              <Bar   yAxisId="right" dataKey="sessions" name="Phiên sạc" fill="rgba(154, 237, 87, 0.5)" radius={[3,3,0,0]} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-52 flex items-center justify-center text-text-muted text-sm">Không có dữ liệu</div>
        )}
        {revenueData?.totalRevenue !== undefined && (
          <div className="flex gap-6 pt-2 border-t border-white/5">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Tổng doanh thu</p>
              <p className="text-lg font-bold text-cyan">{formatCurrency(revenueData.totalRevenue)}</p>
            </div>
          </div>
        )}
      </Section>

      {/* ── Station Usage ─────────────────────────────────────────── */}
      <Section
        title="Thống kê sử dụng theo trạm"
        subtitle="Dữ liệu tổng hợp từ số liệu hàng ngày"
        icon={BarChart2}
        accent="bg-gradient-to-br from-violet-500 to-purple-700"
        filters={
          <>
            <input
              value={usageStation}
              onChange={(e) => { setUsageStation(e.target.value); setUsagePage(1); }}
              placeholder="UUID Trạm (tuỳ chọn)"
              className="ev-input h-8 text-xs w-48 font-mono"
            />
            <CustomSelect
              value={String(usageDays)}
              onChange={(val) => { setUsageDays(Number(val)); setUsagePage(1); }}
              options={[
                { value: '7', label: '7 ngày' },
                { value: '14', label: '14 ngày' },
                { value: '30', label: '30 ngày' },
                { value: '90', label: '90 ngày' },
              ]}
              className="w-28 h-8"
            />
            <button onClick={() => refetchUsage()} className="btn-secondary p-1.5 h-8">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </>
        }
      >
        {loadingUsage ? (
          <div className="h-32 flex items-center justify-center text-text-muted text-sm">Đang tải...</div>
        ) : usageStation.trim() && usageData?.summary ? (
          /* Per-station detailed view */
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Tổng phiên sạc',  value: usageData.summary.totalSessions, color: 'text-cyan' },
              { label: 'Tổng điện (kWh)', value: usageData.summary.totalKwh?.toFixed(1), color: 'text-success' },
              { label: 'Doanh thu',        value: formatCurrency(usageData.summary.totalRevenueVnd), color: 'text-warning' },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        ) : topStations.length ? (
          /* Top stations table + pagination */
          <>
            <div className="overflow-x-auto">
              <table className="ev-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Mã trạm</th>
                    <th>Phiên sạc</th>
                    <th>Điện (kWh)</th>
                    <th>Doanh thu</th>
                    <th>TB thời gian (phút)</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s, i) => (
                    <tr key={s.station_id}>
                      <td className="text-text-muted">{(usagePage - 1) * USAGE_LIMIT + i + 1}</td>
                      <td className="font-mono text-xs text-text-main" title={s.station_id}>{s.station_id.slice(0,8)}…</td>
                      <td className="font-semibold text-cyan">{parseInt(s.total_sessions).toLocaleString()}</td>
                      <td className="text-success">{parseFloat(s.total_kwh).toFixed(1)}</td>
                      <td className="text-warning">{formatCurrency(parseInt(s.total_revenue_vnd))}</td>
                      <td className="text-text-muted">{s.avg_session_min ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={usagePage}
              totalPages={usageTotalPages}
              onPageChange={setUsagePage}
              total={topStations.length}
              currentItemsCount={paged.length}
              itemLabel="trạm"
            />
          </>
        ) : (
          <div className="h-32 flex items-center justify-center text-text-muted text-sm">Không có dữ liệu</div>
        )}
      </Section>

      {/* ── Peak Hours Analysis ───────────────────────────────────── */}
      <Section
        title="Phân tích Giờ cao điểm"
        subtitle="Phát hiện khung giờ tải cao và dự báo nhu cầu"
        icon={Zap}
        accent="bg-gradient-to-br from-orange-500 to-red-600"
        filters={
          <>
            <input
              value={peakStation}
              onChange={(e) => setPeakStation(e.target.value)}
              placeholder="UUID Trạm (tuỳ chọn)"
              className="ev-input h-8 text-xs w-48 font-mono"
            />
            <CustomSelect
              value={String(peakLookback)}
              onChange={(val) => setPeakLookback(Number(val))}
              options={[
                { value: '7', label: '7 ngày' },
                { value: '14', label: '14 ngày' },
                { value: '28', label: '28 ngày' },
                { value: '60', label: '60 ngày' },
              ]}
              className="w-32 h-8"
            />
            <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={peakForecast}
                onChange={(e) => setPeakForecast(e.target.checked)}
                disabled={!peakStation.trim()}
                className="w-3.5 h-3.5 rounded accent-orange-500"
              />
              <span className={!peakStation.trim() ? 'opacity-40' : ''}>
                Dự báo ngày mai
              </span>
            </label>
            <button onClick={() => refetchPeak()} className="btn-secondary p-1.5 h-8">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </>
        }
      >
        {loadingPeak ? (
          <div className="h-52 flex items-center justify-center text-text-muted text-sm">Đang tải...</div>
        ) : peakHours.length ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={peakHours}>
                <defs>
                  <linearGradient id="peakGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hourOfDay" tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
                <YAxis tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--card-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--card-border)', borderRadius: '12px', fontSize: 12 }}
                  formatter={(value: any, name: any) => [`${value}`, name === 'avgSessions' ? 'TB phiên/giờ' : 'Điện TB (kWh)']}
                  labelFormatter={(l) => `${l}h - ${Number(l)+1}h`}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="avgSessions" name="TB phiên/giờ" stroke="#f97316" strokeWidth={2.5} fill="url(#peakGrad)"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!cx || !cy) return <g />;
                    return payload.isPeak
                      ? <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} style={{ filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.9))' }} />
                      : <circle cx={cx} cy={cy} r={2} fill="rgba(255,255,255,0.2)" stroke="none" />;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Top peak periods detail */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/5">
              {peakHours.filter(h => h.isPeak).slice(0, 3).map((p) => (
                <div key={p.hourOfDay} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="w-8 h-8 rounded-lg bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-danger" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text-main">
                      {String(p.hourOfDay).padStart(2,'0')}:00 – {String(p.hourOfDay+1).padStart(2,'0')}:00
                    </p>
                    <p className="text-[10px] text-text-muted truncate">
                      {p.avgSessions.toFixed(2)} phi/h · {p.avgKwh.toFixed(0)} kWh · Hạng #{p.rank}
                    </p>
                  </div>
                  <span className="badge badge-danger text-[10px] ml-auto shrink-0">
                    {(p.peakScore * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Demand forecast (only shown if stationId was provided and checkbox enabled) */}
            {forecastItems.length > 0 && (
              <div className="pt-3 border-t border-white/5">
                <p className="text-xs font-semibold text-text-muted mb-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                  Dự báo ngày mai (EWA)
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={[...forecastItems].sort((a,b) => a.hourOfDay - b.hourOfDay)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="hourOfDay" tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
                    <YAxis tick={{ fill: 'var(--text-faded)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '12px', fontSize: 12 }}
                      formatter={(v: any) => [`${v}`, 'Dự báo phiên']}
                    />
                    <Bar dataKey="forecastSessions" name="Dự báo" radius={[4,4,0,0]}>
                      {forecastItems.map((_, i) => (
                        <Cell key={i} fill="rgba(16, 191, 201, 0.6)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="h-52 flex items-center justify-center text-text-muted text-sm">Không có dữ liệu</div>
        )}
      </Section>
      </div>
    </div>
  );
}
