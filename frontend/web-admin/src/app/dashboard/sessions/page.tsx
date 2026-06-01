'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { relativeTimeLocale } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { StopCircle, Filter, Search, ShieldAlert, X, Eye, Copy, Zap, Clock } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/i18n/formatter';
import { useAuthStore } from '@/features/auth/store/auth.store';

type ChargingSession = {
  id: string;
  userId: string;
  chargerId: string;
  bookingId: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  startMeterWh: number;
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

const LIMIT = 15;

function calcKwh(session: ChargingSession): number | null {
  if (session.endMeterWh == null || session.startMeterWh == null) return null;
  return (session.endMeterWh - session.startMeterWh) / 1000;
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

  const resetPage = () => setPage(1);

  // Fetch users for mapping userId to fullName
  const { data: usersData } = useQuery({
    queryKey: ['users-list-lookup'],
    queryFn: async () => {
      const res = await apiClient.get('/users', { params: { limit: 1000 } });
      return res.data?.items ?? [];
    },
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

  const staffStationIds: string[] = user?.stationIds?.length
    ? user.stationIds
    : user?.stationId
      ? [user.stationId]
      : [];

  const assignedStationId = staffStationIds[0] || null;

  // Load all stations to map charger IDs to station and identify assigned chargers
  const { data: stationsData } = useQuery({
    queryKey: ['stations-list-lookup-sessions'],
    queryFn: async () => {
      const res = await apiClient.get('/stations', { params: { limit: 1000 } });
      return res.data?.items ?? [];
    },
  });

  const stations = stationsData || [];

  // Build a map of chargerId -> stationName & chargerCode
  const chargerStationMap = new Map<string, { stationName: string; chargerCode: string }>();
  stations.forEach((station: any) => {
    station.chargers?.forEach((charger: any, idx: number) => {
      chargerStationMap.set(charger.id, {
        stationName: station.name,
        chargerCode: `Trụ ${idx + 1} (${charger.maxPowerKw || 0}kW)`,
      });
    });
  });

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

  // Find assigned chargers set
  const assignedStations = stations.filter((s: any) => staffStationIds.includes(s.id));
  const assignedChargerIds = new Set(assignedStations.flatMap((s: any) => s.chargers?.map((c: any) => c.id) ?? []));

  // Filter visible sessions
  const visibleSessions = !isAdmin
    ? assignedChargerIds.size > 0
      ? allSessions.filter((s) => assignedChargerIds.has(s.chargerId))
      : []
    : allSessions;

  const total = !isAdmin ? visibleSessions.length : (data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleForceStopSubmit = async () => {
    if (!stoppingSession) return;

    const endMeter = Number(endMeterWhInput);
    if (isNaN(endMeter) || endMeter < 0) {
      toast.error('Chỉ số điện năng cuối phải là số hợp lệ lớn hơn hoặc bằng 0');
      return;
    }
    if (endMeter < stoppingSession.startMeterWh) {
      toast.error(`Chỉ số điện năng cuối không được nhỏ hơn chỉ số bắt đầu (${stoppingSession.startMeterWh} Wh)`);
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
      const errMsg = err?.response?.data?.message;
      const formattedMsg = Array.isArray(errMsg) ? errMsg.join(', ') : errMsg;
      toast.error(formattedMsg || t('common:api_errors.UNKNOWN_ERROR', { defaultValue: 'Không thể dừng phiên sạc' }));
    } finally {
      setIsSubmittingStop(false);
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
                          <td className="text-xs">{relativeTimeLocale(s.startTime)}</td>
                          <td className="text-xs text-text-muted">{s.endTime ? relativeTimeLocale(s.endTime) : '—'}</td>
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
      {selectedSession && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div 
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Chi tiết phiên sạc
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedSession(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã phiên sạc (Session ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <span className="truncate pr-2">{selectedSession.id}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedSession.id);
                      toast.success("Đã sao chép mã phiên sạc");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái</label>
                  <div>
                    <span className={`badge ${STATUS_BADGE[selectedSession.status] || 'badge-muted'}`}>
                      {t(`dashboard:data.status.${STATUS_TRANSLATE_KEY[selectedSession.status] || selectedSession.status.toUpperCase()}`, { defaultValue: selectedSession.status })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Năng lượng đã tiêu thụ</label>
                  <div className="font-bold text-cyan flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-cyan shrink-0" />
                    <span>{calcKwh(selectedSession) != null ? `${calcKwh(selectedSession)?.toFixed(2)} kWh` : '—'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Khách hàng (User Details)</label>
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  {userMap.has(selectedSession.userId) ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center py-0.5">
                        <span className="font-semibold text-slate-900 dark:text-white text-xs">
                          {userMap.get(selectedSession.userId)?.fullName}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted">
                          {selectedSession.userId.slice(0, 8)}…
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] py-0.5 border-t border-slate-100 dark:border-white/5 pt-1">
                        <span className="text-slate-500 dark:text-slate-400">Email:</span>
                        <span className="font-medium text-slate-850 dark:text-slate-200">{userMap.get(selectedSession.userId)?.email}</span>
                      </div>
                      <div className="flex justify-between text-[11px] py-0.5">
                        <span className="text-slate-500 dark:text-slate-400">Số điện thoại:</span>
                        <span className="font-medium text-slate-850 dark:text-slate-200">{userMap.get(selectedSession.userId)?.phone || '—'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="truncate pr-2">{selectedSession.userId}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(selectedSession.userId);
                          toast.success("Đã sao chép mã người dùng");
                        }}
                        className="text-cyan hover:text-cyan/85 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã trụ sạc (Charger ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <span className="truncate pr-2">{selectedSession.chargerId}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedSession.chargerId);
                      toast.success("Đã sao chép mã trụ sạc");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {selectedSession.bookingId && (
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã đặt lịch liên kết (Booking ID)</label>
                  <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                    <span className="truncate pr-2">{selectedSession.bookingId}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedSession.bookingId || '');
                        toast.success("Đã sao chép mã đặt lịch");
                      }}
                      className="text-cyan hover:text-cyan/85 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Chỉ số bắt đầu</label>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {selectedSession.startMeterWh} Wh
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Chỉ số kết thúc</label>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {selectedSession.endMeterWh != null ? `${selectedSession.endMeterWh} Wh` : '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Giờ bắt đầu</label>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {formatDate(selectedSession.startTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', second: '2-digit' })}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Giờ kết thúc</label>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {selectedSession.endTime ? formatDate(selectedSession.endTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', second: '2-digit' }) : '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {(isAdmin || user?.roles?.includes('staff')) && selectedSession.status === 'active' && (
                <button
                  type="button"
                  onClick={() => {
                    setStoppingSession(selectedSession);
                    setEndMeterWhInput(String(selectedSession.startMeterWh + 1000));
                    setStopReasonInput('Admin can thiệp khẩn cấp');
                    setSelectedSession(null);
                  }}
                  className="px-3.5 py-1.5 bg-danger/10 hover:bg-danger/25 border border-danger/20 text-danger text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
                >
                  <StopCircle className="w-3.5 h-3.5" /> Dừng khẩn cấp
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Force Stop Modal */}
      {stoppingSession && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div 
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            {/* Corner Markers */}
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="w-8 h-8 rounded-full bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-4 h-4 text-danger animate-pulse" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                Xác nhận dừng khẩn cấp
              </h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Hành động này sẽ gửi tín hiệu can thiệp trực tiếp đến trụ sạc để dừng ngay lập tức phiên sạc đang hoạt động.
            </p>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã phiên sạc (Session ID)</label>
                <div className="font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white truncate">
                  {stoppingSession.id}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Chỉ số bắt đầu</label>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {stoppingSession.startMeterWh} Wh
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái</label>
                  <div className="font-semibold text-success flex items-center gap-1 uppercase tracking-wide text-[10px]">
                    <span className="glow-dot bg-success animate-ping w-1.5 h-1.5 shrink-0" />
                    Đang sạc
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Chỉ số điện năng cuối (End Meter Wh) <span className="text-danger">*</span></label>
                <input 
                  type="number"
                  min={stoppingSession.startMeterWh}
                  value={endMeterWhInput}
                  onChange={(e) => setEndMeterWhInput(e.target.value)}
                  className="ev-input w-full h-8 px-2.5 text-xs"
                  placeholder="Ví dụ: 2500"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Lý do dừng</label>
                <input 
                  type="text"
                  value={stopReasonInput}
                  onChange={(e) => setStopReasonInput(e.target.value)}
                  className="ev-input w-full h-8 px-2.5 text-xs"
                  placeholder="Nhập lý do dừng..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button"
                disabled={isSubmittingStop}
                onClick={() => setStoppingSession(null)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Hủy bỏ
              </button>
              <button 
                type="button"
                disabled={isSubmittingStop}
                onClick={handleForceStopSubmit}
                className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-danger/20 rounded-xl transition-all flex items-center gap-1 bg-danger hover:bg-danger/90"
              >
                {isSubmittingStop && (
                  <div className="w-3.5 h-3.5 rounded-full border border-white border-t-transparent animate-spin shrink-0" />
                )}
                Xác nhận dừng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
