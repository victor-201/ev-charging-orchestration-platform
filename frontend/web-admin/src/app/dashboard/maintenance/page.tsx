'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { relativeTimeLocale, tSafe, translateMessage } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { Wrench, AlertTriangle, CheckCircle2, Filter, Plus, Loader2, Zap } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import GlassModal, { ModalHeader, ModalField } from '@/core/theme/GlassModal';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store/auth.store';

type Incident = {
  id: string;
  stationId: string;
  pointId?: string | null;
  reportedBy?: string | null;
  description: string;
  severity: string;
  status: string;
  createdAt: string;
};

type Maintenance = {
  id: string;
  stationId: string;
  startTime: string;
  endTime: string;
  reason: string;
  scheduledBy: string;
  createdAt: string;
};

type PagedIncidents = { items: Incident[]; total: number };
type PagedMaintenance = { items: Maintenance[]; total: number };

const LIMIT = 20;

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

  // Modal visibility states
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showMaintModal, setShowMaintModal] = useState(false);

  // Form states - Incident
  const [formIncidentStationId, setFormIncidentStationId] = useState('');
  const [formIncidentChargerId, setFormIncidentChargerId] = useState('');
  const [formIncidentSeverity, setFormIncidentSeverity] = useState('MEDIUM');
  const [formIncidentDescription, setFormIncidentDescription] = useState('');

  // Form states - Maintenance
  const [formMaintStationId, setFormMaintStationId] = useState('');
  const [formMaintStartTime, setFormMaintStartTime] = useState('');
  const [formMaintEndTime, setFormMaintEndTime] = useState('');
  const [formMaintReason, setFormMaintReason] = useState('');
  const [formMaintTechnicianId, setFormMaintTechnicianId] = useState('');

  // Helper to validate UUID format
  const isValidUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Fetch chargers for the selected station in the report modal
  const { data: incidentChargers = [], isLoading: loadingChargers } = useQuery<any[]>({
    queryKey: ['station-chargers', formIncidentStationId],
    queryFn: async () => {
      if (!isValidUUID(formIncidentStationId)) return [];
      const res = await apiClient.get(`/stations/${formIncidentStationId}/chargers`);
      return res.data ?? [];
    },
    enabled: isValidUUID(formIncidentStationId),
  });

  // Reset selected charger when selected station changes
  useEffect(() => {
    setFormIncidentChargerId('');
  }, [formIncidentStationId]);

  // Fetch stations for dropdowns (only for staff, since we have their IDs)
  const { data: staffStations = [] } = useQuery<any[]>({
    queryKey: ['staff-stations-lookup', staffStationIds.join(',')],
    queryFn: async () => {
      if (staffStationIds.length === 0) return [];
      const params = {
        ids: staffStationIds.join(','),
        limit: staffStationIds.length,
      };
      const res = await apiClient.get('/stations', { params });
      return res.data?.items ?? [];
    },
    enabled: staffStationIds.length > 0,
  });

  const stationOptions = staffStations.map((st: any) => ({
    value: st.id,
    label: st.name || st.id,
  }));

  // Report Incident Mutation
  const reportIncidentMutation = useMutation({
    mutationFn: async (payload: {
      stationId: string;
      chargerId?: string;
      severity: string;
      description: string;
    }) => {
      return apiClient.post('/stations/incidents', payload);
    },
    onSuccess: () => {
      toast.success(tSafe('dashboard:maintenance.report_incident_success', 'Báo cáo sự cố thành công!'));
      setShowIncidentModal(false);
      // Reset form
      setFormIncidentStationId('');
      setFormIncidentChargerId('');
      setFormIncidentSeverity('MEDIUM');
      setFormIncidentDescription('');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (err: any) => {
      toast.error(translateMessage(err?.response?.data?.message, 'common:api_errors.UNKNOWN_ERROR'));
    },
  });

  // Schedule Maintenance Mutation
  const scheduleMaintMutation = useMutation({
    mutationFn: async (payload: {
      stationId: string;
      scheduledStartTime: string;
      scheduledEndTime: string;
      reason: string;
      technicianId?: string;
    }) => {
      return apiClient.post('/stations/maintenance', payload);
    },
    onSuccess: () => {
      toast.success(tSafe('dashboard:maintenance.schedule_success', 'Lên lịch bảo trì thành công!'));
      setShowMaintModal(false);
      // Reset form
      setFormMaintStationId('');
      setFormMaintStartTime('');
      setFormMaintEndTime('');
      setFormMaintReason('');
      setFormMaintTechnicianId('');
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
    onError: (err: any) => {
      toast.error(translateMessage(err?.response?.data?.message, 'common:api_errors.UNKNOWN_ERROR'));
    },
  });

  const handleReportIncidentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formIncidentStationId) {
      toast.error(tSafe('dashboard:maintenance.station_required', 'Vui lòng chọn trạm sạc!'));
      return;
    }
    if (!formIncidentDescription.trim()) {
      toast.error(tSafe('dashboard:maintenance.desc_required', 'Vui lòng nhập mô tả sự cố!'));
      return;
    }

    reportIncidentMutation.mutate({
      stationId: formIncidentStationId,
      chargerId: formIncidentChargerId.trim() || undefined,
      severity: formIncidentSeverity,
      description: formIncidentDescription.trim(),
    });
  };

  const handleScheduleMaintSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMaintStationId) {
      toast.error(tSafe('dashboard:maintenance.station_required', 'Vui lòng chọn trạm sạc!'));
      return;
    }
    if (!formMaintStartTime || !formMaintEndTime) {
      toast.error(tSafe('dashboard:maintenance.times_required', 'Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc!'));
      return;
    }
    if (!formMaintReason.trim()) {
      toast.error(tSafe('dashboard:maintenance.reason_required', 'Vui lòng nhập lý do bảo trì!'));
      return;
    }

    const startIso = new Date(formMaintStartTime).toISOString();
    const endIso = new Date(formMaintEndTime).toISOString();

    if (new Date(startIso) >= new Date(endIso)) {
      toast.error(tSafe('dashboard:maintenance.time_invalid', 'Thời gian kết thúc phải sau thời gian bắt đầu!'));
      return;
    }

    scheduleMaintMutation.mutate({
      stationId: formMaintStationId,
      scheduledStartTime: startIso,
      scheduledEndTime: endIso,
      reason: formMaintReason.trim(),
      technicianId: formMaintTechnicianId.trim() || undefined,
    });
  };

  // Fetch Incidents
  const { data: incidentsData, isLoading: loadingInc, refetch: refetchInc } = useQuery<PagedIncidents>({
    queryKey: ['incidents', incPage, incSeverity, incStatus, incStationId, staffStationIds.join(',')],
    queryFn: async () => {
      const offset = (incPage - 1) * LIMIT;
      const params: Record<string, any> = { limit: LIMIT, offset };
      if (incSeverity) params.severity = incSeverity;
      if (incStatus) params.status = incStatus;
      if (incStationId.trim()) {
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
      if (maintStationId.trim()) {
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
      toast.success(tSafe('dashboard:maintenance.resolve_success', 'Đã giải quyết sự cố thành công!'));
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (err: any) => {
      toast.error(translateMessage(err?.response?.data?.message, 'common:api_errors.UNKNOWN_ERROR'));
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
      toast.success(tSafe('dashboard:maintenance.complete_success', 'Đã hoàn thành bảo trì!'));
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
    onError: (err: any) => {
      toast.error(translateMessage(err?.response?.data?.message, 'common:api_errors.UNKNOWN_ERROR'));
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

  // Extract unique station IDs from page data to fetch details dynamically if needed
  const pageStationIds = Array.from(
    new Set([
      ...incidents.map((i) => i.stationId),
      ...maintenanceList.map((m) => m.stationId),
    ])
  ).filter(Boolean);

  const { data: resolvedStations = [] } = useQuery<any[]>({
    queryKey: ['stations-resolved-names', pageStationIds.join(',')],
    queryFn: async () => {
      if (pageStationIds.length === 0) return [];
      const res = await apiClient.get('/stations', {
        params: {
          ids: pageStationIds.join(','),
          limit: pageStationIds.length,
        },
      });
      return res.data?.items ?? [];
    },
    enabled: pageStationIds.length > 0,
  });

  // Combine both list and resolved lookup sources into a unified map
  const stationsMap = new Map<string, { id: string; name: string }>();
  staffStations.forEach((st: any) => {
    if (st?.id) stationsMap.set(st.id, st);
  });
  resolvedStations.forEach((st: any) => {
    if (st?.id) stationsMap.set(st.id, st);
  });

  // Collect unique user IDs from both incidents and maintenance list to resolve names
  const pageUserIds = Array.from(
    new Set([
      ...incidents.map((i) => i.reportedBy).filter(Boolean),
      ...maintenanceList.map((m) => m.scheduledBy).filter(Boolean),
    ])
  ) as string[];

  const { data: resolvedUsers = [] } = useQuery<any[]>({
    queryKey: ['users-resolved-names', pageUserIds.join(',')],
    queryFn: async () => {
      if (pageUserIds.length === 0) return [];
      const res = await apiClient.get('/users', {
        params: {
          ids: pageUserIds.join(','),
          role: 'all',
          limit: pageUserIds.length,
        },
      });
      return res.data?.items ?? [];
    },
    enabled: pageUserIds.length > 0,
  });

  const usersMap = new Map<string, { fullName: string; email: string }>();
  resolvedUsers.forEach((u: any) => {
    if (u?.userId) usersMap.set(u.userId, u);
  });

  // Combine both list and resolved lookup sources into a unified map of chargers
  const chargersMap = new Map<string, { code: string; name: string }>();
  const populateChargers = (stationsList: any[]) => {
    stationsList.forEach((st: any) => {
      st.chargers?.forEach((ch: any) => {
        if (ch.id) {
          chargersMap.set(ch.id, {
            code: ch.code || ch.name || ch.id,
            name: ch.name || ch.code || ch.id,
          });
        }
      });
    });
  };
  populateChargers(staffStations);
  populateChargers(resolvedStations);

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
                  { value: 'in_progress', label: 'Đang xử lý' },
                  { value: 'resolved', label: 'Đã giải quyết' },
                  { value: 'rejected', label: 'Từ chối' },
                ]}
                className="w-40 h-9"
              />
              {isAdmin ? (
                <input
                  value={incStationId}
                  onChange={(e) => { setIncStationId(e.target.value); resetIncPage(); }}
                  placeholder="Lọc mã trạm (UUID)..."
                  className="ev-input h-9 text-xs w-44 font-mono pl-3"
                />
              ) : (
                <CustomSelect
                  value={incStationId}
                  onChange={(val) => { setIncStationId(val); resetIncPage(); }}
                  options={[
                    { value: '', label: 'Tất cả trạm sạc' },
                    ...stationOptions,
                  ]}
                  className="w-48 h-9"
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
              {isAdmin ? (
                <input
                  value={maintStationId}
                  onChange={(e) => { setMaintStationId(e.target.value); resetMaintPage(); }}
                  placeholder="Lọc mã trạm (UUID)..."
                  className="ev-input h-9 text-xs w-44 font-mono pl-3"
                />
              ) : (
                <CustomSelect
                  value={maintStationId}
                  onChange={(val) => { setMaintStationId(val); resetMaintPage(); }}
                  options={[
                    { value: '', label: 'Tất cả trạm sạc' },
                    ...stationOptions,
                  ]}
                  className="w-48 h-9"
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

          {/* Action Buttons */}
          {(isAdmin || user?.roles?.includes('staff')) && (
            <button
              onClick={() => {
                if (assignedStationId) {
                  setFormIncidentStationId(assignedStationId);
                }
                setShowIncidentModal(true);
              }}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-danger/20 text-danger border border-danger/25 hover:bg-danger/30 transition-all duration-180 flex items-center gap-1.5 ml-auto"
            >
              <Plus className="w-3.5 h-3.5" /> {tSafe('dashboard:maintenance.report_incident_btn', 'Báo cáo sự cố')}
            </button>
          )}
          {(isAdmin || user?.roles?.includes('staff')) && (
            <button
              onClick={() => {
                if (assignedStationId) {
                  setFormMaintStationId(assignedStationId);
                }
                setShowMaintModal(true);
              }}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-warning/20 text-warning border border-warning/25 hover:bg-warning/30 transition-all duration-180 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> {tSafe('dashboard:maintenance.schedule_maint_btn', 'Lên lịch bảo trì')}
            </button>
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
                    <th>Người báo cáo</th>
                    <th>{t('dashboard:maintenance.table_inc.time')}</th>
                    <th>{t('dashboard:maintenance.table_inc.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingInc ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  ) : incidents.length ? (
                    incidents.map((inc) => (
                      <motion.tr key={inc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <td className="font-semibold text-xs text-text-main" title={inc.stationId}>
                          <div className="flex flex-col gap-0.5 text-left">
                            <span>
                              {stationsMap.get(inc.stationId)?.name || `${inc.stationId.slice(0, 8)}…`}
                            </span>
                            {inc.pointId && (
                              <span className="text-[10px] text-text-muted flex items-center gap-1 font-mono font-normal">
                                <Zap className="w-2.5 h-2.5 text-cyan shrink-0" />
                                {chargersMap.get(inc.pointId)?.code || `${inc.pointId.slice(0, 8)}…`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-xs truncate" title={inc.description}>{inc.description}</td>
                        <td>
                          <span className={`badge ${['CRITICAL', 'HIGH'].includes(inc.severity.toUpperCase()) ? 'badge-danger' : 'badge-warning'}`}>
                            {t(`dashboard:data.severity.${inc.severity.toUpperCase()}`) || inc.severity}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${inc.status.toUpperCase() === 'RESOLVED' ? 'badge-success' : 'badge-muted'}`}>
                            {t(`dashboard:data.status.${inc.status.toUpperCase()}`) || inc.status}
                          </span>
                        </td>
                        <td>
                          {inc.reportedBy ? (
                            <div className="flex flex-col gap-0.5 text-left">
                              <span className="font-semibold text-text-main text-xs">
                                {usersMap.get(inc.reportedBy)?.fullName || 'Hệ thống'}
                              </span>
                              {usersMap.has(inc.reportedBy) && (
                                <span className="text-[10px] text-text-muted">
                                  {usersMap.get(inc.reportedBy)?.email}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-muted text-xs">—</span>
                          )}
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
                      <td colSpan={7} className="text-center py-8 text-text-muted">{t('common:common.no_data')}</td>
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
                    <th>Người lên lịch</th>
                    <th>{t('dashboard:maintenance.table_maint.status')}</th>
                    <th>{t('dashboard:maintenance.table_inc.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMaint ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  ) : maintenanceList.length ? (
                    maintenanceList.map((m) => {
                      const now = Date.now();
                      const start = new Date(m.startTime).getTime();
                      const end = new Date(m.endTime).getTime();
                      const maintStatus = start > now ? 'SCHEDULED' : now >= start && now <= end ? 'IN_PROGRESS' : 'COMPLETED';
                      return (
                        <motion.tr key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <td className="font-semibold text-xs text-text-main" title={m.stationId}>
                            {stationsMap.get(m.stationId)?.name || `${m.stationId.slice(0, 8)}…`}
                          </td>
                          <td>{m.reason}</td>
                          <td className="text-xs">{new Date(m.startTime).toLocaleString()}</td>
                          <td className="text-xs text-text-muted">{new Date(m.endTime).toLocaleString()}</td>
                          <td>
                            <div className="flex flex-col gap-0.5 text-left font-sans font-normal">
                              <span className="font-semibold text-text-main text-xs">
                                {usersMap.get(m.scheduledBy)?.fullName || 'Hệ thống'}
                              </span>
                              {usersMap.has(m.scheduledBy) && (
                                <span className="text-[10px] text-text-muted">
                                  {usersMap.get(m.scheduledBy)?.email}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${maintStatus === 'IN_PROGRESS' ? 'badge-warning' : maintStatus === 'COMPLETED' ? 'badge-success' : 'badge-muted'}`}>
                              {t(`dashboard:data.status.${maintStatus}`) || maintStatus}
                            </span>
                          </td>
                          <td>
                            {(isAdmin || user?.roles?.includes('staff')) && maintStatus !== 'COMPLETED' && (
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
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-text-muted">{t('common:common.no_data')}</td>
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

      {/* Report Incident Modal */}
      <GlassModal open={showIncidentModal} onClose={() => setShowIncidentModal(false)} className="max-w-md">
        <ModalHeader onClose={() => setShowIncidentModal(false)}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-danger/15">
            <AlertTriangle className="w-4 h-4 text-danger" />
          </div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-text-main">
            {tSafe('dashboard:maintenance.report_incident_title', 'Báo cáo sự cố trạm sạc')}
          </h3>
        </ModalHeader>

        <form onSubmit={handleReportIncidentSubmit} className="space-y-4">
          <ModalField label={tSafe('dashboard:maintenance.form.station', 'Trạm sạc *')}>
            {isAdmin ? (
              <input
                type="text"
                value={formIncidentStationId}
                onChange={(e) => setFormIncidentStationId(e.target.value)}
                placeholder="Nhập mã trạm (UUID)..."
                className="ev-input w-full h-8 px-2.5 text-xs font-mono"
              />
            ) : (
              <CustomSelect
                value={formIncidentStationId}
                onChange={setFormIncidentStationId}
                options={stationOptions}
                placeholder={tSafe('dashboard:maintenance.form.select_station', 'Chọn trạm sạc...')}
                disabled={staffStationIds.length === 1}
              />
            )}
          </ModalField>

          <ModalField label={tSafe('dashboard:maintenance.form.charger', 'Trụ sạc (Tùy chọn)')}>
            <CustomSelect
              value={formIncidentChargerId}
              onChange={setFormIncidentChargerId}
              options={[
                { value: '', label: 'Tất cả trụ sạc / Không chỉ định' },
                ...incidentChargers.map((ch: any) => ({
                  value: ch.id,
                  label: `${ch.code || ch.name || ch.id} (${ch.status || 'Unknown'})`,
                })),
              ]}
              disabled={!formIncidentStationId || loadingChargers}
              placeholder={
                !formIncidentStationId
                  ? 'Vui lòng chọn trạm trước...'
                  : loadingChargers
                    ? 'Đang tải danh sách trụ sạc...'
                    : 'Chọn trụ sạc nếu có...'
              }
            />
          </ModalField>

          <ModalField label={tSafe('dashboard:maintenance.form.severity', 'Mức độ nghiêm trọng')}>
            <CustomSelect
              value={formIncidentSeverity}
              onChange={setFormIncidentSeverity}
              options={[
                { value: 'CRITICAL', label: 'Nguy cấp (Critical)' },
                { value: 'HIGH', label: 'Cao (High)' },
                { value: 'MEDIUM', label: 'Trung bình (Medium)' },
                { value: 'LOW', label: 'Thấp (Low)' },
              ]}
            />
          </ModalField>

          <ModalField label={tSafe('dashboard:maintenance.form.description', 'Mô tả chi tiết *')}>
            <textarea
              value={formIncidentDescription}
              onChange={(e) => setFormIncidentDescription(e.target.value)}
              placeholder={tSafe('dashboard:maintenance.form.desc_placeholder', 'Mô tả chi tiết về sự cố gặp phải...')}
              className="ev-input w-full p-2.5 text-xs rounded-xl min-h-[80px] bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-cyan"
            />
          </ModalField>

          <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={() => setShowIncidentModal(false)}
              className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl border border-white/10 hover:bg-white/5 text-text-main"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={reportIncidentMutation.isPending}
              className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-danger/20 rounded-xl transition-all flex items-center gap-1.5 bg-danger hover:bg-danger/80 disabled:opacity-50"
            >
              {reportIncidentMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Gửi báo cáo
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Schedule Maintenance Modal */}
      <GlassModal open={showMaintModal} onClose={() => setShowMaintModal(false)} className="max-w-md">
        <ModalHeader onClose={() => setShowMaintModal(false)}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-warning/15">
            <Wrench className="w-4 h-4 text-warning" />
          </div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-text-main">
            {tSafe('dashboard:maintenance.schedule_maint_title', 'Lên lịch bảo trì')}
          </h3>
        </ModalHeader>

        <form onSubmit={handleScheduleMaintSubmit} className="space-y-4">
          <ModalField label={tSafe('dashboard:maintenance.form.station', 'Trạm sạc *')}>
            {isAdmin ? (
              <input
                type="text"
                value={formMaintStationId}
                onChange={(e) => setFormMaintStationId(e.target.value)}
                placeholder="Nhập mã trạm (UUID)..."
                className="ev-input w-full h-8 px-2.5 text-xs font-mono"
              />
            ) : (
              <CustomSelect
                value={formMaintStationId}
                onChange={setFormMaintStationId}
                options={stationOptions}
                placeholder={tSafe('dashboard:maintenance.form.select_station', 'Chọn trạm sạc...')}
                disabled={staffStationIds.length === 1}
              />
            )}
          </ModalField>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label={tSafe('dashboard:maintenance.form.start_time', 'Thời gian bắt đầu *')}>
              <input
                type="datetime-local"
                value={formMaintStartTime}
                onChange={(e) => setFormMaintStartTime(e.target.value)}
                className="ev-input w-full h-8 px-2.5 text-xs"
              />
            </ModalField>

            <ModalField label={tSafe('dashboard:maintenance.form.end_time', 'Thời gian kết thúc *')}>
              <input
                type="datetime-local"
                value={formMaintEndTime}
                onChange={(e) => setFormMaintEndTime(e.target.value)}
                className="ev-input w-full h-8 px-2.5 text-xs"
              />
            </ModalField>
          </div>

          <ModalField label={tSafe('dashboard:maintenance.form.technician', 'Kỹ thuật viên phụ trách (UUID - Tùy chọn)')}>
            <input
              type="text"
              value={formMaintTechnicianId}
              onChange={(e) => setFormMaintTechnicianId(e.target.value)}
              placeholder={tSafe('dashboard:maintenance.form.technician_placeholder', 'Nhập mã kỹ thuật viên...')}
              className="ev-input w-full h-8 px-2.5 text-xs font-mono"
            />
          </ModalField>

          <ModalField label={tSafe('dashboard:maintenance.form.reason', 'Lý do bảo trì *')}>
            <textarea
              value={formMaintReason}
              onChange={(e) => setFormMaintReason(e.target.value)}
              placeholder={tSafe('dashboard:maintenance.form.reason_placeholder', 'Nhập nội dung bảo trì, lý do...')}
              className="ev-input w-full p-2.5 text-xs rounded-xl min-h-[80px] bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-cyan"
            />
          </ModalField>

          <div className="flex justify-end gap-2 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={() => setShowMaintModal(false)}
              className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl border border-white/10 hover:bg-white/5 text-text-main"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={scheduleMaintMutation.isPending}
              className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-warning/20 rounded-xl transition-all flex items-center gap-1.5 bg-warning hover:bg-warning/80 disabled:opacity-50"
            >
              {scheduleMaintMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Lên lịch
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
