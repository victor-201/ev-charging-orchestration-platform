'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { formatCurrency, relativeTimeLocale } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { StopCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type ChargingSession = {
  id: string; userId: string; chargerId: string; status: string;
  startTime: string; endTime?: string; totalKwh?: number; totalCostVnd?: number;
};

const STATUS_MAP: Record<string, string> = {
  STARTING: 'badge-info',
  CHARGING: 'badge-success',
  COMPLETED: 'badge-muted',
  STOPPED: 'badge-warning',
  ERROR: 'badge-danger',
};

export default function SessionsPage() {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const { t } = useTranslation(['dashboard', 'common']);

  const { data: history, isLoading } = useQuery<ChargingSession[]>({
    queryKey: ['charging-history', tab],
    queryFn: async () => (await apiClient.get('/charging/history', { params: { limit: 50 } })).data,
    refetchInterval: tab === 'active' ? 10_000 : false,
  });

  const sessions = history ?? [];
  const active = sessions.filter(s => ['STARTING', 'CHARGING'].includes(s.status));
  const displayed = tab === 'active' ? active : sessions;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-white">{t('dashboard:sessions.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:sessions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20">
          <span className="glow-dot bg-success" />
          <span className="text-success text-xs font-semibold">
            {t('dashboard:sessions.active_count', { count: active.length })}
          </span>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button
          onClick={() => setTab('active')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 ${
            tab === 'active' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-white'
          }`}
        >
          {t('dashboard:sessions.tab_active', { count: active.length })}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 ${
            tab === 'history' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-white'
          }`}
        >
          {t('dashboard:sessions.tab_history')}
        </button>
      </div>

      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ev-table">
            <thead>
              <tr>
                <th>{t('dashboard:sessions.table.session_id')}</th>
                <th>{t('dashboard:sessions.table.charger')}</th>
                <th>{t('dashboard:sessions.table.user')}</th>
                <th>{t('dashboard:sessions.table.start')}</th>
                <th>{t('dashboard:sessions.table.energy')}</th>
                <th>{t('dashboard:sessions.table.cost')}</th>
                <th>{t('dashboard:sessions.table.status')}</th>
                <th>{t('dashboard:sessions.table.action')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
                : displayed.map((s) => (
                  <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td className="font-mono text-xs text-white">{s.id.slice(0, 8)}…</td>
                    <td className="font-mono text-xs">{s.chargerId.slice(0, 8)}…</td>
                    <td className="font-mono text-xs">{s.userId.slice(0, 8)}…</td>
                    <td className="text-xs">{relativeTimeLocale(s.startTime)}</td>
                    <td className="text-cyan font-semibold">{s.totalKwh?.toFixed(2) ?? '—'}</td>
                    <td className="text-lime font-semibold">{s.totalCostVnd ? formatCurrency(s.totalCostVnd) : '—'}</td>
                    <td><span className={`badge ${STATUS_MAP[s.status] || 'badge-muted'}`}>{t(`dashboard:data.status.${s.status}`)}</span></td>
                    <td>
                      {['STARTING', 'CHARGING'].includes(s.status) && (
                        <button
                          onClick={() => apiClient.post(`/charging/admin/stop/${s.id}`, { reason: 'Admin force stop' })}
                          className="btn-danger px-3 py-1 text-xs flex items-center gap-1"
                        >
                          <StopCircle className="w-3.5 h-3.5" /> {t('dashboard:sessions.force_stop')}
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
