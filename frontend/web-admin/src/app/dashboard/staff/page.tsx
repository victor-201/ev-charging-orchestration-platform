'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { cn } from '@/core/utils/cn';
import { Users, UserPlus, MapPin, Clock, Filter, Eye, Copy, X, Edit, Trash2, Calendar, FileText, CheckCircle, ShieldAlert, ChevronLeft, ChevronRight, List, CalendarDays, Wifi, WifiOff, Zap, Activity, Battery, Gauge, Thermometer, Radio, StopCircle, AlertTriangle, Power } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatDate, tSafe, translateMessage } from '@/i18n/formatter';
import { useAuthStore } from '@/features/auth/store/auth.store';
import Portal from '@/core/components/ui/Portal';

type Staff = {
  id: string;
  userId: string;
  position: string;
  shift: string;
  status: string;
  notes?: string | null;
  stationId?: string;
  createdAt?: string;
  hireDate?: string;
  User?: { email: string; fullName: string };
};

type Attendance = {
  id: string;
  userId: string;
  stationId?: string;
  checkInTime: string;
  checkOutTime?: string;
  latitude: number;
  longitude: number;
  notes?: string;
  status?: string;
  User?: { fullName: string };
};

type PagedStaff = { items: Staff[]; total: number };
type PagedAttendance = { items: Attendance[]; total: number };

type Station = {
  id: string; name: string; address: string; status: string;
  latitude: number; longitude: number; totalChargers: number; availableChargers: number;
  chargers?: Charger[];
};

type Charger = {
  id: string; stationId: string; name: string;
  maxPowerKw: number; status: string;
};

const LIMIT = 20;

const formatPosition = (pos: string) => {
  if (!pos) return '—';
  const p = pos.toLowerCase();
  switch (p) {
    case 'manager': return 'Quản lý';
    case 'supervisor': return 'Giám sát viên';
    case 'operator': return 'Nhân viên vận hành';
    case 'technician': return 'Kỹ thuật viên';
    default: return pos;
  }
};

const formatShift = (shift: string) => {
  if (!shift) return '—';
  const s = shift.toLowerCase();
  switch (s) {
    case 'morning': return 'Ca sáng';
    case 'afternoon': return 'Ca chiều';
    case 'night': return 'Ca đêm';
    default: return shift;
  }
};

const formatStatus = (status: string) => {
  if (!status) return '—';
  const s = status.toUpperCase();
  switch (s) {
    case 'ACTIVE': return 'Hoạt động';
    case 'INACTIVE': return 'Không hoạt động';
    default: return status;
  }
};

const formatAttendanceStatus = (status: string) => {
  const s = status ? status.toLowerCase() : 'present';
  switch (s) {
    case 'present': return 'Có mặt';
    case 'late': return 'Đi muộn';
    case 'absent': return 'Vắng';
    case 'leave': return 'Nghỉ phép';
    default: return status || 'Có mặt';
  }
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const days = getDaysInMonth(year, month);
  const result: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) result.push(null);
  for (let d = 1; d <= days; d++) result.push(d);
  return result;
}

const VIETNAMESE_MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const CHARGER_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  available: { label: 'Sẵn sàng', color: 'text-green border-green/30 bg-green/5', icon: Wifi },
  in_use: { label: 'Đang sạc', color: 'text-cyan border-cyan/30 bg-cyan/5', icon: Zap },
  offline: { label: 'Mất kết nối', color: 'text-red border-red/30 bg-red/5', icon: WifiOff },
  reserved: { label: 'Đã đặt trước', color: 'text-orange border-orange/30 bg-orange/5', icon: Clock },
  maintenance: { label: 'Bảo trì', color: 'text-yellow border-yellow/30 bg-yellow/5', icon: AlertTriangle },
};

