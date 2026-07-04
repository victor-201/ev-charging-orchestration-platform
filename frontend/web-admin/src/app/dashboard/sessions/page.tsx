'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { relativeTimeLocale, formatCurrency, formatDate, formatDateTimeStandard, tSafe, translateMessage } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { StopCircle, Filter, Search, ShieldAlert, Eye, Copy, Zap, Clock, Power, PowerOff, Activity, Gauge, Battery, Thermometer, Trash2, Loader2 } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useAuthStore } from '@/features/auth/store/auth.store';
import GlassCard from '@/core/theme/GlassCard';
import GlassModal, { ModalHeader, ModalField, ModalValue, ModalCopyValue } from '@/core/theme/GlassModal';
import { useTelemetrySocket } from '@/features/charging/hooks/useTelemetrySocket';
import type { TelemetryReading } from '@/features/charging/hooks/useTelemetrySocket';
import { KIOSK_GUEST_USER_ID, filterGuestFromUserIds, injectKioskGuest } from '@/lib/kiosk-guest';

type ChargingSession = {
  id: string;
  userId: string;
  chargerId: string;
  bookingId: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  startMeterWh: number;
  startSocPercent: number | null;
  endMeterWh: number | null;
  createdAt: string;
};

type PagedSessions = { items: ChargingSession[]; total: number };

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  stopped: 'badge-warning',
  interrupted: 'badge-danger',
  completed: 'badge-muted',
};

const STATUS_TRANSLATE_KEY: Record<string, string> = {
  active: 'CHARGING',
  stopped: 'STOPPED',
  interrupted: 'ERROR',
  completed: 'COMPLETED',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang sạc' },
  { value: 'stopped', label: 'Đã dừng' },
  { value: 'interrupted', label: 'Bị gián đoạn' },
  { value: 'completed', label: 'Hoàn thành' },
];

const LIMIT = 20;

function calcKwh(session: ChargingSession): number | null {
  if (session.endMeterWh == null || session.startMeterWh == null) return null;
  return (session.endMeterWh - session.startMeterWh) / 1000;
}

function calcDuration(session: ChargingSession): string | null {
  if (!session.endTime) return null;
  const diffMs = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} phút`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}ph` : `${h}h`;
}

function calcEndSocPercent(session: ChargingSession): number | null {
  if (session.startSocPercent == null || session.endMeterWh == null) return null;
  const batteryCapacityWh = 60_000;
  const socGain = ((session.endMeterWh - session.startMeterWh) / batteryCapacityWh) * 100;
  return Math.min(100, Math.max(0, Math.round(session.startSocPercent + socGain)));
}

