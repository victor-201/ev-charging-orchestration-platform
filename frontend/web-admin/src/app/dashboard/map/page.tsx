/**
 * Station Map Page Component
 *
 * Renders the interactive geospatial map dashboard representing station locations,
 * charging capacity statistics, status filters, and real-time network statuses.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const StationMap = dynamic(() => import('@/features/infrastructure/components/StationMap'), { ssr: false });

type Station = {
  id: string; name: string; address: string; status: string;
  latitude: number; longitude: number; totalChargers: number; availableChargers: number;
};

export default function MapPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const { t } = useTranslation(['dashboard', 'common']);

  const { data, isLoading } = useQuery<{ items: Station[]; total: number }>({
    queryKey: ['stations', statusFilter],
    queryFn: async () => (await apiClient.get('/stations', {
      params: statusFilter !== 'all' ? { status: statusFilter } : {}
    })).data,
    refetchInterval: 60_000,
  });

  const stations = data?.items ?? [];

  const getStatusLabel = (status: string) => {
    const key = status.toUpperCase();
    switch(key) {
      case 'ACTIVE': return { label: t('dashboard:data.status.ACTIVE'), cls: 'badge-success' };
      case 'MAINTENANCE': return { label: t('dashboard:data.status.MAINTENANCE'), cls: 'badge-warning' };
      case 'CLOSED': 
      case 'INACTIVE': return { label: t('dashboard:data.status.INACTIVE'), cls: 'badge-danger' };
      default: return { label: t(`dashboard:data.status.${key}`, { defaultValue: status }), cls: 'badge-muted' };
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-white">{t('dashboard:map.title')}</h1>
          <p className="text-text-muted text-sm mt-1">
            {t('dashboard:map.subtitle', { total: data?.total ?? 0 })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ev-input w-40 h-9 text-sm"
          >
            <option value="all">{t('dashboard:map.filter_all')}</option>
            <option value="active">{t('dashboard:map.filter_active')}</option>
            <option value="maintenance">{t('dashboard:map.filter_maintenance')}</option>
            <option value="inactive">{t('dashboard:map.filter_inactive')}</option>
          </select>
          <button className="btn-primary flex items-center gap-2 h-9 px-4 text-sm">
            <Plus className="w-4 h-4" /> {t('dashboard:map.add_station')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass overflow-hidden" style={{ height: '520px' }}>
          <StationMap stations={stations} />
        </div>

        <div className="glass flex flex-col" style={{ height: '520px' }}>
          <div className="px-5 py-4 border-b border-white/5">
            <p className="font-semibold text-white text-sm">{t('dashboard:map.station_list')}</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-white/5">
                {stations.map((s) => {
                  const statusObj = getStatusLabel(s.status);
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-4 py-3.5 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{s.name}</p>
                          <p className="text-text-muted text-xs truncate mt-0.5">{s.address}</p>
                        </div>
                        <span className={`badge ${statusObj.cls} shrink-0`}>
                          {statusObj.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          {s.availableChargers > 0 ? <Wifi className="w-3.5 h-3.5 text-success" /> : <WifiOff className="w-3.5 h-3.5 text-danger" />}
                          {t('dashboard:map.chargers_available', { available: s.availableChargers, total: s.totalChargers })}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
