'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { CalendarCheck, Clock, MapPin, Zap, Filter, Eye, Copy, X, Search, Trash2 } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/i18n/formatter';
import { useAuthStore } from '@/features/auth/store/auth.store';

type Booking = {
  id: string;
  userId: string;
  chargerId: string;
  startTime: string;
  endTime: string;
  status: string;
  durationMinutes: number;
  qrToken: string | null;
  depositAmount: string;
  connectorType: string;
  createdAt: string;
};

const getStatusBadgeAndLabel = (status: string, t: any) => {
  const s = status.toLowerCase();
  switch (s) {
    case 'pending':
      return { className: 'badge-warning', label: t('dashboard:data.status.PENDING', { defaultValue: 'Đang chờ' }) };
    case 'confirmed':
      return { className: 'badge-success', label: t('dashboard:data.status.CONFIRMED', { defaultValue: 'Đã xác nhận' }) };
    case 'active':
      return { className: 'badge-info', label: t('dashboard:data.status.CHARGING', { defaultValue: 'Đang sạc' }) };
    case 'completed':
      return { className: 'badge-muted', label: t('dashboard:data.status.COMPLETED', { defaultValue: 'Hoàn thành' }) };
    case 'cancelled':
      return { className: 'badge-danger', label: t('dashboard:data.status.CANCELLED', { defaultValue: 'Đã hủy' }) };
    case 'no_show':
      return { className: 'badge-danger', label: t('dashboard:data.status.NO_SHOW', { defaultValue: 'Không đến' }) };
    default:
      return { className: 'badge-muted', label: status.toUpperCase() };
  }
};

const LIMIT = 10;