export default function SessionsPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('admin');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [chargerIdFilter, setChargerIdFilter] = useState('');

  // States for session detail modal
  const [selectedSession, setSelectedSession] = useState<ChargingSession | null>(null);

  // States for confirmation Force Stop modal
  const [stoppingSession, setStoppingSession] = useState<ChargingSession | null>(null);
  const [endMeterWhInput, setEndMeterWhInput] = useState<string>('0');
  const [stopReasonInput, setStopReasonInput] = useState<string>('Admin can thiệp khẩn cấp');
  const [isSubmittingStop, setIsSubmittingStop] = useState<boolean>(false);

  // States for delete session
  const [deletingSession, setDeletingSession] = useState<ChargingSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const resetPage = () => setPage(1);

  // Telemetry socket for live readings
  const [telemetrySessionId, setTelemetrySessionId] = useState<string | null>(null);
  const [telemetryReadings, setTelemetryReadings] = useState<TelemetryReading[]>([]);

  const handleTelemetry = useCallback((data: TelemetryReading) => {
    setTelemetryReadings(prev => [...prev.slice(-29), data]);
  }, []);

  useTelemetrySocket({
    sessionId: telemetrySessionId,
    enabled: telemetrySessionId !== null,
    onTelemetry: handleTelemetry,
  });

  const openTelemetry = (sessionId: string) => {
    setTelemetryReadings([]);
    setTelemetrySessionId(sessionId);
  };

  const { data, isLoading, refetch } = useQuery<PagedSessions>({
    queryKey: ['charging-history', page, statusFilter, userIdFilter, chargerIdFilter],
    queryFn: async () => {
      const offset = (page - 1) * LIMIT;
      const params: Record<string, any> = { limit: LIMIT, offset };
      if (statusFilter) params.status = statusFilter;
      if (userIdFilter.trim()) params.userId = userIdFilter.trim();
      if (chargerIdFilter.trim()) params.chargerId = chargerIdFilter.trim();
      return (await apiClient.get('/charging/history', { params })).data;
    },
    refetchInterval: 10_000,
  });

  const allSessions = data?.items ?? [];

  // Guest kiosk không có record trong bảng users — lọc ra trước khi gọi API
  const uniqueUserIds = Array.from(new Set(allSessions.map((s: any) => s.userId).filter(Boolean))) as string[];
  const lookupUserIds = filterGuestFromUserIds(uniqueUserIds);

  // Fetch users for mapping userId to fullName in a batch
  const { data: usersData } = useQuery({
    queryKey: ['users-list-lookup-batch', lookupUserIds.join(',')],
    queryFn: async () => {
      if (lookupUserIds.length === 0) return [];
      const res = await apiClient.get('/users', {
        params: {
          ids: lookupUserIds.join(','),
          role: 'all',
          limit: lookupUserIds.length,
        }
      });
      return res.data?.items ?? [];
    },
    enabled: lookupUserIds.length > 0,
  });

  const users = usersData || [];

  const userMap = new Map<string, { fullName: string; email: string; phone: string | null }>();
  users.forEach((u: any) => {
    userMap.set(u.userId, {
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
    });
  });
  // Inject kiosk guest profile nếu trang này có session của khách vãng lai
  injectKioskGuest(uniqueUserIds, userMap);

  const staffStationIds: string[] = user?.stationIds?.length
    ? user.stationIds
    : user?.stationId
      ? [user.stationId]
      : [];

  const assignedStationId = staffStationIds[0] || null;

  // Collect unique charger IDs visible on this page
  const uniqueChargerIds = Array.from(
    new Set(allSessions.map((s: any) => s.chargerId).filter(Boolean))
  ) as string[];

  // Single batch request: GET /stations?chargerIds=id1,id2,...
  // Returns all stations containing any of those chargers — 1 request instead of N
  const { data: chargerStationsData } = useQuery({
    queryKey: ['charger-stations-batch-sessions', uniqueChargerIds.join(',')],
    queryFn: async () => {
      if (uniqueChargerIds.length === 0) return [];
      const res = await apiClient.get('/stations', {
        params: {
          chargerIds: uniqueChargerIds.join(','),
          limit: uniqueChargerIds.length,
        },
      });
      return res.data?.items ?? [];
    },
    enabled: uniqueChargerIds.length > 0,
  });

  const chargerStations = chargerStationsData || [];

  // Build a map of chargerId -> stationName & chargerCode from batch results
  const chargerStationMap = new Map<string, { stationName: string; chargerCode: string }>();
  chargerStations.forEach((station: any) => {
    station.chargers?.forEach((charger: any, idx: number) => {
      chargerStationMap.set(charger.id, {
        stationName: station.name,
        chargerCode: `Trụ ${idx + 1} (${charger.maxPowerKw || 0}kW)`,
      });
    });
  });

  // Find assigned chargers set (staff restriction)
  const assignedStations = chargerStations.filter((s: any) => staffStationIds.includes(s.id));
  const assignedChargerIds = new Set(assignedStations.flatMap((s: any) => s.chargers?.map((c: any) => c.id) ?? []));

  // Visible sessions (Backend already filtered them if user is staff)
  const visibleSessions = allSessions;

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleForceStopSubmit = async () => {
    if (!stoppingSession) return;

    const endMeter = Number(endMeterWhInput);
    if (isNaN(endMeter) || endMeter < 0) {
      toast.error(t('dashboard:sessions.invalid_end_meter', { defaultValue: 'Chỉ số điện năng cuối phải là số hợp lệ lớn hơn hoặc bằng 0' }));
      return;
    }
    if (endMeter < stoppingSession.startMeterWh) {
      toast.error(t('dashboard:sessions.end_meter_less_than_start', { start: stoppingSession.startMeterWh, defaultValue: `Chỉ số điện năng cuối không được nhỏ hơn chỉ số bắt đầu (${stoppingSession.startMeterWh} Wh)` }));
      return;
    }

    setIsSubmittingStop(true);
    try {
      await apiClient.post(`/charging/admin/stop/${stoppingSession.id}`, {
        endMeterWh: endMeter,
        reason: stopReasonInput.trim() || 'Admin force stop'
      });
      toast.success(t('common:api_errors.FORCE_STOP_SUCCESS', { defaultValue: 'Đã dừng phiên sạc thành công' }));
      setStoppingSession(null);
      refetch();
    } catch (err: any) {
      toast.error(translateMessage(err?.response?.data?.message, 'common:api_errors.UNKNOWN_ERROR'));
    } finally {
      setIsSubmittingStop(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deletingSession) return;
    setIsDeletingSession(true);
    try {
      await apiClient.delete(`/charging/session/${deletingSession.id}`);
      toast.success('Đã xóa phiên sạc thành công!');
      setDeletingSession(null);
      refetch();
    } catch (err: any) {
      toast.error(translateMessage(err?.response?.data?.message, 'Xóa phiên sạc thất bại'));
    } finally {
      setIsDeletingSession(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">{t('dashboard:sessions.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:sessions.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc:</span>
          </div>
          <CustomSelect
            value={statusFilter}
            onChange={val => { setStatusFilter(val); resetPage(); }}
            options={STATUS_OPTIONS}
            className="w-40 h-9"
          />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={userIdFilter}
              onChange={e => { setUserIdFilter(e.target.value); resetPage(); }}
              placeholder="UUID người dùng..."
              className="ev-input h-9 text-xs w-44 font-mono pl-7"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={chargerIdFilter}
              onChange={e => { setChargerIdFilter(e.target.value); resetPage(); }}
              placeholder="UUID trụ sạc..."
              className="ev-input h-9 text-xs w-44 font-mono pl-7"
            />
          </div>
          {(statusFilter || userIdFilter || chargerIdFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setUserIdFilter(''); setChargerIdFilter(''); resetPage(); }}
              className="text-xs text-text-muted hover:text-danger transition-colors"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass flex flex-col overflow-hidden min-h-0">
        <div className="px-5 py-4 border-b border-white/5 shrink-0">
          <p className="font-semibold text-text-main text-sm">{t('dashboard:sessions.table_title', { defaultValue: 'Danh sách phiên sạc' })}</p>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:sessions.table.session_id')}</th>
                  <th>{t('dashboard:sessions.table.charger')}</th>
                  <th>{t('dashboard:sessions.table.user')}</th>
                  <th>{t('dashboard:sessions.table.start')}</th>
                  <th>Kết thúc</th>
                  <th>{t('dashboard:sessions.table.energy')}</th>
                  <th>{t('dashboard:sessions.table.status')}</th>
                  <th className="text-right pr-6">Thao tác</th>
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
                  : visibleSessions.map((s) => {
                      const kwh = calcKwh(s);
                      return (
                        <motion.tr 
                          key={s.id} 
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }}
                          onClick={() => setSelectedSession(s)}
                          className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="font-mono text-xs text-text-main">{s.id.slice(0, 8)}…</td>
                          <td>
                            {chargerStationMap.has(s.chargerId) ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-text-main text-xs">
                                  {chargerStationMap.get(s.chargerId)?.stationName}
                                </span>
                                <span className="text-[10px] text-text-muted flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5 text-cyan shrink-0" />
                                  {chargerStationMap.get(s.chargerId)?.chargerCode}
                                </span>
                              </div>
                            ) : (
                              <span className="font-mono text-xs">{s.chargerId.slice(0, 8)}…</span>
                            )}
                          </td>
                          <td>
                            {userMap.has(s.userId) ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium text-text-main text-xs">
                                  {userMap.get(s.userId)?.fullName}
                                </span>
                                <span className="text-[10px] text-text-muted">
                                  {userMap.get(s.userId)?.email}
                                </span>
                              </div>
                            ) : (
                              <span className="font-mono text-xs text-text-muted">{s.userId.slice(0, 8)}…</span>
                            )}
                          </td>
                          <td className="text-xs">
                            <div className="flex items-center gap-1.5 text-text-main font-medium">
                              <Clock className="w-3.5 h-3.5 text-success" />
                              {formatDateTimeStandard(s.startTime)}
                            </div>
                          </td>
                          <td className="text-xs text-text-muted">{formatDateTimeStandard(s.endTime)}</td>
                          <td className="text-cyan font-semibold">{kwh != null ? `${kwh.toFixed(2)}` : '—'}</td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[s.status] || 'badge-muted'}`}>
                              {t(`dashboard:data.status.${STATUS_TRANSLATE_KEY[s.status] || s.status.toUpperCase()}`, { defaultValue: s.status })}
                            </span>
                          </td>
                          <td className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end items-center gap-2">
                              <button 
                                onClick={() => setSelectedSession(s)}
                                className="p-1 text-cyan hover:text-cyan/85 transition-colors"
                                title="Xem chi tiết"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {s.status === 'active' && (
                                <button
                                  onClick={() => openTelemetry(s.id)}
                                  className="p-1 text-chart-2 hover:text-chart-2/80 transition-colors"
                                  title="Telemetry real-time"
                                >
                                  <Activity className="w-4 h-4" />
                                </button>
                              )}
                              {(isAdmin || user?.roles?.includes('staff')) && s.status === 'active' && (
                                <button
                                  onClick={() => {
                                    setStoppingSession(s);
                                    setEndMeterWhInput(String(s.startMeterWh + 1000));
                                    setStopReasonInput('Admin can thiệp khẩn cấp');
                                  }}
                                  className="p-1 text-danger hover:text-danger/80 transition-colors"
                                  title="Dừng khẩn cấp"
                                >
                                  <StopCircle className="w-4 h-4" />
                                </button>
                              )}
                              {/* Delete completed/stopped/interrupted sessions */}
                              {isAdmin && ['completed', 'stopped', 'interrupted'].includes(s.status) && (
                                <button
                                  onClick={() => setDeletingSession(s)}
                                  disabled={isDeletingSession}
                                  className="p-1 text-text-muted hover:text-danger transition-colors"
                                  title="Xóa phiên sạc vĩnh viễn"
                                >
                                  {isDeletingSession && deletingSession?.id === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })
                }
                 {!visibleSessions.length && !isLoading && (
                   <tr>
                     <td colSpan={8} className="text-center py-8 text-text-muted">{t('common:common.no_data')}</td>
                   </tr>
                 )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

       {/* Pagination */}
       <div className="glass px-4 shrink-0">
         <Pagination
           page={page}
           totalPages={totalPages}
           onPageChange={setPage}
           total={total}
           currentItemsCount={visibleSessions.length}
           itemLabel="phiên sạc"
         />
       </div>

      {/* Dynamic Session Details Modal */}
      <GlassModal open={!!selectedSession} onClose={() => setSelectedSession(null)} className="max-w-md">
        {selectedSession && (
          <>
            <ModalHeader onClose={() => setSelectedSession(null)}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,191,201,0.15)' }}>
                <Zap className="w-4 h-4 text-cyan" />
              </div>
              <h3 className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-main)' }}>
                Chi tiết phiên sạc
              </h3>
            </ModalHeader>

            <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <ModalField label="Mã phiên sạc (Session ID)">
                <ModalCopyValue text={selectedSession.id} onCopy={() => toast.success(tSafe('common:common.copied_session_id', 'Đã sao chép mã phiên sạc'))} />
              </ModalField>

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Trạng thái">
                  <span className={`badge ${STATUS_BADGE[selectedSession.status] || 'badge-muted'}`}>
                    {t(`dashboard:data.status.${STATUS_TRANSLATE_KEY[selectedSession.status] || selectedSession.status.toUpperCase()}`, { defaultValue: selectedSession.status })}
                  </span>
                </ModalField>

                <ModalField label="Năng lượng đã tiêu thụ">
                  <ModalValue className="text-cyan flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span>{calcKwh(selectedSession) != null ? `${calcKwh(selectedSession)?.toFixed(2)} kWh` : '—'}</span>
                  </ModalValue>
                </ModalField>

                {selectedSession.startSocPercent != null && (
                  <ModalField label="SOC ban đầu">
                    <ModalValue className="text-chart-2 flex items-center gap-1">
                      <Battery className="w-3.5 h-3.5 shrink-0" />
                      <span>{selectedSession.startSocPercent}%</span>
                    </ModalValue>
                  </ModalField>
                )}
              </div>

              <ModalField label="Khách hàng">
                {userMap.has(selectedSession.userId) ? (
                  <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>
                        {userMap.get(selectedSession.userId)?.fullName}
                      </span>
                      {selectedSession.userId !== KIOSK_GUEST_USER_ID && (
                        <span className="font-mono text-[10px]" style={{ color: 'var(--text-faded)' }}>
                          {selectedSession.userId.slice(0, 8)}…
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between text-[11px] pt-1" style={{ borderTop: '1px solid var(--card-border)' }}>
                      <span style={{ color: 'var(--text-faded)' }}>Email:</span>
                      <span className="font-medium" style={{ color: 'var(--text-main)' }}>{userMap.get(selectedSession.userId)?.email}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: 'var(--text-faded)' }}>Số điện thoại:</span>
                      <span className="font-medium" style={{ color: 'var(--text-main)' }}>{userMap.get(selectedSession.userId)?.phone || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <ModalCopyValue text={selectedSession.userId} onCopy={() => toast.success(tSafe('common:common.copied_user_id', 'Đã sao chép mã người dùng'))} />
                )}
              </ModalField>

              <ModalField label="Mã trụ sạc (Charger ID)">
                <ModalCopyValue text={selectedSession.chargerId} onCopy={() => toast.success(tSafe('common:common.copied_charger_id', 'Đã sao chép mã trụ sạc'))} />
              </ModalField>

              {selectedSession.bookingId && (
                <ModalField label="Mã đặt lịch liên kết (Booking ID)">
                  <ModalCopyValue text={selectedSession.bookingId} onCopy={() => toast.success(tSafe('common:common.copied_booking_id', 'Đã sao chép mã đặt lịch'))} />
                </ModalField>
              )}

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Chỉ số bắt đầu">
                  <ModalValue>{selectedSession.startMeterWh} Wh</ModalValue>
                </ModalField>
                <ModalField label="Chỉ số kết thúc">
                  <ModalValue>{selectedSession.endMeterWh != null ? `${selectedSession.endMeterWh} Wh` : '—'}</ModalValue>
                </ModalField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Giờ bắt đầu">
                  <ModalValue>{formatDateTimeStandard(selectedSession.startTime)}</ModalValue>
                </ModalField>
                <ModalField label="Giờ kết thúc">
                  <ModalValue>{selectedSession.endTime ? formatDateTimeStandard(selectedSession.endTime) : '—'}</ModalValue>
                </ModalField>
              </div>

              {/* Telemetry link for active sessions */}
              {selectedSession.status === 'active' && (
                <button
                  onClick={() => { openTelemetry(selectedSession.id); setSelectedSession(null); }}
                  className="w-full py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  style={{ background: 'rgba(16,191,201,0.1)', color: 'var(--brand-cyan)', border: '1px solid rgba(16,191,201,0.2)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16,191,201,0.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16,191,201,0.1)'}
                >
                  <Activity className="w-4 h-4" /> Xem telemetry real-time
                </button>
              )}

              {/* Completed session summary */}
              {(selectedSession.status === 'completed' || selectedSession.status === 'stopped' || selectedSession.status === 'interrupted') && selectedSession.endMeterWh != null && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faded)' }}>
                    <Gauge className="w-3.5 h-3.5" /> Kết quả phiên sạc
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span style={{ color: 'var(--text-faded)' }}>Thời lượng</span>
                      <p className="font-semibold" style={{ color: 'var(--text-main)' }}>{calcDuration(selectedSession) || '—'}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-faded)' }}>Năng lượng</span>
                      <p className="font-semibold text-cyan">{calcKwh(selectedSession)?.toFixed(2)} kWh</p>
                    </div>
                    {selectedSession.startSocPercent != null && (
                      <>
                        <div>
                          <span style={{ color: 'var(--text-faded)' }}>SOC đầu</span>
                          <p className="font-semibold text-chart-2">{selectedSession.startSocPercent}%</p>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-faded)' }}>SOC cuối (ước lượng)</span>
                          <p className="font-semibold text-chart-2">{calcEndSocPercent(selectedSession)}%</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              {selectedSession.status === 'active' && (
                <button
                  type="button"
                  onClick={() => { openTelemetry(selectedSession.id); setSelectedSession(null); }}
                  className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
                  style={{ background: 'rgba(16,191,201,0.1)', color: 'var(--brand-cyan)', border: '1px solid rgba(16,191,201,0.2)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16,191,201,0.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16,191,201,0.1)'}
                >
                  <Activity className="w-3.5 h-3.5" /> Telemetry
                </button>
              )}
              {(isAdmin || user?.roles?.includes('staff')) && selectedSession.status === 'active' && (
                <button
                  type="button"
                  onClick={() => {
                    setStoppingSession(selectedSession);
                    setEndMeterWhInput(String(selectedSession.startMeterWh + 1000));
                    setStopReasonInput('Admin can thiệp khẩn cấp');
                    setSelectedSession(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
                  style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--brand-danger)', border: '1px solid rgba(239,68,68,0.25)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                >
                  <StopCircle className="w-3.5 h-3.5" /> Dừng khẩn cấp
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                Đóng
              </button>
            </div>
          </>
        )}
      </GlassModal>

      {/* Telemetry Real-time Modal */}
      <GlassModal open={!!telemetrySessionId} onClose={() => setTelemetrySessionId(null)} className="max-w-md">
        {telemetrySessionId && (
          <>
            <ModalHeader onClose={() => setTelemetrySessionId(null)}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,191,201,0.15)' }}>
                <Activity className="w-4 h-4 text-cyan" />
              </div>
              <h3 className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-main)' }}>
                Telemetry real-time
              </h3>
            </ModalHeader>

            {telemetryReadings.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-text-muted text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border border-cyan border-t-transparent animate-spin shrink-0" />
                  Đang kết nối...
                </div>
              </div>
            ) : (
              <>
                {/* Latest reading cards */}
                {(() => {
                  const latest = telemetryReadings[telemetryReadings.length - 1];
                  return (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(16,191,201,0.08)', border: '1px solid rgba(16,191,201,0.15)' }}>
                        <p className="text-[10px] uppercase tracking-wider text-text-faded">Công suất</p>
                        <p className="text-lg font-bold text-cyan">{latest.powerKw?.toFixed(1) ?? '—'} <span className="text-xs font-normal">kW</span></p>
                      </div>
                      <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(16,191,201,0.08)', border: '1px solid rgba(16,191,201,0.15)' }}>
                        <p className="text-[10px] uppercase tracking-wider text-text-faded">SOC</p>
                        <p className="text-lg font-bold text-chart-2">{latest.socPercent != null ? `${Math.round(latest.socPercent)}%` : '—'}</p>
                      </div>
                      <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(16,191,201,0.08)', border: '1px solid rgba(16,191,201,0.15)' }}>
                        <p className="text-[10px] uppercase tracking-wider text-text-faded">Điện áp</p>
                        <p className="text-lg font-bold text-text-main">{latest.voltageV?.toFixed(0) ?? '—'} <span className="text-xs font-normal">V</span></p>
                      </div>
                      <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(16,191,201,0.08)', border: '1px solid rgba(16,191,201,0.15)' }}>
                        <p className="text-[10px] uppercase tracking-wider text-text-faded">Dòng điện</p>
                        <p className="text-lg font-bold text-text-main">{latest.currentA?.toFixed(1) ?? '—'} <span className="text-xs font-normal">A</span></p>
                      </div>
                      <div className="rounded-xl p-3 text-center col-span-2" style={{ background: 'rgba(16,191,201,0.08)', border: '1px solid rgba(16,191,201,0.15)' }}>
                        <p className="text-[10px] uppercase tracking-wider text-text-faded">Nhiệt độ</p>
                        <p className="text-lg font-bold text-danger">{latest.temperatureC?.toFixed(1) ?? '—'} <span className="text-xs font-normal">°C</span></p>
                      </div>
                    </div>
                  );
                })()}

                {/* Readings history */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-faded)', borderBottom: '1px solid var(--card-border)' }}>
                    Lịch sử ({telemetryReadings.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto scrollbar-thin">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr style={{ color: 'var(--text-faded)', borderBottom: '1px solid var(--card-border)' }}>
                          <th className="text-left px-2 py-1 font-medium">Giờ</th>
                          <th className="text-right px-2 py-1 font-medium">kW</th>
                          <th className="text-right px-2 py-1 font-medium">SOC</th>
                          <th className="text-right px-2 py-1 font-medium">V</th>
                          <th className="text-right px-2 py-1 font-medium">A</th>
                          <th className="text-right px-2 py-1 font-medium">°C</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...telemetryReadings].reverse().map((r) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td className="px-2 py-1 text-left font-mono text-text-muted">
                              {new Date(r.recordedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td className="px-2 py-1 text-right text-cyan">{r.powerKw?.toFixed(1) ?? '—'}</td>
                            <td className="px-2 py-1 text-right text-chart-2">{r.socPercent != null ? `${Math.round(r.socPercent)}%` : '—'}</td>
                            <td className="px-2 py-1 text-right text-text-main">{r.voltageV?.toFixed(0) ?? '—'}</td>
                            <td className="px-2 py-1 text-right text-text-main">{r.currentA?.toFixed(1) ?? '—'}</td>
                            <td className="px-2 py-1 text-right text-danger">{r.temperatureC?.toFixed(1) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              <button
                type="button"
                onClick={() => setTelemetrySessionId(null)}
                className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                Đóng
              </button>
            </div>
          </>
        )}
      </GlassModal>

      {/* Confirmation Force Stop Modal */}
      <GlassModal open={!!stoppingSession} onClose={() => setStoppingSession(null)} className="max-w-sm">
        {stoppingSession && (
          <>
            <ModalHeader onClose={() => setStoppingSession(null)}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <ShieldAlert className="w-4 h-4 text-danger animate-pulse" />
              </div>
              <h3 className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-main)' }}>
                Xác nhận dừng khẩn cấp
              </h3>
            </ModalHeader>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-faded)' }}>
              Hành động này sẽ gửi tín hiệu can thiệp trực tiếp đến trụ sạc để dừng ngay lập tức phiên sạc đang hoạt động.
            </p>

            <div className="space-y-3.5 text-xs">
              <ModalField label="Mã phiên sạc (Session ID)">
                <div className="font-mono text-xs rounded-xl px-3 py-2 truncate" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)', color: 'var(--text-main)' }} title={stoppingSession.id}>
                  {stoppingSession.id}
                </div>
              </ModalField>

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Chỉ số bắt đầu">
                  <ModalValue>{stoppingSession.startMeterWh} Wh</ModalValue>
                </ModalField>
                <ModalField label="Trạng thái">
                  <div className="font-semibold text-success flex items-center gap-1 uppercase tracking-wide text-[10px]">
                    <span className="glow-dot bg-success animate-ping w-1.5 h-1.5 shrink-0" />
                    Đang sạc
                  </div>
                </ModalField>
              </div>

              <ModalField label="Chỉ số điện năng cuối (End Meter Wh)">
                <span className="text-danger text-[10px]">* Bắt buộc</span>
                <input 
                  type="number"
                  min={stoppingSession.startMeterWh}
                  value={endMeterWhInput}
                  onChange={(e) => setEndMeterWhInput(e.target.value)}
                  className="ev-input w-full h-8 px-2.5 text-xs mt-1"
                  placeholder="Ví dụ: 2500"
                  required
                />
              </ModalField>

              <ModalField label="Lý do dừng">
                <input 
                  type="text"
                  value={stopReasonInput}
                  onChange={(e) => setStopReasonInput(e.target.value)}
                  className="ev-input w-full h-8 px-2.5 text-xs"
                  placeholder="Nhập lý do dừng..."
                />
              </ModalField>
            </div>

            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              <button 
                type="button"
                disabled={isSubmittingStop}
                onClick={() => setStoppingSession(null)}
                className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                Hủy bỏ
              </button>
              <button 
                type="button"
                disabled={isSubmittingStop}
                onClick={handleForceStopSubmit}
                className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl transition-all flex items-center gap-1 shadow-md"
                style={{ background: 'var(--brand-danger)', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}
                onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
              >
                {isSubmittingStop && (
                  <div className="w-3.5 h-3.5 rounded-full border border-white border-t-transparent animate-spin shrink-0" />
                )}
                Xác nhận dừng
              </button>
            </div>
          </>
        )}
      </GlassModal>

      {/* Delete Session Confirm Modal */}
      <GlassModal open={!!deletingSession} onClose={() => setDeletingSession(null)} className="max-w-sm">
        {deletingSession && (
          <>
            <ModalHeader onClose={() => setDeletingSession(null)}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <Trash2 className="w-4 h-4 text-danger" />
              </div>
              <h3 className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-main)' }}>
                Xác nhận xóa phiên sạc
              </h3>
            </ModalHeader>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}>
                <p style={{ color: 'var(--text-faded)' }} className="mb-0.5">Mã phiên sạc</p>
                <p className="font-mono" style={{ color: 'var(--text-main)' }} title={deletingSession.id}>{deletingSession.id.slice(0, 12)}…</p>
                <p style={{ color: 'var(--text-muted)' }} className="mt-1">
                  Trạng thái: <span className={`badge ${STATUS_BADGE[deletingSession.status] || 'badge-muted'} ml-1`}>
                    {t(`dashboard:data.status.${STATUS_TRANSLATE_KEY[deletingSession.status] || deletingSession.status.toUpperCase()}`, { defaultValue: deletingSession.status })}
                  </span>
                </p>
              </div>
              <p style={{ color: 'var(--text-faded)' }} className="leading-relaxed">
                Hành động này sẽ xóa vĩnh viễn bản ghi phiên sạc khỏi cơ sở dữ liệu. Thao tác không thể hoàn tác.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              <button
                type="button"
                disabled={isDeletingSession}
                onClick={() => setDeletingSession(null)}
                className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeletingSession}
                onClick={handleDeleteSession}
                className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl transition-all flex items-center gap-1 shadow-md disabled:opacity-60"
                style={{ background: 'var(--brand-danger)', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}
                onMouseEnter={(e) => !isDeletingSession && (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
              >
                {isDeletingSession ? (
                  <div className="w-3.5 h-3.5 rounded-full border border-white border-t-transparent animate-spin shrink-0" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Xóa vĩnh viễn
              </button>
            </div>
          </>
        )}
      </GlassModal>
    </div>
  );
}
