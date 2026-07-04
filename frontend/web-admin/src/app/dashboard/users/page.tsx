'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { motion } from 'framer-motion';
import { 
  Users, Eye, Copy, X, Calendar, ShieldAlert, 
  Search, CheckCircle2, AlertTriangle, DollarSign, RefreshCw,
  Lock, Unlock, Trash2, BadgeCheck, Loader2,
} from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatDate, tSafe, translateMessage } from '@/i18n/formatter';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { cn } from '@/core/utils/cn';
import GlassModal, { ModalHeader, ModalField, ModalValue } from '@/core/theme/GlassModal';

type UserCache = {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleName: string;
  status: string;
  emailVerified: boolean;
  hasOutstandingDebt: boolean;
  arrearsAmount: number;
  syncedAt: string;
  avatarUrl?: string | null;
};

type PagedUsers = { items: UserCache[]; total: number };

const LIMIT = 20;

export default function UsersPage() {
  const { user, isCheckingAuth } = useAuthStore();
  const { t } = useTranslation(['common', 'dashboard']);
  const isAdmin = user?.roles?.includes('admin');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debtFilter, setDebtFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<UserCache | null>(null);
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  // Action states
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isSettlingDebt, setIsSettlingDebt] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | 'lock' | 'unlock' | 'delete' | 'settle'>(null);

  // Fetch users with pagination and query params
  const { data: usersData, isLoading, refetch: refetchUsers } = useQuery<PagedUsers>({
    queryKey: ['users-list', page, search, debtFilter],
    queryFn: async () => {
      const res = await apiClient.get('/users', {
        params: {
          limit: LIMIT,
          offset: (page - 1) * LIMIT,
          search: search || undefined,
          debt: debtFilter !== 'all' ? debtFilter : undefined,
          role: 'user', // only get role 'user' (customers)
        }
      });
      if (Array.isArray(res.data)) {
        return { items: res.data, total: res.data.length };
      }
      return res.data ?? { items: [], total: 0 };
    },
    enabled: isAdmin,
  });

  const paginatedUsers = usersData?.items ?? [];
  const totalItems = usersData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / LIMIT));

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleRoleChange = async (newRole: string) => {
    if (!selectedUser) return;
    const oldRole = selectedUser.roleName;
    if (oldRole === newRole) return;
    
    const oldRoleLabel = t(`roles.${oldRole.toUpperCase()}`, { defaultValue: oldRole });
    const newRoleLabel = t(`roles.${newRole.toUpperCase()}`, { defaultValue: newRole });
    if (!window.confirm(t('dashboard:users.confirm_change_role', {
      name: selectedUser.fullName,
      oldRole: oldRoleLabel,
      newRole: newRoleLabel,
      defaultValue: `Bạn có chắc chắn muốn thay đổi vai trò của "${selectedUser.fullName}" từ "${oldRoleLabel}" sang "${newRoleLabel}"?`
    }))) {
      return;
    }

    setIsSubmittingRole(true);
    try {
      // 1. Assign the new role to the user
      await apiClient.post('/auth/roles/assign', {
        userId: selectedUser.userId,
        roleName: newRole,
      });

      // 2. Revoke the old role from the user
      await apiClient.post('/auth/roles/revoke', {
        userId: selectedUser.userId,
        roleName: oldRole,
      });

      toast.success(tSafe('dashboard:users.role_assign_success', 'Phân quyền người dùng thành công!'));
      refetchUsers();
      setSelectedUser(prev => prev ? { ...prev, roleName: newRole } : null);
    } catch (err: any) {
      toast.error(translateMessage(err?.response?.data?.message, 'dashboard:users.role_assign_error'));
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(tSafe('common:common.copied_user_id', 'Đã sao chép User ID'));
  };

  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    const newStatus = selectedUser.status === 'active' ? 'suspended' : 'active';
    setIsTogglingStatus(true);
    setConfirmAction(null);
    try {
      await apiClient.patch(`/users/${selectedUser.userId}/status`, { status: newStatus });
      toast.success(newStatus === 'suspended' ? 'Đã khóa tài khoản thành công!' : 'Đã mở khóa tài khoản thành công!');
      refetchUsers();
      setSelectedUser(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (err: any) {
      toast.error(translateMessage(err?.response?.data?.message, 'Thao tác thất bại'));
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    setIsDeletingUser(true);
    setConfirmAction(null);
    try {
      await apiClient.delete(`/users/${selectedUser.userId}`);
      toast.success('Đã xóa tài khoản người dùng thành công!');
      refetchUsers();
      setSelectedUser(null);
    } catch (err: any) {
      toast.error(translateMessage(err?.response?.data?.message, 'Xóa tài khoản thất bại'));
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleSettleArrears = async () => {
    if (!selectedUser) return;
    setIsSettlingDebt(true);
    setConfirmAction(null);
    try {
      const res = await apiClient.get('/billing/arrears', {
        params: { userId: selectedUser.userId, status: 'ACTIVE', limit: 50 },
      });
      const arrears: any[] = res.data?.items ?? res.data ?? [];
      if (arrears.length === 0) {
        toast.info('Không tìm thấy công nợ đang hoạt động');
        return;
      }
      await Promise.all(arrears.map((a: any) => apiClient.post(`/billing/arrears/${a.id}/clear`)));
      toast.success(`Đã tất toán ${arrears.length} khoản công nợ thành công!`);
      refetchUsers();
      setSelectedUser(prev => prev ? { ...prev, hasOutstandingDebt: false, arrearsAmount: 0 } : null);
    } catch (err: any) {
      toast.error(translateMessage(err?.response?.data?.message, 'Tất toán nợ xấu thất bại'));
    } finally {
      setIsSettlingDebt(false);
    }
  };

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
          Bạn không có quyền truy cập trang này. Vui lòng liên hệ quản trị viên cấp cao.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">Quản lý Khách hàng</h1>
          <p className="text-text-muted text-sm mt-1">
            Quản lý thông tin tài khoản khách hàng, phân quyền và kiểm soát nợ xấu của hệ thống.
          </p>
        </div>
        
        {/* Filters and Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Tìm tên, email, sđt..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="ev-input h-9 text-xs w-56 pl-9 pr-3"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted whitespace-nowrap">Nợ xấu:</span>
            <CustomSelect
              value={debtFilter}
              onChange={(v) => { setDebtFilter(v); setPage(1); }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'debt', label: 'Có nợ xấu' },
                { value: 'nodebt', label: 'Không có nợ' },
              ]}
            />
          </div>

          <button
            onClick={() => { refetchUsers(); toast.success(tSafe('common:common.data_refreshed', 'Đã làm mới dữ liệu')); }}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-text-muted hover:text-text-main transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left Column: User Table List */}
        <div className={cn(
          "glass flex flex-col overflow-hidden min-h-0 transition-all duration-300",
          selectedUser ? "lg:col-span-1" : "lg:col-span-3 w-full"
        )}>
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="font-semibold text-text-main text-sm">Danh sách khách hàng</p>
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="overflow-x-auto">
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th className="text-left">Khách hàng</th>
                      <th className="text-center">Số điện thoại</th>
                      <th className="text-center">Trạng thái</th>
                      <th className="text-center">Nợ xấu</th>
                      <th className="text-right pr-6">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    ) : paginatedUsers.length ? (
                      paginatedUsers.map((u) => (
                        <motion.tr
                          key={u.userId}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() => setSelectedUser(u)}
                          className={`cursor-pointer transition-colors ${selectedUser?.userId === u.userId ? 'bg-cyan/5 border-l-2 border-cyan' : 'hover:bg-white/[0.02]'}`}
                        >
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan to-lime flex items-center justify-center text-white font-bold text-sm shrink-0">
                                {u.fullName?.trim().split(' ').pop()?.slice(0, 1).toUpperCase() || 'KH'}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-text-main truncate">{u.fullName}</p>
                                <p className="text-xs text-text-muted mt-0.5 truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="text-center">
                            <span className="text-sm font-mono text-text-muted">{u.phone || '—'}</span>
                          </td>
                          <td className="text-center">
                            <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                              {u.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}
                            </span>
                          </td>
                          <td className="text-center">
                            {u.hasOutstandingDebt ? (
                              <span className="badge badge-danger" title="Nhấn để xem chi tiết nợ">
                                {Number(u.arrearsAmount).toLocaleString('vi-VN')} đ
                              </span>
                            ) : (
                              <span className="text-xs text-text-muted/50">—</span>
                            )}
                          </td>
                          <td className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedUser(u)}
                              className="p-1.5 text-cyan hover:bg-cyan/10 rounded-lg transition-colors"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-text-muted text-sm">
                          Không tìm thấy khách hàng nào phù hợp.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
          </div>

        </div>

        {/* Right Column: User detail view */}
        {selectedUser && (() => {
          return (
            <div className="lg:col-span-2 glass p-5 flex flex-col min-h-0 overflow-y-auto animate-fade-in gap-4 relative">
              {/* Header with Close */}
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan" />
                  <h3 className="font-bold text-xs uppercase tracking-wider text-text-main">Hồ sơ khách hàng</h3>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-main transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Profile card summary */}
              <div className="flex items-center gap-3.5 p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl">
                {selectedUser.avatarUrl ? (
                  <img
                    src={selectedUser.avatarUrl}
                    alt={selectedUser.fullName}
                    className="w-10 h-10 rounded-xl object-cover shrink-0"
                    onError={(e) => {
                      const t = e.currentTarget.parentElement;
                      if (t) {
                        e.currentTarget.style.display = 'none';
                        const fb = t.querySelector('.avatar-fallback-lg') as HTMLElement;
                        if (fb) fb.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div
                  className="avatar-fallback-lg w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0"
                  style={{ background: 'var(--brand-gradient)', display: selectedUser.avatarUrl ? 'none' : 'flex' }}
                >
                  {selectedUser.fullName?.split(' ').pop()?.slice(0, 1).toUpperCase() || 'KH'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-text-main text-sm truncate">{selectedUser.fullName}</p>
                  <p className="text-xs text-text-muted truncate">{selectedUser.email}</p>
                </div>
              </div>

              {/* User ID copy row */}
              <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex items-center justify-between text-xs">
                <span className="text-text-faded font-medium">User UUID:</span>
                <div className="flex items-center gap-1.5 font-mono text-text-main">
                  <span>{selectedUser.userId}</span>
                  <button
                    onClick={() => copyToClipboard(selectedUser.userId)}
                    className="p-1 hover:bg-white/5 rounded text-text-muted hover:text-cyan transition-colors"
                    title="Sao chép"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-faded font-medium uppercase tracking-wider">Trạng thái tài khoản</span>
                  <div>
                    <span className={`badge ${selectedUser.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {selectedUser.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-faded font-medium uppercase tracking-wider">Số điện thoại</span>
                  <p className="font-semibold text-text-main mt-0.5">{selectedUser.phone || 'Chưa cập nhật'}</p>
                </div>
                <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-faded font-medium uppercase tracking-wider">Xác thực Email</span>
                  <p className="font-semibold text-text-main flex items-center gap-1 mt-0.5">
                    {selectedUser.emailVerified ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-success" />
                        <span className="text-success text-xs font-semibold">Đã xác minh</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-warning" />
                        <span className="text-warning text-xs font-semibold">Chưa xác minh</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex flex-col gap-1.5">
                  <span className="text-[10px] text-text-faded font-medium uppercase tracking-wider">Lần cuối đồng bộ</span>
                  <p className="font-semibold text-text-main flex items-center gap-1.5 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-text-muted" />
                    {formatDate(selectedUser.syncedAt)}
                  </p>
                </div>
              </div>

              {/* Debt block (banner) */}
              <div className="text-xs mt-1">
                <label className="text-[10px] text-text-faded font-medium uppercase tracking-wider">Kiểm soát nợ xấu (Arrears Guard)</label>
                {selectedUser.hasOutstandingDebt ? (
                  <div className="mt-1.5 flex items-start gap-2.5 p-3.5 bg-danger/10 border border-danger/25 text-danger rounded-xl">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
                    <div>
                      <p className="font-bold text-xs">Phát hiện nợ xấu</p>
                      <p className="text-[11px] text-danger/80 mt-0.5">
                        Tài khoản hiện đang nợ hệ thống số tiền <span className="font-bold">{Number(selectedUser.arrearsAmount).toLocaleString('vi-VN')} VND</span>. Quyền đặt lịch sạc (Bookings) đã bị hệ thống tự động khóa cho tới khi tất toán.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-start gap-2.5 p-3.5 bg-success/10 border border-success/25 text-success rounded-xl">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-success" />
                    <div>
                      <p className="font-bold text-xs">Lịch sử thanh toán tốt</p>
                      <p className="text-[11px] text-success/80 mt-0.5">
                        Không phát hiện công nợ xấu. Khách hàng được cấp đầy đủ các quyền sử dụng dịch vụ trên nền tảng.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Role assign dropdown action */}
              <div className="border-t border-white/5 pt-4 mt-2">
                <label className="text-[10px] text-text-faded font-medium uppercase tracking-wider">Phân quyền tài khoản</label>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1">
                    <CustomSelect
                      value={selectedUser.roleName}
                      onChange={handleRoleChange}
                      options={[
                        { value: 'user', label: 'Khách hàng (User)' },
                        { value: 'staff', label: 'Nhân viên trạm (Staff)' },
                        { value: 'admin', label: 'Quản trị viên (Admin)' },
                      ]}
                    />
                  </div>
                  {isSubmittingRole && (
                    <div className="w-4 h-4 rounded-full border border-cyan border-t-transparent animate-spin shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-text-muted mt-1">
                  Đổi vai trò sẽ tự động gán quyền mới và gỡ bỏ quyền cũ tương ứng trên toàn hệ thống thông qua IAM service.
                </p>
              </div>

              {/* Admin action buttons */}
              <div className="border-t border-white/5 pt-4 mt-2 flex flex-col gap-2">
                <label className="text-[10px] text-text-faded font-medium uppercase tracking-wider">Hành động quản trị</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {/* Lock / Unlock */}
                  {selectedUser.status === 'active' ? (
                    <button
                      onClick={() => setConfirmAction('lock')}
                      disabled={isTogglingStatus}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-warning/10 border border-warning/20 text-warning hover:bg-warning/20 disabled:opacity-50"
                    >
                      {isTogglingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                      Khóa tài khoản
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmAction('unlock')}
                      disabled={isTogglingStatus}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-success/10 border border-success/20 text-success hover:bg-success/20 disabled:opacity-50"
                    >
                      {isTogglingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                      Mở khóa
                    </button>
                  )}

                  {/* Settle Arrears */}
                  {selectedUser.hasOutstandingDebt && (
                    <button
                      onClick={() => setConfirmAction('settle')}
                      disabled={isSettlingDebt}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-cyan/10 border border-cyan/20 text-cyan hover:bg-cyan/20 disabled:opacity-50"
                    >
                      {isSettlingDebt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                      Tất toán nợ
                    </button>
                  )}

                  {/* Delete Account */}
                  <button
                    onClick={() => setConfirmAction('delete')}
                    disabled={isDeletingUser}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 disabled:opacity-50"
                  >
                    {isDeletingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Xóa tài khoản
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Standalone Pagination */}
      <div className="glass px-4 shrink-0">
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          total={totalItems}
          currentItemsCount={paginatedUsers.length}
          itemLabel="tài khoản"
        />
      </div>

      {/* Confirm Action Modal */}
      <GlassModal open={confirmAction !== null} onClose={() => setConfirmAction(null)} className="max-w-sm">
        {confirmAction && selectedUser && (
          <>
            <ModalHeader onClose={() => setConfirmAction(null)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                confirmAction === 'delete' ? 'bg-danger/15 border border-danger/25' :
                confirmAction === 'lock'   ? 'bg-warning/15 border border-warning/25' :
                confirmAction === 'settle' ? 'bg-cyan/15 border border-cyan/25' :
                                             'bg-success/15 border border-success/25'
              }`}>
                {confirmAction === 'delete' ? <Trash2 className="w-4 h-4 text-danger" /> :
                 confirmAction === 'lock'   ? <Lock className="w-4 h-4 text-warning" /> :
                 confirmAction === 'settle' ? <BadgeCheck className="w-4 h-4 text-cyan" /> :
                                              <Unlock className="w-4 h-4 text-success" />}
              </div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-text-main">
                {confirmAction === 'delete' ? 'Xác nhận xóa tài khoản' :
                 confirmAction === 'lock'   ? 'Xác nhận khóa tài khoản' :
                 confirmAction === 'settle' ? 'Xác nhận tất toán công nợ' :
                                              'Xác nhận mở khóa tài khoản'}
              </h3>
            </ModalHeader>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                <p className="text-text-faded mb-0.5">Tài khoản</p>
                <p className="font-semibold text-text-main">{selectedUser.fullName}</p>
                <p className="text-text-muted">{selectedUser.email}</p>
              </div>

              <p className="text-text-muted leading-relaxed">
                {confirmAction === 'delete' && 'Hành động này sẽ xóa vĩnh viễn tài khoản. Dữ liệu lịch sử sẽ được giữ lại nhưng tài khoản sẽ không thể đăng nhập.'}
                {confirmAction === 'lock'   && 'Tài khoản sẽ bị khóa ngay lập tức. Người dùng sẽ không thể đăng nhập hoặc sử dụng dịch vụ cho đến khi được mở khóa.'}
                {confirmAction === 'unlock' && 'Tài khoản sẽ được kích hoạt lại. Người dùng có thể đăng nhập và sử dụng dịch vụ bình thường.'}
                {confirmAction === 'settle' && `Hệ thống sẽ tự động tất toán tất cả công nợ đang hoạt động (${Number(selectedUser.arrearsAmount).toLocaleString('vi-VN')} VND). Quyền đặt lịch sẽ được khôi phục.`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', border: '1px solid var(--card-border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                Hủy bỏ
              </button>
              <button
                onClick={
                  confirmAction === 'lock' || confirmAction === 'unlock' ? handleToggleStatus :
                  confirmAction === 'delete' ? handleDeleteUser :
                  handleSettleArrears
                }
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 ${
                  confirmAction === 'delete' ? 'bg-danger/15 border border-danger/25 text-danger hover:bg-danger/25' :
                  confirmAction === 'lock'   ? 'bg-warning/15 border border-warning/25 text-warning hover:bg-warning/25' :
                  confirmAction === 'settle' ? 'bg-cyan/15 border border-cyan/25 text-cyan hover:bg-cyan/25' :
                                               'bg-success/15 border border-success/25 text-success hover:bg-success/25'
                }`}
              >
                {confirmAction === 'delete' ? <Trash2 className="w-3.5 h-3.5" /> :
                 confirmAction === 'lock'   ? <Lock className="w-3.5 h-3.5" /> :
                 confirmAction === 'settle' ? <BadgeCheck className="w-3.5 h-3.5" /> :
                                              <Unlock className="w-3.5 h-3.5" />}
                {confirmAction === 'delete' ? 'Xác nhận xóa' :
                 confirmAction === 'lock'   ? 'Xác nhận khóa' :
                 confirmAction === 'settle' ? 'Xác nhận tất toán' :
                                              'Xác nhận mở khóa'}
              </button>
            </div>
          </>
        )}
      </GlassModal>
    </div>
  );
}
