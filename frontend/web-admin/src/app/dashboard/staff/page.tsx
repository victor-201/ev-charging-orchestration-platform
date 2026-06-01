'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { Users, UserPlus, MapPin, Clock, Filter, Eye, Copy, X, Edit, Trash2, Calendar, FileText, CheckCircle, ShieldAlert } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatDate } from '@/i18n/formatter';
import { useAuthStore } from '@/features/auth/store/auth.store';

type Staff = {
  id: string; // Staff profile ID
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
  User?: { fullName: string };
};

type PagedStaff = { items: Staff[]; total: number };
type PagedAttendance = { items: Attendance[]; total: number };

const LIMIT = 15;

export default function StaffPage() {
  const { user, isCheckingAuth } = useAuthStore();
  const [tab, setTab] = useState<'staff' | 'attendance'>('staff');
  const { t } = useTranslation(['dashboard', 'common']);

  const isAdmin = user?.roles?.includes('admin');

  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-danger animate-pulse" />
        <h2 className="text-xl font-bold text-text-main">Không có quyền truy cập</h2>
        <p className="text-text-muted text-sm max-w-sm text-center">
          Bạn không có quyền quản trị để xem trang này. Vui lòng liên hệ với quản trị viên hệ thống để biết thêm chi tiết.
        </p>
      </div>
    );
  }

  // Page and filter state for Staff
  const [staffPage, setStaffPage] = useState(1);
  const [staffPosition, setStaffPosition] = useState('');
  const [staffShift, setStaffShift] = useState('');

  // Modals state for Staff
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  // Form states for creating staff
  const [newUserId, setNewUserId] = useState('');
  const [newPosition, setNewPosition] = useState('operator');
  const [newShift, setNewShift] = useState('morning');
  const [newNotes, setNewNotes] = useState('');
  const [newStationId, setNewStationId] = useState('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Form states for editing staff
  const [editPosition, setEditPosition] = useState('operator');
  const [editShift, setEditShift] = useState('morning');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Page and filter state for Attendance
  const [attPage, setAttPage] = useState(1);
  const [attUserId, setAttUserId] = useState('');
  const [attStationId, setAttStationId] = useState('');
  const [attFromDate, setAttFromDate] = useState('');
  const [attToDate, setAttToDate] = useState('');

  const resetStaffPage = () => setStaffPage(1);
  const resetAttPage = () => setAttPage(1);

  // Fetch stations for dynamic dropdown mapping
  const { data: stationsData } = useQuery({
    queryKey: ['stations-list-lookup'],
    queryFn: async () => {
      const res = await apiClient.get('/stations', { params: { limit: 1000 } });
      return res.data?.items ?? [];
    },
  });
  const stations = stationsData || [];

  // Fetch Staff list
  const { data: staffData, isLoading: loadingStaff, refetch: refetchStaff } = useQuery<PagedStaff>({
    queryKey: ['staff', staffPage, staffPosition, staffShift],
    queryFn: async () => {
      const offset = (staffPage - 1) * LIMIT;
      const params: Record<string, any> = { limit: LIMIT, offset };
      if (staffPosition) params.position = staffPosition;
      if (staffShift) params.shift = staffShift;

      const res = await apiClient.get('/staff', { params });
      if (Array.isArray(res.data)) {
        return { items: res.data, total: res.data.length };
      }
      return res.data ?? { items: [], total: 0 };
    },
    enabled: tab === 'staff',
  });

  // Fetch Attendance list
  const { data: attData, isLoading: loadingAtt } = useQuery<PagedAttendance>({
    queryKey: ['attendance', attPage, attUserId, attStationId, attFromDate, attToDate],
    queryFn: async () => {
      const offset = (attPage - 1) * LIMIT;
      const params: Record<string, any> = { limit: LIMIT, offset };
      if (attUserId.trim()) params.userId = attUserId.trim();
      if (attStationId.trim()) params.stationId = attStationId.trim();
      if (attFromDate) params.fromDate = attFromDate;
      if (attToDate) params.toDate = attToDate;

      const res = await apiClient.get('/attendance', { params });
      const data = res.data ?? { items: [], total: 0 };
      const rawItems = Array.isArray(data) ? data : (data.items || []);
      const total = Array.isArray(data) ? data.length : (data.total || 0);
      const items = rawItems.map((item: any) => ({
        ...item,
        checkIn: item.checkIn || item.checkInTime,
        checkInTime: item.checkInTime || item.checkIn,
        checkOut: item.checkOut || item.checkOutTime,
        checkOutTime: item.checkOutTime || item.checkOut,
      }));
      return { items, total };
    },
    enabled: tab === 'attendance',
  });

  const staffList = staffData?.items ?? [];
  const staffTotal = staffData?.total ?? 0;
  const staffTotalPages = Math.max(1, Math.ceil(staffTotal / LIMIT));

  const attendanceList = attData?.items ?? [];
  const attTotal = attData?.total ?? 0;
  const attTotalPages = Math.max(1, Math.ceil(attTotal / LIMIT));

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim()) {
      toast.error('Vui lòng nhập User ID của nhân viên');
      return;
    }

    setIsSubmittingAdd(true);
    try {
      const selectedStation = stations.find((st: any) => st.id === newStationId);
      await apiClient.post('/staff', {
        userId: newUserId.trim(),
        position: newPosition,
        shift: newShift,
        notes: newNotes.trim() || null,
        stationId: newStationId || '00000000-0000-0000-0000-000000000000',
        stationName: selectedStation ? selectedStation.name : 'EV Station',
      });
      toast.success('Thêm hồ sơ nhân viên mới thành công');
      setIsAddModalOpen(false);
      setNewUserId('');
      setNewNotes('');
      setNewStationId('');
      refetchStaff();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Có lỗi xảy ra khi tạo hồ sơ nhân viên');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleEditStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    setIsSubmittingEdit(true);
    try {
      await apiClient.patch(`/staff/${editingStaff.id}`, {
        position: editPosition,
        shift: editShift,
        status: editStatus,
      });
      toast.success('Cập nhật hồ sơ nhân viên thành công');
      setIsEditModalOpen(false);
      setEditingStaff(null);
      refetchStaff();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không thể cập nhật thông tin nhân viên');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa hồ sơ nhân sự này khỏi hệ thống không?')) return;
    try {
      await apiClient.delete(`/staff/${staffId}`);
      toast.success('Đã xóa hồ sơ nhân viên thành công');
      setSelectedStaff(null);
      refetchStaff();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Xóa hồ sơ nhân viên thất bại');
    }
  };

  const openEditModal = (s: Staff) => {
    setEditingStaff(s);
    setEditPosition(s.position.toLowerCase());
    setEditShift(s.shift.toLowerCase());
    setEditStatus(s.status);
    setIsEditModalOpen(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">{t('dashboard:staff.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:staff.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Tab Switcher */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            <button
              onClick={() => setTab('staff')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                tab === 'staff' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> {t('dashboard:staff.tab_staff')}
            </button>
            <button
              onClick={() => setTab('attendance')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                tab === 'attendance' ? 'bg-lime/20 text-lime border border-lime/25' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" /> {t('dashboard:staff.tab_attendance')}
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <Filter className="w-3.5 h-3.5" />
            <span>Lọc:</span>
          </div>
          {tab === 'staff' ? (
            <>
              <CustomSelect
                value={staffPosition}
                onChange={(val) => { setStaffPosition(val); resetStaffPage(); }}
                options={[
                  { value: '', label: 'Tất cả vị trí' },
                  { value: 'operator', label: 'Vận hành viên' },
                  { value: 'technician', label: 'Kỹ thuật viên' },
                  { value: 'supervisor', label: 'Giám sát viên' },
                ]}
                className="w-40 h-9"
              />
              <CustomSelect
                value={staffShift}
                onChange={(val) => { setStaffShift(val); resetStaffPage(); }}
                options={[
                  { value: '', label: 'Tất cả ca trực' },
                  { value: 'morning', label: 'Ca sáng (Morning)' },
                  { value: 'afternoon', label: 'Ca chiều (Afternoon)' },
                  { value: 'night', label: 'Ca tối (Night)' },
                ]}
                className="w-40 h-9"
              />
              {(staffPosition || staffShift) && (
                <button
                  onClick={() => { setStaffPosition(''); setStaffShift(''); resetStaffPage(); }}
                  className="text-xs text-text-muted hover:text-danger transition-colors"
                >
                  Xóa bộ lọc
                </button>
              )}
            </>
          ) : (
            <>
              <input
                value={attUserId}
                onChange={(e) => { setAttUserId(e.target.value); resetAttPage(); }}
                placeholder="Mã nhân viên (UUID)..."
                className="ev-input h-9 text-xs w-44 font-mono pl-3"
              />
              <input
                value={attStationId}
                onChange={(e) => { setAttStationId(e.target.value); resetAttPage(); }}
                placeholder="Mã trạm (UUID)..."
                className="ev-input h-9 text-xs w-44 font-mono pl-3"
              />
              <input
                type="date"
                value={attFromDate}
                onChange={(e) => { setAttFromDate(e.target.value); resetAttPage(); }}
                className="ev-input h-9 text-xs w-36 pl-3"
              />
              <span className="text-text-muted text-xs">đến</span>
              <input
                type="date"
                value={attToDate}
                onChange={(e) => { setAttToDate(e.target.value); resetAttPage(); }}
                className="ev-input h-9 text-xs w-36 pl-3"
              />
              {(attUserId || attStationId || attFromDate || attToDate) && (
                <button
                  onClick={() => { setAttUserId(''); setAttStationId(''); setAttFromDate(''); setAttToDate(''); resetAttPage(); }}
                  className="text-xs text-text-muted hover:text-danger transition-colors"
                >
                  Xóa bộ lọc
                </button>
              )}
            </>
          )}

          {tab === 'staff' && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center gap-2 h-9 px-4 text-xs shrink-0"
            >
              <UserPlus className="w-4 h-4" /> {t('dashboard:staff.add_staff')}
            </button>
          )}
        </div>
      </div>

      {/* Main Glass Table Container */}
      <div className="glass flex flex-col overflow-hidden min-h-0 flex-1">
        {tab === 'staff' ? (
          <>
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="font-semibold text-text-main text-sm">{t('dashboard:staff.table_title_staff', { defaultValue: 'Danh sách nhân viên' })}</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="overflow-x-auto">
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard:staff.table_staff.employee')}</th>
                      <th>{t('dashboard:staff.table_staff.position')}</th>
                      <th>{t('dashboard:staff.table_staff.shift')}</th>
                      <th>{t('dashboard:staff.table_staff.status')}</th>
                      <th className="text-right pr-6">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStaff ? (
                      Array.from({ length: LIMIT }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    ) : staffList.length ? (
                      staffList.map((s) => (
                        <motion.tr 
                          key={s.userId} 
                          initial={{ opacity: 0 }} 
                          animate={{ opacity: 1 }}
                          onClick={() => setSelectedStaff(s)}
                          className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                        >
                          <td>
                            <p className="text-text-main font-medium">{s.User?.fullName || t('dashboard:staff.not_updated')}</p>
                            <p className="text-xs text-text-muted">{s.User?.email}</p>
                          </td>
                          <td>
                            <span className="badge badge-info">{t(`dashboard:data.staff.POSITION_${s.position.toUpperCase()}`, { defaultValue: s.position })}</span>
                          </td>
                          <td>
                            <span className="badge badge-muted">{t(`dashboard:data.staff.SHIFT_${s.shift.toUpperCase()}`, { defaultValue: s.shift })}</span>
                          </td>
                          <td>
                            <span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                              {t(`dashboard:data.status.${s.status}`, { defaultValue: s.status })}
                            </span>
                          </td>
                          <td className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end items-center gap-2">
                              <button 
                                onClick={() => setSelectedStaff(s)}
                                className="p-1 text-cyan hover:text-cyan/85 transition-colors"
                                title="Xem chi tiết"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => openEditModal(s)}
                                className="p-1 text-cyan hover:text-cyan/85 transition-colors"
                                title="Chỉnh sửa"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteStaff(s.id)}
                                className="p-1 text-danger hover:text-danger/80 transition-colors"
                                title="Xóa nhân sự"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-text-muted">{t('common:common.no_data')}</td>
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
              <p className="font-semibold text-text-main text-sm">{t('dashboard:staff.table_title_att', { defaultValue: 'Lịch sử chấm công' })}</p>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="overflow-x-auto">
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard:staff.table_att.employee')}</th>
                      <th>{t('dashboard:staff.table_att.station')}</th>
                      <th>{t('dashboard:staff.table_att.checkin')}</th>
                      <th>{t('dashboard:staff.table_att.checkout')}</th>
                      <th>{t('dashboard:staff.table_att.gps')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAtt ? (
                      Array.from({ length: LIMIT }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    ) : attendanceList.length ? (
                      attendanceList.map((a) => (
                        <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <td className="text-text-main font-medium">{a.User?.fullName || a.userId.slice(0, 8)}…</td>
                          <td className="font-mono text-xs">{a.stationId ? a.stationId.slice(0, 8) : '—'}…</td>
                          <td>
                            <div className="flex items-center gap-1.5 text-xs">
                              <Clock className="w-3.5 h-3.5 text-success" />
                              {new Date(a.checkInTime).toLocaleTimeString()}
                            </div>
                            <p className="text-[10px] text-text-muted mt-0.5">{new Date(a.checkInTime).toLocaleDateString()}</p>
                          </td>
                          <td>
                            {a.checkOutTime ? (
                              <>
                                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                                  <Clock className="w-3.5 h-3.5" />
                                  {new Date(a.checkOutTime).toLocaleTimeString()}
                                </div>
                                <p className="text-[10px] text-text-muted mt-0.5">{new Date(a.checkOutTime).toLocaleDateString()}</p>
                              </>
                            ) : (
                              <span className="badge badge-warning">{t('dashboard:staff.on_shift')}</span>
                            )}
                          </td>
                          <td className="font-mono text-xs text-text-muted">
                            {a.latitude.toFixed(4)}, {a.longitude.toFixed(4)}
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-text-muted">{t('common:common.no_data')}</td>
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
        {tab === 'staff' ? (
          <Pagination
            page={staffPage}
            totalPages={staffTotalPages}
            onPageChange={setStaffPage}
            total={staffTotal}
            currentItemsCount={staffList.length}
            itemLabel="nhân viên"
          />
        ) : (
          <Pagination
            page={attPage}
            totalPages={attTotalPages}
            onPageChange={setAttPage}
            total={attTotal}
            currentItemsCount={attendanceList.length}
            itemLabel="lượt chấm công"
          />
        )}
      </div>

      {/* View Staff Details Modal - Aligned exactly with map page style */}
      {selectedStaff && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up">
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Chi tiết nhân viên
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Tên nhân viên</label>
                <div className="font-bold text-slate-900 dark:text-white text-sm">
                  {selectedStaff.User?.fullName || t('dashboard:staff.not_updated')}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Địa chỉ Email</label>
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  {selectedStaff.User?.email || 'Chưa cung cấp'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Vị trí trực</label>
                  <div>
                    <span className="badge badge-info">{t(`dashboard:data.staff.POSITION_${selectedStaff.position.toUpperCase()}`, { defaultValue: selectedStaff.position })}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Ca làm việc</label>
                  <div>
                    <span className="badge badge-muted">{t(`dashboard:data.staff.SHIFT_${selectedStaff.shift.toUpperCase()}`, { defaultValue: selectedStaff.shift })}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái</label>
                  <div>
                    <span className={`badge ${selectedStaff.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                      {t(`dashboard:data.status.${selectedStaff.status}`, { defaultValue: selectedStaff.status })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Ngày nhận việc</label>
                  <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-text-muted" />
                    <span>{selectedStaff.hireDate ? formatDate(selectedStaff.hireDate) : '—'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Ghi chú công việc</label>
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300 leading-relaxed italic flex items-start gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
                  <span>{selectedStaff.notes || 'Không có ghi chú nào.'}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã nhân sự (Profile ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <span className="truncate pr-2">{selectedStaff.id}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedStaff.id);
                      toast.success("Đã sao chép mã hồ sơ nhân viên");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã tài khoản (User ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <span className="truncate pr-2">{selectedStaff.userId}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedStaff.userId);
                      toast.success("Đã sao chép mã tài khoản");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setSelectedStaff(null);
                  openEditModal(selectedStaff);
                }}
                className="px-3.5 py-1.5 bg-cyan/10 hover:bg-cyan/20 border border-cyan/20 text-cyan text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
              >
                <Edit className="w-3.5 h-3.5" /> Chỉnh sửa
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStaff(selectedStaff.id)}
                className="px-3.5 py-1.5 bg-danger/10 hover:bg-danger/25 border border-danger/20 text-danger text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa bỏ
              </button>
              <button
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {isAddModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <form 
            onSubmit={handleAddStaffSubmit}
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Thêm nhân viên mới
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã tài khoản người dùng (User UUID) <span className="text-danger">*</span></label>
                <input 
                  type="text"
                  required
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="ev-input w-full h-8 px-2.5 text-xs font-mono"
                  placeholder="Nhập UUID tài khoản người dùng..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Vị trí trực</label>
                  <CustomSelect
                    value={newPosition}
                    onChange={setNewPosition}
                    options={[
                      { value: 'operator', label: 'Vận hành viên' },
                      { value: 'technician', label: 'Kỹ thuật viên' },
                      { value: 'supervisor', label: 'Giám sát viên' },
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Ca làm việc</label>
                  <CustomSelect
                    value={newShift}
                    onChange={setNewShift}
                    options={[
                      { value: 'morning', label: 'Ca sáng (Morning)' },
                      { value: 'afternoon', label: 'Ca chiều' },
                      { value: 'night', label: 'Ca tối (Night)' },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạm sạc liên kết</label>
                <CustomSelect
                  value={newStationId}
                  onChange={setNewStationId}
                  options={[
                    { value: '', label: 'Tất cả trạm sạc' },
                    ...stations.map((st: any) => ({ value: st.id, label: st.name })),
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Ghi chú</label>
                <input 
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="ev-input w-full h-8 px-2.5 text-xs"
                  placeholder="Ghi chú về phân công, vị trí..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmittingAdd}
                className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all flex items-center gap-1.5"
                style={{ background: 'var(--grad-cyan-lime)' }}
              >
                {isSubmittingAdd && (
                  <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                )}
                Tạo mới
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Staff Modal */}
      {isEditModalOpen && editingStaff && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <form 
            onSubmit={handleEditStaffSubmit}
            className="w-full max-w-sm p-6 rounded-2xl relative border shadow-2xl space-y-4 bg-white dark:bg-slate-950 border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 animate-scale-up"
          >
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            <div className="corner-marker cm-bl" />
            <div className="corner-marker cm-br" />

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Cập nhật thông tin nhân viên
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingStaff(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Tên nhân viên</label>
                <div className="font-bold text-slate-900 dark:text-white text-sm bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-1.5">
                  {editingStaff.User?.fullName || 'Chưa cập nhật hồ sơ'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Vị trí trực</label>
                  <CustomSelect
                    value={editPosition}
                    onChange={setEditPosition}
                    options={[
                      { value: 'operator', label: 'Vận hành viên' },
                      { value: 'technician', label: 'Kỹ thuật viên' },
                      { value: 'supervisor', label: 'Giám sát viên' },
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Ca làm việc</label>
                  <CustomSelect
                    value={editShift}
                    onChange={setEditShift}
                    options={[
                      { value: 'morning', label: 'Ca sáng (Morning)' },
                      { value: 'afternoon', label: 'Ca chiều' },
                      { value: 'night', label: 'Ca tối (Night)' },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái hoạt động</label>
                <CustomSelect
                  value={editStatus}
                  onChange={setEditStatus}
                  options={[
                    { value: 'ACTIVE', label: 'Hoạt động (ACTIVE)' },
                    { value: 'INACTIVE', label: 'Không hoạt động (INACTIVE)' },
                  ]}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingStaff(null);
                }}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmittingEdit}
                className="px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan/20 rounded-xl transition-all flex items-center gap-1.5"
                style={{ background: 'var(--grad-cyan-lime)' }}
              >
                {isSubmittingEdit && (
                  <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                )}
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