export default function BookingsPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuthStore();
  const isAdmin = user?.roles?.includes('admin');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [chargerIdFilter, setChargerIdFilter] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

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

  // Fetch stations for lookup mapping
  const { data: stationsData } = useQuery({
    queryKey: ['stations-list-lookup'],
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

  const { data, isLoading, refetch } = useQuery<{ items: Booking[]; total: number }>({
    queryKey: ['bookings', page, statusFilter, userIdFilter, chargerIdFilter],
    queryFn: async () => {
      const offset = (page - 1) * LIMIT;
      const params: any = { limit: LIMIT, offset };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (userIdFilter.trim()) params.userId = userIdFilter.trim();
      if (chargerIdFilter.trim()) params.chargerId = chargerIdFilter.trim();
      return (await apiClient.get('/bookings', { params })).data;
    },
    refetchInterval: 15_000,
  });

  const staffStationIds: string[] = user?.stationIds?.length
    ? user.stationIds
    : user?.stationId
      ? [user.stationId]
      : [];

  const assignedStationId = staffStationIds[0] || null;

  const bookings = data?.items ?? [];

  // Find assigned chargers set
  const assignedStations = stations.filter((s: any) => staffStationIds.includes(s.id));
  const assignedChargerIds = new Set(assignedStations.flatMap((s: any) => s.chargers?.map((c: any) => c.id) ?? []));

  // Filter visible bookings
  const visibleBookings = !isAdmin
    ? assignedChargerIds.size > 0
      ? bookings.filter((b) => assignedChargerIds.has(b.chargerId))
      : []
    : bookings;

  const total = !isAdmin ? visibleBookings.length : (data?.total ?? 0);
  const totalPages = Math.ceil(total / LIMIT) || 1;

  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy lịch đặt này không?')) return;
    setIsCancelling(true);
    try {
      await apiClient.delete(`/bookings/${bookingId}`, {
        data: { reason: 'Admin can thiệp hủy đặt lịch' },
      });
      toast.success('Đã hủy đặt lịch thành công');
      setSelectedBooking(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Có lỗi xảy ra khi hủy đặt lịch');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">{t('dashboard:bookings.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:bookings.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc:</span>
          </div>
          <CustomSelect
            value={statusFilter}
            onChange={(val) => { setStatusFilter(val); resetPage(); }}
            options={[
              { value: 'all', label: 'Tất cả trạng thái' },
              { value: 'pending', label: 'Đang chờ' },
              { value: 'confirmed', label: 'Đã xác nhận' },
              { value: 'active', label: 'Đang sạc' },
              { value: 'completed', label: 'Hoàn thành' },
              { value: 'cancelled', label: 'Đã hủy' },
              { value: 'no_show', label: 'Không đến' },
            ]}
            className="w-44 h-9"
          />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); resetPage(); }}
              placeholder="UUID người dùng..."
              className="ev-input h-9 text-xs w-44 font-mono pl-7"
            />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={chargerIdFilter}
              onChange={(e) => { setChargerIdFilter(e.target.value); resetPage(); }}
              placeholder="UUID trụ sạc..."
              className="ev-input h-9 text-xs w-44 font-mono pl-7"
            />
          </div>
          {(statusFilter !== 'all' || userIdFilter || chargerIdFilter) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setUserIdFilter('');
                setChargerIdFilter('');
                resetPage();
              }}
              className="text-xs text-text-muted hover:text-danger transition-colors"
            >
              Xóa bộ lọc
            </button>
          )}
          <div className="flex items-center gap-2 px-3.5 h-9 rounded-xl bg-info/10 border border-info/20 shrink-0">
            <CalendarCheck className="w-4 h-4 text-info" />
            <span className="text-info text-xs font-semibold">
              {t('dashboard:bookings.total', { count: total })}
            </span>
          </div>
        </div>
      </div>

      <div className="glass flex flex-col overflow-hidden min-h-0">
        <div className="px-5 py-4 border-b border-white/5 shrink-0">
          <p className="font-semibold text-text-main text-sm">
            {t('dashboard:bookings.table_title', { defaultValue: 'Danh sách đặt lịch' })}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:bookings.table.booking_id')}</th>
                  <th>{t('dashboard:bookings.table.user')}</th>
                  <th>{t('dashboard:bookings.table.charger')}</th>
                  <th>{t('dashboard:bookings.table.connector')}</th>
                  <th>{t('dashboard:bookings.table.start')}</th>
                  <th>{t('dashboard:bookings.table.end')}</th>
                  <th>{t('dashboard:bookings.table.status')}</th>
                  <th className="text-right pr-6">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: LIMIT }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : visibleBookings?.map((b) => {
                  const statusInfo = getStatusBadgeAndLabel(b.status, t);
                  return (
                    <motion.tr 
                      key={b.id} 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }}
                      onClick={() => setSelectedBooking(b)}
                      className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="font-mono text-xs text-text-main">{b.id.slice(0, 8)}…</td>
                      <td>
                        {userMap.has(b.userId) ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-text-main text-xs">
                              {userMap.get(b.userId)?.fullName}
                            </span>
                            <span className="text-[10px] text-text-muted">
                              {userMap.get(b.userId)?.email}
                            </span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-text-muted">{b.userId.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td>
                        {chargerStationMap.has(b.chargerId) ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-text-main text-xs">
                              {chargerStationMap.get(b.chargerId)?.stationName}
                            </span>
                            <span className="text-[10px] text-text-muted flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5 text-cyan shrink-0" />
                              {chargerStationMap.get(b.chargerId)?.chargerCode}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-text-muted" />
                            <span className="font-mono text-xs">{b.chargerId.slice(0, 8)}…</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-cyan" />
                          <span className="text-xs font-medium">{b.connectorType}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 text-xs text-text-main font-medium">
                          <Clock className="w-3.5 h-3.5 text-success" />
                          {formatDate(b.startTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </div>
                      </td>
                      <td className="text-xs text-text-muted">
                        {formatDate(b.endTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                      </td>
                      <td>
                        <span className={`badge ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end items-center gap-2">
                          <button 
                            onClick={() => setSelectedBooking(b)}
                            className="p-1 text-cyan hover:text-cyan/85 transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && ['pending', 'confirmed'].includes(b.status.toLowerCase()) && (
                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              className="p-1 text-danger hover:text-danger/80 transition-colors"
                              title="Hủy đặt lịch"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                 {!visibleBookings?.length && !isLoading && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-text-muted">
                      {t('common:common.no_data')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Standalone Pagination */}
      <div className="glass px-4 shrink-0">
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          total={total}
           currentItemsCount={visibleBookings.length}
          itemLabel="đặt lịch"
        />
      </div>

      {/* Details Modal - Styled exactly like the station edit modal */}
      {selectedBooking && (
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
                <CalendarCheck className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Chi tiết đặt lịch
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã đặt lịch (Booking ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <span className="truncate pr-2">{selectedBooking.id}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedBooking.id);
                      toast.success("Đã sao chép mã đặt lịch");
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
                    <span className={`badge ${getStatusBadgeAndLabel(selectedBooking.status, t).className}`}>
                      {getStatusBadgeAndLabel(selectedBooking.status, t).label}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Loại đầu cắm</label>
                  <div className="flex items-center gap-1 font-medium text-slate-900 dark:text-white">
                    <Zap className="w-3.5 h-3.5 text-cyan shrink-0" />
                    <span>{selectedBooking.connectorType}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Khách hàng (User Details)</label>
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  {userMap.has(selectedBooking.userId) ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center py-0.5">
                        <span className="font-semibold text-slate-900 dark:text-white text-xs">
                          {userMap.get(selectedBooking.userId)?.fullName}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted">
                          {selectedBooking.userId.slice(0, 8)}…
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] py-0.5 border-t border-slate-100 dark:border-white/5 pt-1">
                        <span className="text-slate-500 dark:text-slate-400">Email:</span>
                        <span className="font-medium text-slate-850 dark:text-slate-200">{userMap.get(selectedBooking.userId)?.email}</span>
                      </div>
                      <div className="flex justify-between text-[11px] py-0.5">
                        <span className="text-slate-500 dark:text-slate-400">Số điện thoại:</span>
                        <span className="font-medium text-slate-850 dark:text-slate-200">{userMap.get(selectedBooking.userId)?.phone || '—'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="truncate pr-2">{selectedBooking.userId}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(selectedBooking.userId);
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
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạm & Trụ sạc</label>
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2">
                  {chargerStationMap.has(selectedBooking.chargerId) ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {chargerStationMap.get(selectedBooking.chargerId)?.stationName}
                      </span>
                      <span className="text-[11px] text-cyan flex items-center gap-1">
                        <Zap className="w-3 h-3 text-cyan shrink-0" />
                        {chargerStationMap.get(selectedBooking.chargerId)?.chargerCode}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-900 dark:text-white">
                      <span className="truncate pr-2">{selectedBooking.chargerId}</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(selectedBooking.chargerId);
                          toast.success("Đã sao chép mã trụ sạc");
                        }}
                        className="text-cyan hover:text-cyan/85 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Thời gian bắt đầu</label>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {formatDate(selectedBooking.startTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Thời gian kết thúc</label>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {formatDate(selectedBooking.endTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Thời lượng</label>
                  <div className="font-bold text-cyan">
                    {selectedBooking.durationMinutes} phút
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Tiền đặt cọc</label>
                  <div className="font-bold text-success">
                    {formatCurrency(Number(selectedBooking.depositAmount || 0))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Token kích hoạt QR</label>
                <div className="font-mono text-[10px] break-all bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white/80 max-h-16 overflow-y-auto">
                  {selectedBooking.qrToken || "Không có token (Chưa kích hoạt hoặc đã hoàn thành)"}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {isAdmin && ['pending', 'confirmed'].includes(selectedBooking.status.toLowerCase()) && (
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => handleCancelBooking(selectedBooking.id)}
                  className="px-3.5 py-1.5 bg-danger/10 hover:bg-danger/25 border border-danger/20 text-danger text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hủy đặt lịch
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