export default function StaffPage() {
  const { user, isCheckingAuth } = useAuthStore();
  const { t } = useTranslation(['dashboard', 'common']);

  const isAdmin = user?.roles?.includes('admin');
  const isStaff = user?.roles?.includes('staff');

  const staffStationIds: string[] = user?.stationIds?.length
    ? user.stationIds
    : user?.stationId
      ? [user.stationId]
      : [];

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdmin && !isStaff) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-danger animate-pulse" />
        <h2 className="text-xl font-bold text-text-main">Không có quyền truy cập</h2>
        <p className="text-text-muted text-sm max-w-sm text-center">
          Bạn không có quyền truy cập trang này.
        </p>
      </div>
    );
  }

  /* ── Admin: full staff management ── */
  if (isAdmin) {
    const [tab, setTab] = useState<'staff' | 'attendance'>('staff');
    const [viewMode, setViewMode] = useState<'table' | 'calendar'>('calendar');

    const [staffPage, setStaffPage] = useState(1);
    const [staffPosition, setStaffPosition] = useState('');
    const [staffShift, setStaffShift] = useState('');

    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

    const [newUserId, setNewUserId] = useState('');
    const [newPosition, setNewPosition] = useState('operator');
    const [newShift, setNewShift] = useState('morning');
    const [newNotes, setNewNotes] = useState('');
    const [newStationId, setNewStationId] = useState('');
    const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

    const [editPosition, setEditPosition] = useState('operator');
    const [editShift, setEditShift] = useState('morning');
    const [editStatus, setEditStatus] = useState('ACTIVE');
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

    const [attPage, setAttPage] = useState(1);
    const [attUserId, setAttUserId] = useState('');
    const [attStationId, setAttStationId] = useState('');
    const [attFromDate, setAttFromDate] = useState('');
    const [attToDate, setAttToDate] = useState('');

    const resetStaffPage = () => setStaffPage(1);
    const resetAttPage = () => setAttPage(1);

    const { data: stationsData } = useQuery({
      queryKey: ['stations-list-lookup', staffStationIds],
      queryFn: async () => {
        // When scoped by ids, limit=50 is far more than enough; avoids full-scan
        const params: Record<string, any> = { limit: 50 };
        if (!isAdmin && staffStationIds.length > 0) params.ids = staffStationIds.join(',');
        const res = await apiClient.get('/stations', { params });
        return res.data?.items ?? [];
      },
    });
    const stations = stationsData || [];

    const { data: staffData, isLoading: loadingStaff, refetch: refetchStaff } = useQuery<PagedStaff>({
      queryKey: ['staff', staffPage, staffPosition, staffShift],
      queryFn: async () => {
        const offset = (staffPage - 1) * LIMIT;
        const params: Record<string, any> = { limit: LIMIT, offset };
        if (staffPosition) params.position = staffPosition;
        if (staffShift) params.shift = staffShift;
        const res = await apiClient.get('/staff', { params });
        if (Array.isArray(res.data)) return { items: res.data, total: res.data.length };
        return res.data ?? { items: [], total: 0 };
      },
      enabled: tab === 'staff',
    });

    const { data: attData, isLoading: loadingAtt } = useQuery<PagedAttendance>({
      queryKey: ['attendance', attPage, attUserId, attStationId, attFromDate, attToDate, user?.id, staffStationIds],
      queryFn: async () => {
        const offset = (attPage - 1) * LIMIT;
        const params: Record<string, any> = { limit: LIMIT, offset };
        if (isAdmin) { if (attUserId.trim()) params.userId = attUserId.trim(); }
        else if (user?.id) { params.userId = user.id; }
        if (!isAdmin && staffStationIds.length > 0) params.stationIds = staffStationIds.join(',');
        else if (attStationId.trim()) params.stationId = attStationId.trim();
        if (attFromDate) params.fromDate = attFromDate;
        if (attToDate) params.toDate = attToDate;
        const res = await apiClient.get('/attendance', { params });
        const data = res.data ?? { items: [], total: 0 };
        const rawItems = Array.isArray(data) ? data : (data.items || []);
        const total = Array.isArray(data) ? data.length : (data.total || 0);
        const items = rawItems.map((item: any) => ({
          ...item, checkIn: item.checkIn || item.checkInTime, checkInTime: item.checkInTime || item.checkIn,
          checkOut: item.checkOut || item.checkOutTime, checkOutTime: item.checkOutTime || item.checkOut,
        }));
        return { items, total };
      },
      enabled: tab === 'attendance' || (!isAdmin && isStaff),
    });

    const staffList = staffData?.items ?? [];
    const staffTotal = staffData?.total ?? 0;
    const staffTotalPages = Math.max(1, Math.ceil(staffTotal / LIMIT));

    const [staffCalYear, setStaffCalYear] = useState(today.getFullYear());
    const [staffCalMonth, setStaffCalMonth] = useState(today.getMonth());

    const { data: selectedStaffAttData } = useQuery<PagedAttendance>({
      queryKey: ['staff-attendance', selectedStaff?.userId, staffCalYear, staffCalMonth],
      queryFn: async () => {
        if (!selectedStaff) return { items: [], total: 0 };
        const monthStr = `${staffCalYear}-${String(staffCalMonth + 1).padStart(2, '0')}`;
        const res = await apiClient.get('/attendance', { params: { userId: selectedStaff.userId, fromDate: `${monthStr}-01`, limit: 31 } });
        const data = res.data ?? { items: [], total: 0 };
        const rawItems = Array.isArray(data) ? data : (data.items || []);
        const items = rawItems.map((item: any) => ({
          ...item, checkIn: item.checkIn || item.checkInTime, checkInTime: item.checkInTime || item.checkIn,
          checkOut: item.checkOut || item.checkOutTime, checkOutTime: item.checkOutTime || item.checkOut,
        }));
        return { items, total: Array.isArray(data) ? data.length : (data.total || 0) };
      },
      enabled: !!selectedStaff,
    });

    const attendanceList = attData?.items ?? [];
    const attTotal = attData?.total ?? 0;
    const attTotalPages = Math.max(1, Math.ceil(attTotal / LIMIT));

    const calendarDays = getMonthDays(calYear, calMonth);
    const monthAttendance = useMemo(() => {
      const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
      return attendanceList.filter((a: Attendance) => a.checkInTime?.startsWith(monthStr));
    }, [attendanceList, calYear, calMonth]);

    const getAttForDay = (day: number) => {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return monthAttendance.find((a: Attendance) => a.checkInTime?.startsWith(dateStr));
    };

    const getDayStatus = (day: number) => {
      const att = getAttForDay(day);
      if (!att) return null;
      if (att.status === 'late') return 'late';
      if (att.status === 'absent') return 'absent';
      if (att.status === 'leave') return 'leave';
      return 'present';
    };

    const handleAddStaffSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUserId.trim()) { toast.error(tSafe('dashboard:staff.enter_user_id', 'Vui lòng nhập User ID của nhân viên')); return; }
      setIsSubmittingAdd(true);
      try {
        const selectedStation = stations.find((st: any) => st.id === newStationId);
        await apiClient.post('/staff', {
          userId: newUserId.trim(), position: newPosition, shift: newShift,
          notes: newNotes.trim() || null, stationId: newStationId || '00000000-0000-0000-0000-000000000000',
          stationName: selectedStation ? selectedStation.name : 'EV Station',
        });
        toast.success(tSafe('dashboard:staff.add_success', 'Thêm hồ sơ nhân viên mới thành công'));
        setIsAddModalOpen(false); setNewUserId(''); setNewNotes(''); setNewStationId('');
        refetchStaff();
      } catch (err: any) { toast.error(translateMessage(err?.response?.data?.message, 'dashboard:staff.add_error')); }
      finally { setIsSubmittingAdd(false); }
    };

    const handleEditStaffSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingStaff) return;
      setIsSubmittingEdit(true);
      try {
        await apiClient.patch(`/staff/${editingStaff.id}`, { position: editPosition, shift: editShift, status: editStatus });
        toast.success(tSafe('dashboard:staff.update_success', 'Cập nhật hồ sơ nhân viên thành công'));
        setIsEditModalOpen(false); setEditingStaff(null);
        refetchStaff();
      } catch (err: any) { toast.error(translateMessage(err?.response?.data?.message, 'dashboard:staff.update_error')); }
      finally { setIsSubmittingEdit(false); }
    };

    const handleDeleteStaff = async (staffId: string) => {
      if (!window.confirm(tSafe('dashboard:staff.confirm_delete', 'Bạn có chắc chắn muốn xóa hồ sơ nhân sự này khỏi hệ thống không?'))) return;
      try {
        await apiClient.delete(`/staff/${staffId}`);
        toast.success(tSafe('dashboard:staff.delete_success', 'Đã xóa hồ sơ nhân viên thành công'));
        setSelectedStaff(null); refetchStaff();
      } catch (err: any) { toast.error(translateMessage(err?.response?.data?.message, 'dashboard:staff.delete_error')); }
    };

    const openEditModal = (s: Staff) => {
      setEditingStaff(s); setEditPosition(s.position.toLowerCase());
      setEditShift(s.shift.toLowerCase()); setEditStatus(s.status);
      setIsEditModalOpen(true);
    };

    const STATUS_COLORS: Record<string, string> = { present: 'bg-green', late: 'bg-orange', absent: 'bg-red', leave: 'bg-blue' };
    const STATUS_TEXT: Record<string, string> = { present: 'Có mặt', late: 'Đi muộn', absent: 'Vắng', leave: 'Nghỉ phép' };

    return (
      <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-h2 font-bold text-text-main">{t('dashboard:staff.title')}</h1>
            <p className="text-text-muted text-sm mt-1">{t('dashboard:staff.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
              <button onClick={() => setTab('staff')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                  tab === 'staff' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-text-main'
                }`}>
                <Users className="w-3.5 h-3.5" /> {t('dashboard:staff.tab_staff')}
              </button>
              <button onClick={() => setTab('attendance')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                  tab === 'attendance' ? 'bg-lime/20 text-lime border border-lime/25' : 'text-text-muted hover:text-text-main'
                }`}>
                <MapPin className="w-3.5 h-3.5" /> {t('dashboard:staff.tab_attendance')}
              </button>
            </div>

            {tab === 'attendance' && (
              <>
                <div className="flex items-center gap-1.5 text-text-muted text-xs"><Filter className="w-3.5 h-3.5" /><span>Lọc:</span></div>
                <input value={attUserId} onChange={(e) => { setAttUserId(e.target.value); resetAttPage(); }}
                  placeholder="Mã nhân viên (UUID)..." className="ev-input h-9 text-xs w-44 font-mono pl-3" />
                <input value={attStationId} onChange={(e) => { setAttStationId(e.target.value); resetAttPage(); }}
                  placeholder="Mã trạm (UUID)..." className="ev-input h-9 text-xs w-44 font-mono pl-3" />
                <input type="date" value={attFromDate} onChange={(e) => { setAttFromDate(e.target.value); resetAttPage(); }}
                  className="ev-input h-9 text-xs w-36 pl-3" />
                <span className="text-text-muted text-xs">đến</span>
                <input type="date" value={attToDate} onChange={(e) => { setAttToDate(e.target.value); resetAttPage(); }}
                  className="ev-input h-9 text-xs w-36 pl-3" />
                {(attUserId || attStationId || attFromDate || attToDate) && (
                  <button onClick={() => { setAttUserId(''); setAttStationId(''); setAttFromDate(''); setAttToDate(''); resetAttPage(); }}
                    className="text-xs text-text-muted hover:text-danger transition-colors">Xóa bộ lọc</button>
                )}
                <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg">
                  <button onClick={() => setViewMode('calendar')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-cyan/20 text-cyan' : 'text-text-muted hover:text-text-main'}`}
                    title="Lịch"><CalendarDays className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-cyan/20 text-cyan' : 'text-text-muted hover:text-text-main'}`}
                    title="Danh sách"><List className="w-3.5 h-3.5" /></button>
                </div>
              </>
            )}

            {tab === 'staff' && (
              <>
                <div className="flex items-center gap-1.5 text-text-muted text-xs">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Lọc:</span>
                </div>
                <CustomSelect
                  value={staffPosition}
                  onChange={(val) => { setStaffPosition(val); resetStaffPage(); }}
                  options={[
                    { value: '', label: 'Tất cả vị trí' },
                    { value: 'manager', label: 'Quản lý' },
                    { value: 'supervisor', label: 'Giám sát viên' },
                    { value: 'operator', label: 'Vận hành viên' },
                    { value: 'technician', label: 'Kỹ thuật viên' },
                  ]}
                  className="w-36 h-9"
                />
                <CustomSelect
                  value={staffShift}
                  onChange={(val) => { setStaffShift(val); resetStaffPage(); }}
                  options={[
                    { value: '', label: 'Tất cả ca làm' },
                    { value: 'morning', label: 'Ca sáng' },
                    { value: 'afternoon', label: 'Ca chiều' },
                    { value: 'night', label: 'Ca đêm' },
                  ]}
                  className="w-36 h-9"
                />
                {(staffPosition || staffShift) && (
                  <button
                    onClick={() => { setStaffPosition(''); setStaffShift(''); resetStaffPage(); }}
                    className="text-xs text-text-muted hover:text-danger transition-colors mr-1"
                  >
                    Xóa bộ lọc
                  </button>
                )}
                <button onClick={() => setIsAddModalOpen(true)}
                  className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all flex items-center gap-1.5"
                  style={{ background: 'var(--grad-cyan-lime)' }}>
                  <UserPlus className="w-3.5 h-3.5" /> {t('dashboard:staff.add')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
          {/* Staff List (left column) */}
          <div className={cn("glass flex flex-col overflow-hidden min-h-0",
            tab === 'attendance' ? "lg:col-span-3" : selectedStaff ? "lg:col-span-1" : "lg:col-span-3 w-full")}>
            {tab === 'staff' ? (
              <>
                <div className="px-5 py-4 border-b border-white/5 shrink-0 flex items-center justify-between">
                  <p className="font-semibold text-text-main text-sm">Danh sách nhân viên</p>
                  <span className="text-[10px] text-text-muted">{staffTotal} nhân viên</span>
                </div>
                {!selectedStaff && (
                  <div className="px-6 py-2 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-text-muted shrink-0">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-5 text-center">Nhân viên</div>
                      <div className="col-span-2 text-center">Vị trí</div>
                      <div className="col-span-2 text-center">Ca</div>
                      <div className="col-span-3 text-center">Trạng thái</div>
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="flex flex-col divide-y divide-white/5">
                    {loadingStaff ? (
                      <div className="flex flex-col gap-2 p-4">
                        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
                      </div>
                    ) : staffList.length ? staffList.map((s) => {
                      const isSelected = selectedStaff?.userId === s.userId;
                      return (
                        <motion.div key={s.userId} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          onClick={() => setSelectedStaff(s)}
                          className={cn("px-4 py-3.5 transition-colors cursor-pointer border-l-[3px] relative",
                            !selectedStaff && "px-6 py-5",
                            isSelected ? "bg-gradient-to-r from-cyan/[0.08] to-transparent border-cyan shadow-[inset_0_0_20px_-10px_rgba(16,191,201,0.15)]" : "border-transparent hover:bg-white/5"
                          )}>
                          {!selectedStaff ? (
                            <div className="grid grid-cols-12 gap-4 items-center">
                              <div className="col-span-5 flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan to-lime flex items-center justify-center text-white font-bold text-sm shrink-0">
                                  {((s.User?.fullName || '?').trim().split(' ').pop() || '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-text-main truncate text-left">{s.User?.fullName || '—'}</p>
                                  <p className="text-text-muted text-xs truncate mt-0.5 text-left">{s.User?.email || '—'}</p>
                                </div>
                              </div>
                              <div className="col-span-2 text-left text-xs text-text-muted">{formatPosition(s.position)}</div>
                              <div className="col-span-2 text-left text-xs text-text-muted">{formatShift(s.shift)}</div>
                              <div className="col-span-3 text-left"><span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'} text-[10px]`}>{formatStatus(s.status)}</span></div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex items-center gap-2">
                                  {isSelected && <CheckCircle className="w-4 h-4 text-cyan shrink-0" />}
                                  <div>
                                    <p className={cn("text-sm font-medium truncate", isSelected ? "text-cyan" : "text-text-main")}>{s.User?.fullName || '—'}</p>
                                    <p className="text-text-muted text-xs truncate mt-0.5">{s.User?.email || '—'}</p>
                                  </div>
                                </div>
                                <span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'} shrink-0`}>{formatStatus(s.status)}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="badge badge-info text-[9px]">{formatPosition(s.position)}</span>
                                <span className="badge badge-muted text-[9px]">{formatShift(s.shift)}</span>
                              </div>
                            </>
                          )}
                        </motion.div>
                      );
                    }) : (
                      <div className="text-center py-8 text-text-muted text-sm">{t('common:common.no_data')}</div>
                    )}
                  </div>
                </div>

              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-white/5 shrink-0 flex items-center justify-between">
                  <p className="font-semibold text-text-main text-sm">
                    {viewMode === 'calendar' ? `Lịch điểm danh - ${VIETNAMESE_MONTHS[calMonth]} ${calYear}` : 'Lịch sử chấm công'}
                  </p>
                  {viewMode === 'calendar' && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                      <span className="text-xs font-semibold text-text-main min-w-[120px] text-center">{VIETNAMESE_MONTHS[calMonth]} {calYear}</span>
                      <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main transition-colors"><ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); }}
                        className="ml-2 px-3 py-1 rounded-lg text-xs font-semibold bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 transition-colors">Hôm nay</button>
                    </div>
                  )}
                </div>

                {viewMode === 'calendar' && (
                  <div className="p-4 flex-1 overflow-y-auto">
                    <div className="grid grid-cols-7 gap-1 mb-2">{DAY_LABELS.map((d) => (
                      <div key={d} className="text-center text-[10px] font-bold text-text-muted uppercase tracking-wider py-1">{d}</div>
                    ))}</div>
                    <div className="grid grid-cols-7 gap-1">{calendarDays.map((day, idx) => {
                      if (day === null) return <div key={`empty-${idx}`} className="aspect-square rounded-xl bg-white/[0.02]" />;
                      const status = getDayStatus(day);
                      const att = getAttForDay(day);
                      const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
                      const bgColor = status === 'present' ? 'bg-green/15 border-green/30'
                        : status === 'late' ? 'bg-orange/15 border-orange/30'
                        : status === 'absent' ? 'bg-red/15 border-red/30'
                        : status === 'leave' ? 'bg-blue/15 border-blue/30'
                        : isToday ? 'border-cyan/40 bg-white/[0.03]' : 'border-white/5 bg-white/[0.03]';
                      const textColor = status === 'present' ? 'text-green font-bold'
                        : status === 'late' ? 'text-orange font-bold'
                        : status === 'absent' ? 'text-red font-bold'
                        : status === 'leave' ? 'text-blue font-bold'
                        : isToday ? 'text-cyan font-bold' : 'text-text-main';
                      return (
                        <div key={day}
                          className={`aspect-square rounded-xl border p-1.5 flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer hover:bg-white/5 ${bgColor}`}
                          title={att ? `${att.status === 'late' ? 'Đi muộn' : att.status === 'absent' ? 'Vắng' : att.status === 'leave' ? 'Nghỉ phép' : 'Có mặt'}: ${new Date(att.checkInTime).toLocaleTimeString('vi-VN')}` : ''}>
                          <span className={`text-xs ${textColor}`}>{day}</span>
                          {status && <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[status]}`} />}
                          {att?.checkInTime && <span className="text-[8px] text-text-muted">{new Date(att.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                      );
                    })}</div>
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green" /><span className="text-[10px] text-text-muted">Có mặt</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange" /><span className="text-[10px] text-text-muted">Đi muộn</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red" /><span className="text-[10px] text-text-muted">Vắng</span></div>
                      <button onClick={() => setViewMode('table')}
                        className="ml-auto px-3 py-1 rounded-lg text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main transition-colors flex items-center gap-1">
                        <List className="w-3 h-3" /> Xem tất cả
                      </button>
                    </div>
                  </div>
                )}

                {viewMode === 'table' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto min-h-0">
                      <div className="overflow-x-auto">
                        <table className="ev-table">
                          <thead><tr>
                            <th>{t('dashboard:staff.table_att.employee')}</th>
                            <th>{t('dashboard:staff.table_att.station')}</th>
                            <th>{t('dashboard:staff.table_att.checkin')}</th>
                            <th>{t('dashboard:staff.table_att.checkout')}</th>
                            <th>{t('dashboard:staff.table_att.gps')}</th>
                            <th>Trạng thái</th>
                          </tr></thead>
                          <tbody>
                            {loadingAtt ? Array.from({ length: LIMIT }).map((_, i) => (
                              <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                                <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                              ))}</tr>
                            )) : attendanceList.length ? attendanceList.map((a: Attendance) => (
                              <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <td className="text-text-main font-medium">{a.User?.fullName || a.userId.slice(0, 8)}…</td>
                                <td className="font-mono text-xs">{a.stationId ? a.stationId.slice(0, 8) : '—'}…</td>
                                <td><div className="flex items-center gap-1.5 text-xs"><Clock className="w-3.5 h-3.5 text-success" />{new Date(a.checkInTime).toLocaleTimeString('vi-VN')}</div>
                                  <p className="text-[10px] text-text-muted mt-0.5">{new Date(a.checkInTime).toLocaleDateString('vi-VN')}</p></td>
                                <td>{a.checkOutTime ? (<><div className="flex items-center gap-1.5 text-xs text-text-muted"><Clock className="w-3.5 h-3.5" />{new Date(a.checkOutTime).toLocaleTimeString('vi-VN')}</div>
                                  <p className="text-[10px] text-text-muted mt-0.5">{new Date(a.checkOutTime).toLocaleDateString('vi-VN')}</p></>) : (
                                  <span className="badge badge-warning">Đang trực</span>)}</td>
                                <td className="font-mono text-xs text-text-muted">{a.latitude?.toFixed(4)}, {a.longitude?.toFixed(4)}</td>
                                <td><span className={`badge ${
                                  a.status === 'present' ? 'badge-success' : a.status === 'late' ? 'badge-warning' : a.status === 'absent' ? 'badge-danger' : 'badge-muted'
                                }`}>{formatAttendanceStatus(a.status ?? 'unknown')}</span></td>
                              </motion.tr>
                            )) : (
                              <tr><td colSpan={6} className="text-center py-8 text-text-muted">Không có dữ liệu</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Panel */}
          {tab === 'staff' && selectedStaff && (
            <div className="lg:col-span-2 glass flex flex-col overflow-hidden min-h-0">
              {selectedStaff ? (() => {
            const staffAttItems = selectedStaffAttData?.items ?? [];
            const staffCalDays = getMonthDays(staffCalYear, staffCalMonth);
            const staffMonthAtt = staffAttItems.filter((a: Attendance) =>
              a.checkInTime?.startsWith(`${staffCalYear}-${String(staffCalMonth + 1).padStart(2, '0')}`)
            );
            const staffGetAtt = (day: number) => {
              const dateStr = `${staffCalYear}-${String(staffCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return staffMonthAtt.find((a: Attendance) => a.checkInTime?.startsWith(dateStr));
            };
            const staffDayStatus = (day: number) => {
              const att = staffGetAtt(day); if (!att) return null;
              if (att.status === 'late') return 'late'; if (att.status === 'absent') return 'absent'; if (att.status === 'leave') return 'leave';
              return 'present';
            };
            return (
              <div className="flex flex-col overflow-hidden animate-fade-in h-full">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                  <div className="min-w-0 mr-2 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan to-lime flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {((selectedStaff.User?.fullName || '?').trim().split(' ').pop() || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-text-main text-sm truncate">{selectedStaff.User?.fullName || '—'}</h3>
                      <p className="text-[10px] text-text-muted truncate">{selectedStaff.User?.email || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => { setSelectedStaff(null); openEditModal(selectedStaff); }}
                      className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-cyan hover:bg-white/10 transition-colors" title="Sửa"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDeleteStaff(selectedStaff.id)}
                      className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-danger hover:bg-white/10 transition-colors" title="Xoá"><Trash2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setSelectedStaff(null)}
                      className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                  {/* Info panel */}
                  <div className="w-full md:w-[280px] border-t md:border-t-0 md:border-r border-white/5 flex flex-col bg-white/[0.01] overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs scrollbar-thin">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                          <p className="text-[9px] text-text-muted uppercase tracking-wider font-bold">Vị trí</p>
                          <p className="text-xs font-semibold text-text-main mt-1">{formatPosition(selectedStaff.position)}</p>
                        </div>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                          <p className="text-[9px] text-text-muted uppercase tracking-wider font-bold">Ca làm</p>
                          <p className="text-xs font-semibold text-text-main mt-1">{formatShift(selectedStaff.shift)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                          <p className="text-[9px] text-text-muted uppercase tracking-wider font-bold">Trạng thái</p>
                          <p className="mt-1"><span className={`badge ${selectedStaff.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'} text-[10px]`}>{formatStatus(selectedStaff.status)}</span></p>
                        </div>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                          <p className="text-[9px] text-text-muted uppercase tracking-wider font-bold">Ngày nhận việc</p>
                          <p className="text-xs font-semibold text-text-main mt-1 flex items-center gap-1"><Calendar className="w-3 h-3 text-text-muted" />{selectedStaff.hireDate ? formatDate(selectedStaff.hireDate) : '—'}</p>
                        </div>
                      </div>
                      <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                        <p className="text-[9px] text-text-muted uppercase tracking-wider font-bold">Ghi chú</p>
                        <p className="text-xs text-text-muted italic mt-1">{selectedStaff.notes || '—'}</p>
                      </div>
                      <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                        <p className="text-[9px] text-text-muted uppercase tracking-wider font-bold">Mã hồ sơ</p>
                        <p className="text-[10px] font-mono text-text-main mt-1 break-all" title={selectedStaff.id}>{selectedStaff.id.slice(0, 8)}…</p>
                      </div>
                      <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                        <p className="text-[9px] text-text-muted uppercase tracking-wider font-bold">Mã tài khoản</p>
                        <p className="text-[10px] font-mono text-text-main mt-1 break-all" title={selectedStaff.userId}>{selectedStaff.userId.slice(0, 8)}…</p>
                      </div>
                    </div>
                  </div>

                  {/* Calendar panel */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.005]">
                      <h4 className="font-bold text-text-main text-xs uppercase tracking-wider flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-lime" /> Lịch check-in</h4>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { if (staffCalMonth === 0) { setStaffCalMonth(11); setStaffCalYear(staffCalYear - 1); } else setStaffCalMonth(staffCalMonth - 1); }}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
                        <span className="text-xs font-semibold text-text-main min-w-[100px] text-center">{VIETNAMESE_MONTHS[staffCalMonth]} {staffCalYear}</span>
                        <button onClick={() => { if (staffCalMonth === 11) { setStaffCalMonth(0); setStaffCalYear(staffCalYear + 1); } else setStaffCalMonth(staffCalMonth + 1); }}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setStaffCalYear(today.getFullYear()); setStaffCalMonth(today.getMonth()); }}
                          className="ml-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-cyan/10 text-cyan border border-cyan/20 transition-colors">Hôm nay</button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <div className="grid grid-cols-7 gap-1 mb-2">{DAY_LABELS.map((d) => (
                        <div key={d} className="text-center text-[10px] font-bold text-text-muted uppercase tracking-wider py-1">{d}</div>
                      ))}</div>
                      <div className="grid grid-cols-7 gap-1">{staffCalDays.map((day, idx) => {
                        if (day === null) return <div key={`e-${idx}`} className="aspect-square rounded-xl bg-white/[0.02]" />;
                        const status = staffDayStatus(day); const att = staffGetAtt(day);
                        const isToday = day === today.getDate() && staffCalMonth === today.getMonth() && staffCalYear === today.getFullYear();
                        const bgColor = status === 'present' ? 'bg-green/15 border-green/30'
                          : status === 'late' ? 'bg-orange/15 border-orange/30'
                          : status === 'absent' ? 'bg-red/15 border-red/30'
                          : status === 'leave' ? 'bg-blue/15 border-blue/30'
                          : isToday ? 'border-cyan/40 bg-white/[0.03]' : 'border-white/5 bg-white/[0.03]';
                        const textColor = status === 'present' ? 'text-green font-bold'
                          : status === 'late' ? 'text-orange font-bold'
                          : status === 'absent' ? 'text-red font-bold'
                          : status === 'leave' ? 'text-blue font-bold'
                          : isToday ? 'text-cyan font-bold' : 'text-text-main';
                        return (
                          <div key={day}
                            className={`aspect-square rounded-xl border p-1.5 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer hover:bg-white/5 ${bgColor}`}
                            title={att ? `${status === 'late' ? 'Đi muộn' : status === 'absent' ? 'Vắng' : status === 'leave' ? 'Nghỉ phép' : 'Có mặt'}: ${new Date(att.checkInTime).toLocaleTimeString('vi-VN')}` : ''}>
                            <span className={`text-xs ${textColor}`}>{day}</span>
                            {status && <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[status]}`} />}
                            {att?.checkInTime && <span className="text-[7px] text-text-muted">{new Date(att.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
                          </div>
                        );
                      })}</div>
                      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green" /><span className="text-[10px] text-text-muted">Có mặt</span></div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange" /><span className="text-[10px] text-text-muted">Đi muộn</span></div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red" /><span className="text-[10px] text-text-muted">Vắng</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <Users className="w-16 h-16 text-text-muted/20 mx-auto" />
                <h3 className="text-text-muted font-semibold text-sm mt-4">Chọn một nhân viên</h3>
                <p className="text-text-muted/50 text-xs mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Nhấp vào tên nhân viên ở cột bên trái để xem thông tin chi tiết và lịch điểm danh
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Standalone Pagination */}
    {tab === 'staff' && (
      <div className="glass px-4 shrink-0">
        <Pagination
          page={staffPage}
          totalPages={staffTotalPages}
          onPageChange={setStaffPage}
          total={staffTotal}
          currentItemsCount={staffList.length}
          itemLabel="nhân viên"
        />
      </div>
    )}

    {tab === 'attendance' && viewMode === 'table' && (
      <div className="glass px-4 shrink-0">
        <Pagination
          page={attPage}
          totalPages={attTotalPages}
          onPageChange={setAttPage}
          total={attTotal}
          currentItemsCount={attendanceList.length}
          itemLabel="lượt chấm công"
        />
      </div>
    )}

        {/* Add Staff Modal */}
        {isAddModalOpen && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
              <form onSubmit={handleAddStaffSubmit} className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up">
                <div className="corner-marker cm-tl" /><div className="corner-marker cm-tr" /><div className="corner-marker cm-bl" /><div className="corner-marker cm-br" />
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
                  <div className="flex items-center gap-2"><UserPlus className="w-4 h-4 text-cyan" /><h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">Thêm nhân viên mới</h3></div>
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Mã tài khoản người dùng (User UUID) <span className="text-danger">*</span></label>
                    <input type="text" required value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className="ev-input w-full h-8 px-2.5 text-xs font-mono" placeholder="Nhập UUID tài khoản người dùng..." /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Vị trí trực</label>
                      <CustomSelect value={newPosition} onChange={setNewPosition} options={[
                        { value: 'manager', label: 'Quản lý' }, { value: 'supervisor', label: 'Giám sát viên' }, { value: 'operator', label: 'Vận hành viên' }, { value: 'technician', label: 'Kỹ thuật viên' },
                      ]} /></div>
                    <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Ca làm việc</label>
                      <CustomSelect value={newShift} onChange={setNewShift} options={[
                        { value: 'morning', label: 'Ca sáng (Morning)' }, { value: 'afternoon', label: 'Ca chiều' }, { value: 'night', label: 'Ca tối (Night)' },
                      ]} /></div>
                  </div>
                  <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Trạm sạc liên kết</label>
                    <CustomSelect value={newStationId} onChange={setNewStationId} options={[
                      { value: '', label: 'Tất cả trạm sạc' }, ...stations.map((st: any) => ({ value: st.id, label: st.name })),
                    ]} /></div>
                  <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Ghi chú</label>
                    <input type="text" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className="ev-input w-full h-8 px-2.5 text-xs" placeholder="Ghi chú về phân công, vị trí..." /></div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl">Hủy</button>
                  <button type="submit" disabled={isSubmittingAdd} className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all flex items-center gap-1.5" style={{ background: 'var(--grad-cyan-lime)' }}>
                    {isSubmittingAdd && <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />}Tạo mới</button>
                </div>
              </form>
            </div>
          </Portal>
        )}

        {/* Edit Staff Modal */}
        {isEditModalOpen && editingStaff && (
          <Portal>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
              <form onSubmit={handleEditStaffSubmit} className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up">
                <div className="corner-marker cm-tl" /><div className="corner-marker cm-tr" /><div className="corner-marker cm-bl" /><div className="corner-marker cm-br" />
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
                  <div className="flex items-center gap-2"><Edit className="w-4 h-4 text-cyan" /><h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">Cập nhật thông tin nhân viên</h3></div>
                  <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingStaff(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-3.5 text-xs">
                  <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Tên nhân viên</label>
                    <div className="font-bold text-slate-900 dark:text-white text-sm bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-1.5">{editingStaff.User?.fullName || 'Chưa cập nhật hồ sơ'}</div></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Vị trí trực</label>
                      <CustomSelect value={editPosition} onChange={setEditPosition} options={[
                        { value: 'manager', label: 'Quản lý' }, { value: 'supervisor', label: 'Giám sát viên' }, { value: 'operator', label: 'Vận hành viên' }, { value: 'technician', label: 'Kỹ thuật viên' },
                      ]} /></div>
                    <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Ca làm việc</label>
                      <CustomSelect value={editShift} onChange={setEditShift} options={[
                        { value: 'morning', label: 'Ca sáng (Morning)' }, { value: 'afternoon', label: 'Ca chiều' }, { value: 'night', label: 'Ca tối (Night)' },
                      ]} /></div>
                  </div>
                  <div className="flex flex-col gap-1"><label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái hoạt động</label>
                    <CustomSelect value={editStatus} onChange={setEditStatus} options={[
                      { value: 'ACTIVE', label: 'Hoạt động (ACTIVE)' }, { value: 'INACTIVE', label: 'Không hoạt động (INACTIVE)' },
                    ]} /></div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingStaff(null); }} className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl">Hủy</button>
                  <button type="submit" disabled={isSubmittingEdit} className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all flex items-center gap-1.5" style={{ background: 'var(--grad-cyan-lime)' }}>
                    {isSubmittingEdit && <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />}Lưu thay đổi</button>
                </div>
              </form>
            </div>
          </Portal>
        )}
      </div>
    );
  }

  /* ── Staff: station management dashboard ── */
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance'>('overview');

  const { data: stationsData } = useQuery({
    queryKey: ['staff-stations', staffStationIds],
    queryFn: async () => {
      // Always scoped by ids (staff-assigned stations); limit=50 covers any realistic count
      const params: Record<string, any> = { limit: 50 };
      if (staffStationIds.length > 0) params.ids = staffStationIds.join(',');
      const res = await apiClient.get('/stations', { params });
      return (res.data?.items ?? []) as Station[];
    },
  });
  const stations = stationsData || [];

  const { data: activeSessionsData } = useQuery({
    queryKey: ['staff-active-sessions', staffStationIds],
    queryFn: async () => {
      const res = await apiClient.get('/charging/history', { params: { status: 'active', limit: 50 } });
      const allSessions = res.data?.items ?? [];
      const assignedStations = stations.filter((s) => staffStationIds.includes(s.id));
      const assignedChargerIds = new Set(assignedStations.flatMap((s) => s.chargers?.map((c) => c.id) ?? []));
      return assignedChargerIds.size > 0
        ? allSessions.filter((s: any) => assignedChargerIds.has(s.chargerId))
        : [];
    },
    refetchInterval: 10_000,
    enabled: activeTab === 'overview',
  });
  const activeSessions = activeSessionsData || [];

  const { data: attendanceData, isLoading: loadingAtt } = useQuery<PagedAttendance>({
    queryKey: ['staff-my-attendance', user?.id],
    queryFn: async () => {
      const params: Record<string, any> = { limit: 31, offset: 0 };
      if (user?.id) params.userId = user.id;
      if (staffStationIds.length > 0) params.stationIds = staffStationIds.join(',');
      const res = await apiClient.get('/attendance', { params });
      const data = res.data ?? { items: [], total: 0 };
      const rawItems = Array.isArray(data) ? data : (data.items || []);
      const items = rawItems.map((item: any) => ({
        ...item, checkIn: item.checkIn || item.checkInTime, checkInTime: item.checkInTime || item.checkIn,
        checkOut: item.checkOut || item.checkOutTime, checkOutTime: item.checkOutTime || item.checkOut,
      }));
      return { items, total: Array.isArray(data) ? data.length : (data.total || 0) };
    },
  });
  const attendanceList = attendanceData?.items ?? [];

  const calendarDays = getMonthDays(calYear, calMonth);
  const monthAttendance = useMemo(() => {
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    return attendanceList.filter((a: Attendance) => a.checkInTime?.startsWith(monthStr));
  }, [attendanceList, calYear, calMonth]);

  const getAttForDay = (day: number) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return monthAttendance.find((a: Attendance) => a.checkInTime?.startsWith(dateStr));
  };

  const getDayStatus = (day: number) => {
    const att = getAttForDay(day);
    if (!att) return null;
    if (att.status === 'late') return 'late';
    if (att.status === 'absent') return 'absent';
    if (att.status === 'leave') return 'leave';
    return 'present';
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const myTodayAttendance = attendanceList.find((a: Attendance) => a.userId === user?.id && a.checkInTime?.startsWith(todayStr));

  const handleCheckIn = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { toast.error(tSafe('common:gps.not_supported', 'Trình duyệt không hỗ trợ định vị GPS!')); return; }
    toast.info(tSafe('common:gps.fetching', 'Đang lấy tọa độ GPS...'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const stationId = staffStationIds[0] || undefined;
          await apiClient.post('/attendance/check-in', { latitude: pos.coords.latitude, longitude: pos.coords.longitude, stationId });
          toast.success(tSafe('dashboard:home.checkin.checkin_success', 'Check-in thành công!'));
        } catch (err: any) {
          const data = err?.response?.data;
          const errMsg = data?.message;
          const errStr = Array.isArray(errMsg) ? errMsg.join('; ') : (errMsg || '');
          console.error('[Check-in error]', JSON.stringify(data));
          if (/latitude|longitude|tọa độ|coordinates/i.test(errStr)) {
            toast.error(tSafe('dashboard:home.checkin.out_of_range', 'Bạn cần đến trạm để thực hiện thao tác (GPS hiện tại ngoài phạm vi)'));
          } else {
            toast.error(translateMessage(errStr, 'dashboard:home.checkin.checkin_failed'));
          }
        }
      }, () => { toast.error(tSafe('common:gps.permission_denied', 'Vui lòng cấp quyền truy cập GPS!')); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleCheckOut = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { toast.error(tSafe('common:gps.not_supported', 'Trình duyệt không hỗ trợ định vị GPS!')); return; }
    toast.info(tSafe('common:gps.fetching', 'Đang lấy tọa độ GPS...'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiClient.post('/attendance/check-out', { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          toast.success(tSafe('dashboard:home.checkin.checkout_success', 'Check-out thành công!'));
        } catch (err: any) {
          const data = err?.response?.data;
          const errMsg = data?.message;
          const errStr = Array.isArray(errMsg) ? errMsg.join('; ') : (errMsg || '');
          console.error('[Check-out error]', JSON.stringify(data));
          if (/latitude|longitude|tọa độ|coordinates/i.test(errStr)) {
            toast.error(tSafe('dashboard:home.checkin.out_of_range', 'Bạn cần đến trạm để thực hiện thao tác (GPS hiện tại ngoài phạm vi)'));
          } else {
            toast.error(translateMessage(errStr, 'dashboard:home.checkin.checkout_failed'));
          }
        }
      }, () => { toast.error(tSafe('common:gps.permission_denied', 'Vui lòng cấp quyền truy cập GPS!')); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const STATUS_COLORS: Record<string, string> = { present: 'bg-green', late: 'bg-orange', absent: 'bg-red', leave: 'bg-blue' };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">Quản lý trạm</h1>
          <p className="text-text-muted text-sm mt-1">
            Giám sát {stations.length} trạm sạc được phân công
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Check-in / Check-out */}
          {myTodayAttendance ? (
            <button onClick={handleCheckOut}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-orange/80 hover:bg-orange rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-orange/20">
              <Clock className="w-3.5 h-3.5" /> Check-out
            </button>
          ) : (
            <button onClick={handleCheckIn}
              className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-lime/20 rounded-xl transition-all flex items-center gap-1.5"
              style={{ background: 'var(--grad-cyan-lime)' }}>
              <MapPin className="w-3.5 h-3.5" /> Check-in
            </button>
          )}
          {myTodayAttendance && (
            <span className="text-[10px] text-text-muted flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green" />
              Đã check-in {new Date(myTodayAttendance.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {/* Tab switch */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            <button onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'overview' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-text-main'
              }`}>
              <Activity className="w-3.5 h-3.5" /> Tổng quan
            </button>
            <button onClick={() => setActiveTab('attendance')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'attendance' ? 'bg-lime/20 text-lime border border-lime/25' : 'text-text-muted hover:text-text-main'
              }`}>
              <CalendarDays className="w-3.5 h-3.5" /> Điểm danh
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Station overview cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 shrink-0">
            {stations.map((station) => {
              const chargers = station.chargers || [];
              const available = chargers.filter((c) => c.status === 'available').length;
              const inUse = chargers.filter((c) => c.status === 'in_use').length;
              const offline = chargers.filter((c) => c.status === 'offline').length;
              const maintenance = chargers.filter((c) => c.status === 'maintenance').length;
              const stationActiveSessions = activeSessions.filter((s: any) =>
                chargers.some((c) => c.id === s.chargerId)
              );
              return (
                <div key={station.id} className="glass p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        station.status === 'active' ? 'bg-green' : station.status === 'inactive' ? 'bg-red' : 'bg-orange'
                      }`} />
                      <h3 className="font-bold text-sm text-text-main truncate">{station.name}</h3>
                    </div>
                    <span className="badge badge-muted text-[10px] shrink-0">{chargers.length} trụ</span>
                  </div>
                  <p className="text-[10px] text-text-muted truncate">{station.address || '—'}</p>
                  {/* Charger status grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green/5 border border-green/20 rounded-xl p-2 text-center">
                      <p className="text-lg font-bold text-green">{available}</p>
                      <p className="text-[9px] text-text-muted uppercase tracking-wider">Sẵn sàng</p>
                    </div>
                    <div className="bg-cyan/5 border border-cyan/20 rounded-xl p-2 text-center">
                      <p className="text-lg font-bold text-cyan">{inUse}</p>
                      <p className="text-[9px] text-text-muted uppercase tracking-wider">Đang sạc</p>
                    </div>
                    <div className="bg-red/5 border border-red/20 rounded-xl p-2 text-center">
                      <p className="text-lg font-bold text-red">{offline}</p>
                      <p className="text-[9px] text-text-muted uppercase tracking-wider">Mất KN</p>
                    </div>
                    <div className="bg-yellow/5 border border-yellow/20 rounded-xl p-2 text-center">
                      <p className="text-lg font-bold text-yellow">{maintenance}</p>
                      <p className="text-[9px] text-text-muted uppercase tracking-wider">Bảo trì</p>
                    </div>
                  </div>
                  {/* Active sessions count */}
                  {stationActiveSessions.length > 0 && (
                    <div className="bg-cyan/5 border border-cyan/20 rounded-xl px-3 py-1.5 flex items-center gap-2">
                      <Zap className="w-3 h-3 text-cyan" />
                      <span className="text-xs text-text-main font-medium">{stationActiveSessions.length} phiên đang sạc</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Active charging sessions */}
          <div className="glass flex flex-col overflow-hidden min-h-0 flex-1">
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="font-semibold text-text-main text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan" />
                Phiên sạc đang hoạt động
                {activeSessions.length > 0 && (
                  <span className="badge badge-warning text-[10px]">{activeSessions.length}</span>
                )}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="overflow-x-auto">
                <table className="ev-table">
                  <thead><tr>
                    <th>Trụ sạc</th>
                    <th>Người dùng</th>
                    <th>Bắt đầu</th>
                    <th>Năng lượng</th>
                    <th>Trạng thái</th>
                  </tr></thead>
                  <tbody>
                    {activeSessions.length ? activeSessions.map((s: any) => (
                      <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <td className="font-mono text-xs text-text-main">{s.chargerId ? s.chargerId.slice(0, 8) : '—'}…</td>
                        <td className="text-text-main font-medium">{s.userId?.slice(0, 8)}…</td>
                        <td><div className="flex items-center gap-1.5 text-xs"><Clock className="w-3.5 h-3.5 text-success" />{new Date(s.startTime).toLocaleTimeString('vi-VN')}</div>
                          <p className="text-[10px] text-text-muted mt-0.5">{new Date(s.startTime).toLocaleDateString('vi-VN')}</p></td>
                        <td className="text-text-main font-mono text-xs">{(s.energyKwh || 0).toFixed(1)} kWh</td>
                        <td><span className="badge badge-warning">Đang sạc</span></td>
                      </motion.tr>
                    )) : (
                      <tr><td colSpan={5} className="text-center py-8 text-text-muted">Không có phiên sạc nào đang hoạt động</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Attendance tab for staff */
        <div className="glass flex flex-col overflow-hidden min-h-0 flex-1">
          <div className="px-5 py-4 border-b border-white/5 shrink-0 flex items-center justify-between">
            <p className="font-semibold text-text-main text-sm">
              Lịch điểm danh - {VIETNAMESE_MONTHS[calMonth]} {calYear}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-semibold text-text-main min-w-[120px] text-center">{VIETNAMESE_MONTHS[calMonth]} {calYear}</span>
              <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main transition-colors"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); }}
                className="ml-2 px-3 py-1 rounded-lg text-xs font-semibold bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 transition-colors">Hôm nay</button>
            </div>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="grid grid-cols-7 gap-1 mb-2">{DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-text-muted uppercase tracking-wider py-1">{d}</div>
            ))}</div>
            <div className="grid grid-cols-7 gap-1">{calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="aspect-square rounded-xl bg-white/[0.02]" />;
              const status = getDayStatus(day);
              const att = getAttForDay(day);
              const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
              const bgColor = status === 'present' ? 'bg-green/15 border-green/30'
                : status === 'late' ? 'bg-orange/15 border-orange/30'
                : status === 'absent' ? 'bg-red/15 border-red/30'
                : status === 'leave' ? 'bg-blue/15 border-blue/30'
                : isToday ? 'border-cyan/40 bg-cyan/5' : 'border-white/5 bg-white/[0.03]';
              const textColor = status === 'present' ? 'text-green font-bold'
                : status === 'late' ? 'text-orange font-bold'
                : status === 'absent' ? 'text-red font-bold'
                : status === 'leave' ? 'text-blue font-bold'
                : isToday ? 'text-cyan font-bold' : 'text-text-main';
              return (
                <div key={day}
                  className={`aspect-square rounded-xl border p-1.5 flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer hover:bg-white/5 ${bgColor}`}
                  title={att ? `${status === 'late' ? 'Đi muộn' : status === 'absent' ? 'Vắng' : status === 'leave' ? 'Nghỉ phép' : 'Có mặt'}: ${new Date(att.checkInTime).toLocaleTimeString('vi-VN')}` : ''}>
                  <span className={`text-xs ${textColor}`}>{day}</span>
                  {status && <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />}
                  {att?.checkInTime && <span className="text-[8px] text-text-muted">{new Date(att.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              );
            })}</div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green" /><span className="text-[10px] text-text-muted">Có mặt</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange" /><span className="text-[10px] text-text-muted">Đi muộn</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red" /><span className="text-[10px] text-text-muted">Vắng</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
