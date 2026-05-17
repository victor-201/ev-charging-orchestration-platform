'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { TrendingUp, Zap, Calendar, Download } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  Legend
} from 'recharts';
import { useTranslation } from 'react-i18next';

export default function AnalyticsPage() {
  const { t } = useTranslation('dashboard');
  const { data } = useQuery({
    queryKey: ['analytics-full'],
    queryFn: async () => (await apiClient.get('/analytics/dashboard')).data,
  });

  const loadProfile = [
    { time: '00:00', loadKw: 120 }, { time: '04:00', loadKw: 80 },
    { time: '08:00', loadKw: 450 }, { time: '12:00', loadKw: 890 },
    { time: '16:00', loadKw: 1200 }, { time: '20:00', loadKw: 600 },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-white">{t('analytics.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2 h-9 px-4 text-sm">
            <Calendar className="w-4 h-4" /> {t('analytics.last_30d')}
          </button>
          <button className="btn-primary flex items-center gap-2 h-9 px-4 text-sm">
            <Download className="w-4 h-4" /> {t('analytics.export')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-white">{t('analytics.revenue_breakdown.title')}</h3>
              <p className="text-text-muted text-xs mt-0.5">{t('analytics.revenue_breakdown.subtitle')}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-text-muted" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.revenue30d ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: '#7d7d7d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7d7d7d', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1e6).toFixed(0)}M`} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: 'rgba(24,24,24,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#b8b8b8' }} />
              <Bar dataKey="totalRevenueVnd" name={t('analytics.revenue_breakdown.energy')} stackId="a" fill="#10bfc9" radius={[0,0,4,4]} />
              <Bar dataKey={(d) => d.totalRevenueVnd * 0.1} name={t('analytics.revenue_breakdown.idle')} stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-white">{t('analytics.load_profile.title')}</h3>
              <p className="text-text-muted text-xs mt-0.5">{t('analytics.load_profile.subtitle')}</p>
            </div>
            <Zap className="w-5 h-5 text-warning" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={loadProfile}>
              <defs>
                <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#7d7d7d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7d7d7d', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(24,24,24,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
              />
              <Area type="monotone" dataKey="loadKw" name={t('analytics.load_profile.power')} stroke="#f59e0b" strokeWidth={2} fill="url(#loadGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
