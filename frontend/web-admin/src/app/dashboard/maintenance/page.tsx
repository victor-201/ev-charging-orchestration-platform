'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { relativeTimeLocale } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { Wrench, AlertTriangle, CheckCircle2, Filter } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store/auth.store';

type Incident = {
  id: string;
  stationId: string;
  chargerId?: string;
  description: string;
  severity: string;
  status: string;
  createdAt: string;
};

type Maintenance = {
  id: string;
  stationId: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  status: string;
  reason: string;
};

type PagedIncidents = { items: Incident[]; total: number };
type PagedMaintenance = { items: Maintenance[]; total: number };

const LIMIT = 15;

export default function MaintenancePage() {
  const [tab, setTab] = useState<'incidents' | 'schedules'>('incidents');
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('admin');
  const queryClient = useQueryClient();

  const staffStationIds: string[] = user?.stationIds?.length
    ? user.stationIds
    : user?.stationId
      ? [user.stationId]
      : [];

  const assignedStationId = staffStationIds[0] || null;

  // Page and filter state for incidents
  const [incPage, setIncPage] = useState(1);
  const [incSeverity, setIncSeverity] = useState('');
  const [incStatus, setIncStatus] = useState('');
  const [incStationId, setIncStationId] = useState('');

  // Page and filter state for schedules
  const [maintPage, setMaintPage] = useState(1);
  const [maintStatus, setMaintStatus] = useState('');
  const [maintStationId, setMaintStationId] = useState('');

  const resetIncPage = () => setIncPage(1);
  const resetMaintPage = () => setMaintPage(1);

  // Fetch Incidents
  const { data: incidentsData, isLoading: loadingInc, refetch: refetchInc } = useQuery<PagedIncidents>({
    queryKey: ['incidents', incPage, incSeverity, incStatus, incStationId, staffStationIds.join(',')],
    queryFn: async () => {
      const offset = (incPage - 1) * LIMIT;
      const params: Record<string, any> = { limit: LIMIT, offset };
      if (incSeverity) params.severity = incSeverity;
      if (incStatus) params.status = incStatus;
      if (!isAdmin && staffStationIds.length) {
        params.stationIds = staffStationIds.join(',');
      } else if (incStationId.trim()) {
        params.stationId = incStationId.trim();
      }
      
      const res = await apiClient.get('/stations/incidents', { params });
      if (Array.isArray(res.data)) {
        return { items: res.data, total: res.data.length };
      }
      return res.data ?? { items: [], total: 0 };
    },
    enabled: tab === 'incidents',
  });

  // Fetch Maintenance Schedules
  const { data: maintData, isLoading: loadingMaint, refetch: refetchMaint } = useQuery<PagedMaintenance>({
    queryKey: ['maintenance', maintPage, maintStatus, maintStationId, staffStationIds.join(',')],
    queryFn: async () => {
      const offset = (maintPage - 1) * LIMIT;
      const params: Record<string, any> = { limit: LIMIT, offset };
      if (maintStatus) params.status = maintStatus;
      if (!isAdmin && staffStationIds.length) {
        params.stationIds = staffStationIds.join(',');
      } else if (maintStationId.trim()) {
        params.stationId = maintStationId.trim();
      }

      const res = await apiClient.get('/stations/maintenance', { params });
      if (Array.isArray(res.data)) {
        return { items: res.data, total: res.data.length };
      }
      return res.data ?? { items: [], total: 0 };
    },
    enabled: tab === 'schedules',
  });

  // Resolve Incident mutation
  const resolveMutation = useMutation({
    mutationFn: async (incidentId: string) => {
      return apiClient.patch(`/stations/incidents/${incidentId}`, { status: 'resolved' });
    },
    onSuccess: () => {
      toast.success(t('dashboard:maintenance.resolve_success') || 'Đã giải quyết sự cố thành công!');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: () => {
      toast.error(t('common:api_errors.UNKNOWN_ERROR') || 'Đã xảy ra lỗi, vui lòng thử lại.');
    },
  });

  // Complete Maintenance mutation
  const completeMaintMutation = useMutation({
    mutationFn: async (maintenanceId: string) => {
      return apiClient.patch(`/stations/maintenance/${maintenanceId}`, {
        endTime: new Date().toISOString(),
        status: 'COMPLETED',
      });
    },
    onSuccess: () => {
      toast.success(t('dashboard:maintenance.complete_success'));
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || t('common:api_errors.UNKNOWN_ERROR'));
    },
  });

  const handleCompleteMaint = (id: string) => {
    completeMaintMutation.mutate(id);
  };

  const handleResolve = (id: string) => {
    resolveMutation.mutate(id);
  };

  const incidents = incidentsData?.items ?? [];
  const incTotal = incidentsData?.total ?? 0;
  const incTotalPages = Math.max(1, Math.ceil(incTotal / LIMIT));

  const maintenanceList = maintData?.items ?? [];
  const maintTotal = maintData?.total ?? 0;
  const maintTotalPages = Math.max(1, Math.ceil(maintTotal / LIMIT));

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">{t('dashboard:maintenance.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:maintenance.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Tab Switcher */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            <button
              onClick={() => setTab('incidents')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                tab === 'incidents' ? 'bg-danger/20 text-danger border border-danger/25' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> {t('dashboard:maintenance.tab_incidents')}
            </button>
            <button
              onClick={() => setTab('schedules')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                tab === 'schedules' ? 'bg-warning/20 text-warning border border-warning/25' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" /> {t('dashboard:maintenance.tab_schedules')}
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc:</span>
          </div>
          {tab === 'incidents' ? (
            <>
              <CustomSelect
                value={incSeverity}
                onChange={(val) => { setIncSeverity(val); resetIncPage(); }}
                options={[
                  { value: '', label: 'Tất cả mức độ' },
                  { value: 'CRITICAL', label: 'Nguy cấp (Critical)' },
                  { value: 'HIGH', label: 'Cao (High)' },
                  { value: 'MEDIUM', label: 'Trung bình (Medium)' },
                  { value: 'LOW', label: 'Thấp (Low)' },
                ]}
                className="w-40 h-9"
              />
              <CustomSelect
                value={incStatus}
                onChange={(val) => { setIncStatus(val); resetIncPage(); }}
                options={[
                  { value: '', label: 'Tất cả trạng thái' },
                  { value: 'pending_confirmation', label: 'Chờ xác nhận' },
                  { value: 'resolved', label: 'Đã giải quyết' },
                ]}
                className="w-40 h-9"
              />
              {isAdmin && (
                <input
                  value={incStationId}
                  onChange={(e) => { setIncStationId(e.target.value); resetIncPage(); }}
                  placeholder="Mã trạm (UUID)..."
                  className="ev-input h-9 text-xs w-44 font-mono"
                />
              )}
              {(incSeverity || incStatus || incStationId) && (
                <button
                  onClick={() => { setIncSeverity(''); setIncStatus(''); setIncStationId(''); resetIncPage(); }}
                  className="text-xs text-text-muted hover:text-danger transition-colors"
                >
                  Xóa bộ lọc
                </button>
              )}
            </>
          ) : (
            <>
              <CustomSelect
                value={maintStatus}
                onChange={(val) => { setMaintStatus(val); resetMaintPage(); }}
                options={[
                  { value: '', label: 'Tất cả trạng thái' },
                  { value: 'SCHEDULED', label: 'Đang lên lịch (Scheduled)' },
                  { value: 'IN_PROGRESS', label: 'Đang tiến hành (In Progress)' },
                  { value: 'COMPLETED', label: 'Đã hoàn thành (Completed)' },
                ]}
                className="w-48 h-9"
              />
              {isAdmin && (
                <input
                  value={maintStationId}
                  onChange={(e) => { setMaintStationId(e.target.value); resetMaintPage(); }}
                  placeholder="Mã trạm (UUID)..."
                  className="ev-input h-9 text-xs w-44 font-mono"
                />
              )}
              {(maintStatus || maintStationId) && (
                <button
                  onClick={() => { setMaintStatus(''); setMaintStationId(''); resetMaintPage(); }}
                  className="text-xs text-text-muted hover:text-danger transition-colors"
                >
                  Xóa bộ lọc
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="glass flex flex-col overflow-hidden min-h-0">
        {tab === 'incidents' ? (
          <>
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="font-semibold text-text-main text-sm">{t('dashboard:maintenance.table_title_inc', { defaultValue: 'Danh sách sự cố trạm sạc' })}</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
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
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  ) : incidents.length ? (
                    incidents.map((inc) => (
                      <motion.tr key={inc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <td className="font-mono text-xs text-text-main" title={inc.stationId}>
                          {inc.stationId.slice(0, 8)}…
                        </td>
                        <td className="max-w-xs truncate" title={inc.description}>{inc.description}</td>
                        <td>
                          <span className={`badge ${inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'badge-danger' : 'badge-warning'}`}>
                            {t(`dashboard:data.severity.${inc.severity}`) || inc.severity}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${inc.status.toUpperCase() === 'RESOLVED' ? 'badge-success' : 'badge-muted'}`}>
                            {t(`dashboard:data.status.${inc.status.toUpperCase()}`) || inc.status}
                          </span>
                        </td>
                        <td className="text-xs text-text-muted">{relativeTimeLocale(inc.createdAt)}</td>
                        <td>
                          {(isAdmin || user?.roles?.includes('staff')) && inc.status.toUpperCase() !== 'RESOLVED' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolve(inc.id)}
                                disabled={resolveMutation.isPending}
                                className="text-success text-xs font-medium hover:underline flex items-center gap-1 disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> {t('dashboard:maintenance.resolve')}
                              </button>
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-text-muted">{t('common:common.no_data')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="font-semibold text-text-main text-sm">{t('dashboard:maintenance.table_title_maint', { defaultValue: 'Danh sách lịch trình bảo trì' })}</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
            <div className="overflow-x-auto">
              <table className="ev-table">
                <thead>
                  <tr>
                    <th>{t('dashboard:maintenance.table_maint.station')}</th>
                    <th>{t('dashboard:maintenance.table_maint.reason')}</th>
                    <th>{t('dashboard:maintenance.table_maint.start')}</th>
                    <th>{t('dashboard:maintenance.table_maint.end')}</th>
                    <th>{t('dashboard:maintenance.table_maint.status')}</th>
                    <th>{t('dashboard:maintenance.table_inc.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMaint ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  ) : maintenanceList.length ? (
                    maintenanceList.map((m) => (
                      <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <td className="font-mono text-xs text-text-main" title={m.stationId}>
                          {m.stationId.slice(0, 8)}…
                        </td>
                        <td>{m.reason}</td>
                        <td className="text-xs">{new Date(m.scheduledStartTime).toLocaleString()}</td>
                        <td className="text-xs text-text-muted">{new Date(m.scheduledEndTime).toLocaleString()}</td>
                        <td>
                          <span className={`badge ${m.status === 'IN_PROGRESS' ? 'badge-warning' : m.status === 'COMPLETED' ? 'badge-success' : 'badge-muted'}`}>
                            {t(`dashboard:data.status.${m.status}`) || m.status}
                          </span>
                        </td>
                        <td>
                          {(isAdmin || user?.roles?.includes('staff')) && m.status !== 'COMPLETED' && (
                            <button
                              onClick={() => handleCompleteMaint(m.id)}
                              disabled={completeMaintMutation.isPending}
                              className="text-success text-xs font-medium hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> {t('dashboard:maintenance.complete')}
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-text-muted">{t('common:common.no_data')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )} 
      </div>

      {/* Standalone Pagination */}
      <div className="glass px-4 shrink-0">
        {tab === 'incidents' ? (
          <Pagination
            page={incPage}
            totalPages={incTotalPages}
            onPageChange={setIncPage}
            total={incTotal}
            currentItemsCount={incidents.length}
            itemLabel="sự cố"
          />
        ) : (
          <Pagination
            page={maintPage}
            totalPages={maintTotalPages}
            onPageChange={setMaintPage}
            total={maintTotal}
            currentItemsCount={maintenanceList.length}
            itemLabel="lịch trình"
          />
        )}
      </div>
    </div>
  );
}
