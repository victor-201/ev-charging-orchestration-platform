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
import GlassModal, { ModalHeader, ModalField, ModalValue, ModalCopyValue } from '@/core/theme/GlassModal';

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

  // Visible bookings (Backend already filtered them if user is staff)
  const visibleBookings = bookings;

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT) || 1;

  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy lịch đặt này không?')) return;
    setIsCancelling(true);
    try {
      const isStaff = user?.roles?.includes('staff');
      const reason = isStaff ? 'Nhân viên can thiệp hủy đặt lịch' : 'Admin can thiệp hủy đặt lịch';
      await apiClient.delete(`/bookings/${bookingId}`, {
        data: { reason },
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
                          {(isAdmin || user?.roles?.includes('staff')) && ['pending', 'confirmed'].includes(b.status.toLowerCase()) && (
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

      {/* Details Modal */}
      <GlassModal open={!!selectedBooking} onClose={() => setSelectedBooking(null)} className="max-w-md">
        {selectedBooking && (
          <>
            <ModalHeader onClose={() => setSelectedBooking(null)}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,191,201,0.15)' }}>
                <CalendarCheck className="w-4 h-4 text-cyan" />
              </div>
              <h3 className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-main)' }}>
                Chi tiết đặt lịch
              </h3>
            </ModalHeader>

            <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <ModalField label="Mã đặt lịch (Booking ID)">
                <ModalCopyValue text={selectedBooking.id} onCopy={() => toast.success('Đã sao chép mã đặt lịch')} />
              </ModalField>

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Trạng thái">
                  <span className={`badge ${getStatusBadgeAndLabel(selectedBooking.status, t).className}`}>
                    {getStatusBadgeAndLabel(selectedBooking.status, t).label}
                  </span>
                </ModalField>

                <ModalField label="Loại đầu cắm">
                  <ModalValue className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-cyan shrink-0" />
                    <span>{selectedBooking.connectorType}</span>
                  </ModalValue>
                </ModalField>
              </div>

              <ModalField label="Khách hàng">
                {userMap.has(selectedBooking.userId) ? (
                  <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs" style={{ color: 'var(--text-main)' }}>
                        {userMap.get(selectedBooking.userId)?.fullName}
                      </span>
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-faded)' }}>
                        {selectedBooking.userId.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] pt-1" style={{ borderTop: '1px solid var(--card-border)' }}>
                      <span style={{ color: 'var(--text-faded)' }}>Email:</span>
                      <span className="font-medium" style={{ color: 'var(--text-main)' }}>{userMap.get(selectedBooking.userId)?.email}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: 'var(--text-faded)' }}>Số điện thoại:</span>
                      <span className="font-medium" style={{ color: 'var(--text-main)' }}>{userMap.get(selectedBooking.userId)?.phone || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <ModalCopyValue text={selectedBooking.userId} onCopy={() => toast.success('Đã sao chép mã người dùng')} />
                )}
              </ModalField>

              <ModalField label="Trạm & Trụ sạc">
                {chargerStationMap.has(selectedBooking.chargerId) ? (
                  <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)' }}>
                    <div className="font-semibold" style={{ color: 'var(--text-main)' }}>
                      {chargerStationMap.get(selectedBooking.chargerId)?.stationName}
                    </div>
                    <div className="text-[11px] text-cyan flex items-center gap-1 mt-0.5">
                      <Zap className="w-3 h-3 shrink-0" />
                      {chargerStationMap.get(selectedBooking.chargerId)?.chargerCode}
                    </div>
                  </div>
                ) : (
                  <ModalCopyValue text={selectedBooking.chargerId} onCopy={() => toast.success('Đã sao chép mã trụ sạc')} />
                )}
              </ModalField>

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Thời gian bắt đầu">
                  <ModalValue>{formatDate(selectedBooking.startTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</ModalValue>
                </ModalField>
                <ModalField label="Thời gian kết thúc">
                  <ModalValue>{formatDate(selectedBooking.endTime, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</ModalValue>
                </ModalField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Thời lượng">
                  <ModalValue className="text-cyan font-bold">{selectedBooking.durationMinutes} phút</ModalValue>
                </ModalField>
                <ModalField label="Tiền đặt cọc">
                  <ModalValue className="text-success font-bold">{formatCurrency(Number(selectedBooking.depositAmount || 0))}</ModalValue>
                </ModalField>
              </div>

              <ModalField label="Token kích hoạt QR">
                <div className="font-mono text-[10px] break-all rounded-xl px-3 py-2 max-h-16 overflow-y-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)', color: 'var(--text-faded)' }}>
                  {selectedBooking.qrToken || "Không có token (Chưa kích hoạt hoặc đã hoàn thành)"}
                </div>
              </ModalField>
            </div>

            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              {(isAdmin || user?.roles?.includes('staff')) && ['pending', 'confirmed'].includes(selectedBooking.status.toLowerCase()) && (
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => handleCancelBooking(selectedBooking.id)}
                  className="px-3.5 py-1.5 text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
                  style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--brand-danger)', border: '1px solid rgba(239,68,68,0.25)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.25)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hủy đặt lịch
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
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
    </div>
  );
}
