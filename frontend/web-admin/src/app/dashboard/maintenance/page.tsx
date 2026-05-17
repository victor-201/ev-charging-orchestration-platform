'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { relativeTimeLocale } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Incident = {
  id: string; stationId: string; chargerId?: string;
  description: string; severity: string; status: string;
  createdAt: string;
};

type Maintenance = {
  id: string; stationId: string; scheduledStartTime: string;
  scheduledEndTime: string; status: string; reason: string;
};

export default function MaintenancePage() {
  const [tab, setTab] = useState<'incidents' | 'schedules'>('incidents');
  const { t } = useTranslation(['dashboard', 'common']);

  const { data: incidents, isLoading: loadingInc } = useQuery<Incident[]>({
    queryKey: ['incidents'],
    queryFn: async () => (await apiClient.get('/stations/incidents', { params: { limit: 50 } })).data,
  });

  const { data: maintenanceList, isLoading: loadingMaint } = useQuery<Maintenance[]>({
    queryKey: ['maintenance'],
    queryFn: async () => (await apiClient.get('/stations/maintenance', { params: { status: 'SCHEDULED' } })).data,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-white">{t('dashboard:maintenance.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:maintenance.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button
          onClick={() => setTab('incidents')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 flex items-center gap-2 ${
            tab === 'incidents' ? 'bg-danger/20 text-danger border border-danger/25' : 'text-text-muted hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> {t('dashboard:maintenance.tab_incidents')}
        </button>
        <button
          onClick={() => setTab('schedules')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 flex items-center gap-2 ${
            tab === 'schedules' ? 'bg-warning/20 text-warning border border-warning/25' : 'text-text-muted hover:text-white'
          }`}
        >
          <Wrench className="w-4 h-4" /> {t('dashboard:maintenance.tab_schedules')}
        </button>
      </div>

      <div className="glass overflow-hidden">
        {tab === 'incidents' ? (
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:maintenance.table_inc.station')}</th>
                  <th>{t('dashboard:maintenance.table_inc.desc')}</th>
                  <th>{t('dashboard:maintenance.table_inc.severity')}</th>
                  <th>{t('dashboard:maintenance.table_inc.status')}</th>
                  <th>{t('dashboard:maintenance.table_inc.time')}</th>
                  <th>{t('dashboard:maintenance.table_inc.action')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingInc ? (
                   <tr><td colSpan={6} className="text-center py-8 text-text-muted">{t('common:common.loading')}</td></tr>
                ) : incidents?.map((inc) => (
                  <motion.tr key={inc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td className="font-mono text-xs text-white">{inc.stationId.slice(0,8)}</td>
                    <td className="max-w-xs truncate" title={inc.description}>{inc.description}</td>
                    <td>
                      <span className={`badge ${inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'badge-danger' : 'badge-warning'}`}>
                        {t(`dashboard:data.severity.${inc.severity}`)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${inc.status === 'RESOLVED' ? 'badge-success' : 'badge-muted'}`}>
                        {t(`dashboard:data.status.${inc.status}`)}
                      </span>
                    </td>
                    <td className="text-xs text-text-muted">{relativeTimeLocale(inc.createdAt)}</td>
                    <td>
                      {inc.status !== 'RESOLVED' && (
                        <div className="flex gap-2">
                          <button className="text-success text-xs font-medium hover:underline flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t('dashboard:maintenance.resolve')}
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:maintenance.table_maint.station')}</th>
                  <th>{t('dashboard:maintenance.table_maint.reason')}</th>
                  <th>{t('dashboard:maintenance.table_maint.start')}</th>
                  <th>{t('dashboard:maintenance.table_maint.end')}</th>
                  <th>{t('dashboard:maintenance.table_maint.status')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingMaint ? (
                   <tr><td colSpan={5} className="text-center py-8 text-text-muted">{t('common:common.loading')}</td></tr>
                ) : maintenanceList?.map((m) => (
                  <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td className="font-mono text-xs text-white">{m.stationId.slice(0,8)}</td>
                    <td>{m.reason}</td>
                    <td className="text-xs">{new Date(m.scheduledStartTime).toLocaleString()}</td>
                    <td className="text-xs text-text-muted">{new Date(m.scheduledEndTime).toLocaleString()}</td>
                    <td><span className="badge badge-warning">{t(`dashboard:data.status.${m.status}`)}</span></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
