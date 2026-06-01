'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { formatCurrency, formatDate, relativeTimeLocale } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { CreditCard, AlertTriangle, ShieldCheck, Filter, Eye, Copy, X, RotateCcw, ShieldCheck as ClearIcon, ShieldAlert } from 'lucide-react';
import Pagination from '@/core/components/ui/Pagination';
import CustomSelect from '@/core/components/ui/CustomSelect';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { mapApiError } from '@/i18n/error-mapping';
import { useAuthStore } from '@/features/auth/store/auth.store';

type Transaction = {
  id: string; walletId: string; type: string; amount: number;
  currency: string; status: string; referenceId: string; createdAt: string;
};

type Arrears = {
  id: string; userId: string; sessionId?: string; transactionId?: string; amount?: number;
  totalAmount?: number; status: string; createdAt: string;
};

type PagedTransactions = { items: Transaction[]; total: number };
type PagedArrears = { items: Arrears[]; total: number } | Arrears[];

const TX_LIMIT = 15;
const ARR_LIMIT = 15;

function normalizeArrears(data: PagedArrears | undefined): { items: Arrears[]; total: number } {
  if (!data) return { items: [], total: 0 };
  if (Array.isArray(data)) return { items: data, total: data.length };
  return data;
}

export default function BillingPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user, isCheckingAuth } = useAuthStore();
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

  const [tab, setTab] = useState<'transactions' | 'arrears'>('transactions');

  // Transactions state
  const [txPage, setTxPage] = useState(1);
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);

  // Arrears state
  const [arrPage, setArrPage] = useState(1);
  const [arrStatusFilter, setArrStatusFilter] = useState('ACTIVE');
  const [selectedArrear, setSelectedArrear] = useState<Arrears | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const { data: txData, isLoading: loadingTx, refetch: refetchTx } = useQuery<PagedTransactions>({
    queryKey: ['transactions', txPage, txTypeFilter],
    queryFn: async () => {
      const offset = (txPage - 1) * TX_LIMIT;
      const params: Record<string, any> = { limit: TX_LIMIT, offset };
      if (txTypeFilter) params.type = txTypeFilter;
      const res = await apiClient.get('/transactions', { params });
      if (Array.isArray(res.data)) return { items: res.data, total: res.data.length };
      return res.data;
    },
  });

  const { data: arrearsRaw, isLoading: loadingArrears, refetch: refetchArrears } = useQuery<PagedArrears>({
    queryKey: ['arrears', arrPage, arrStatusFilter],
    queryFn: async () => {
      const offset = (arrPage - 1) * ARR_LIMIT;
      const params: Record<string, any> = { limit: ARR_LIMIT, offset };
      if (arrStatusFilter) params.status = arrStatusFilter;
      return (await apiClient.get('/billing/arrears', { params })).data;
    },
  });

  const txItems = txData?.items ?? [];
  const txTotal = txData?.total ?? 0;
  const txTotalPages = Math.max(1, Math.ceil(txTotal / TX_LIMIT));

  const { items: arrItems, total: arrTotal } = normalizeArrears(arrearsRaw);
  const arrTotalPages = Math.max(1, Math.ceil(arrTotal / ARR_LIMIT));

  const totalArrears = arrItems.reduce((acc, curr) => acc + Number(curr.totalAmount ?? curr.amount ?? 0), 0);

  const handleClearArrears = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn tất toán thủ công khoản nợ này không?')) return;
    setIsClearing(true);
    try {
      await apiClient.post(`/billing/arrears/${id}/clear`, { note: 'Admin cleared manually' });
      toast.success(t('common:api_errors.CLEAR_ARREARS_SUCCESS', { defaultValue: 'Tất toán nợ thành công' }));
      setSelectedArrear(null);
      refetchArrears();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { code?: string; message?: string } } }).response;
      toast.error(res?.data?.message || t('common:api_errors.CLEAR_ARREARS_FAILED', { defaultValue: 'Tất toán nợ thất bại' }));
    } finally {
      setIsClearing(false);
    }
  };

  const handleRefundTransaction = async (txId: string) => {
    const reason = window.prompt('Nhập lý do hoàn tiền giao dịch này:');
    if (reason === null) return; // cancelled
    if (!reason.trim()) {
      toast.error('Lý do hoàn tiền không được để trống');
      return;
    }

    setIsRefunding(true);
    try {
      await apiClient.post(`/payments/${txId}/refund`, { reason: reason.trim() });
      toast.success('Đã gửi yêu cầu hoàn tiền thành công');
      setSelectedTransaction(null);
      refetchTx();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Hoàn tiền giao dịch thất bại');
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--page-inset))] animate-fade-in gap-4">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-h2 font-bold text-text-main">{t('dashboard:billing.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:billing.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
            <button
              onClick={() => setTab('transactions')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                tab === 'transactions' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" /> {t('dashboard:billing.tab_transactions')}
            </button>
            <button
              onClick={() => setTab('arrears')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-180 flex items-center gap-1.5 ${
                tab === 'arrears' ? 'bg-warning/20 text-warning border border-warning/25' : 'text-text-muted hover:text-text-main'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> {t('dashboard:billing.tab_arrears')}
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <Filter className="w-3.5 h-3.5" /><span>Lọc:</span>
          </div>
          {tab === 'transactions' ? (
            <CustomSelect
              value={txTypeFilter}
              onChange={val => { setTxTypeFilter(val); setTxPage(1); }}
              options={[
                { value: '', label: 'Tất cả loại GD' },
                { value: 'TOPUP', label: 'Nạp tiền' },
                { value: 'PAYMENT', label: 'Thanh toán' },
                { value: 'REFUND', label: 'Hoàn tiền' },
              ]}
              className="w-44 h-9"
            />
          ) : (
            <CustomSelect
              value={arrStatusFilter}
              onChange={val => { setArrStatusFilter(val); setArrPage(1); }}
              options={[
                { value: '', label: 'Tất cả' },
                { value: 'ACTIVE', label: 'Đang nợ' },
                { value: 'CLEARED', label: 'Đã thanh toán' },
              ]}
              className="w-44 h-9"
            />
          )}

          {/* Arrears Stats */}
          <div className="flex items-center gap-2 px-3.5 h-9 rounded-xl bg-danger/10 border border-danger/20 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-danger" />
            <span className="text-danger text-xs font-bold">{formatCurrency(totalArrears)}</span>
          </div>
        </div>
      </div>

      {/* TRANSACTIONS TAB */}
      {tab === 'transactions' && (
        <div className="flex flex-col min-h-0 flex-1 gap-4">
          <div className="glass flex flex-col overflow-hidden min-h-0 flex-1">
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="font-semibold text-text-main text-sm">{t('dashboard:billing.table_title_tx', { defaultValue: 'Danh sách lịch sử giao dịch' })}</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard:billing.table_tx.ref')}</th>
                      <th>{t('dashboard:billing.table_tx.type')}</th>
                      <th>{t('dashboard:billing.table_tx.amount')}</th>
                      <th>{t('dashboard:billing.table_tx.status')}</th>
                      <th>{t('dashboard:billing.table_tx.time')}</th>
                      <th className="text-right pr-6">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingTx ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                          <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                        ))}</tr>
                      ))
                    ) : txItems.map((tx) => (
                      <motion.tr 
                        key={tx.id} 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }}
                        onClick={() => setSelectedTransaction(tx)}
                        className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="font-mono text-xs text-text-main">{tx.referenceId || tx.id.slice(0, 8)}</td>
                        <td>
                          <span className={`badge ${
                            tx.type === 'TOPUP' ? 'badge-success' :
                            tx.type === 'REFUND' ? 'badge-info' : 'badge-warning'
                          }`}>
                            {t(`dashboard:data.type.${tx.type}`)}
                          </span>
                        </td>
                        <td className={tx.type === 'TOPUP' ? 'text-lime' : 'text-text-main'}>
                          {tx.type === 'TOPUP' ? '+' : ''}{formatCurrency(tx.amount)}
                        </td>
                        <td>
                          <span className={`badge ${
                            tx.status === 'SUCCESS' || tx.status === 'completed' ? 'badge-success' :
                            tx.status === 'PENDING' || tx.status === 'pending' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {t(`dashboard:data.status.${tx.status}`)}
                          </span>
                        </td>
                        <td className="text-xs text-text-muted">{new Date(tx.createdAt).toLocaleString('vi-VN')}</td>
                        <td className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end items-center gap-2">
                            <button 
                              onClick={() => setSelectedTransaction(tx)}
                              className="p-1 text-cyan hover:text-cyan/85 transition-colors"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {isAdmin && tx.type === 'PAYMENT' && (tx.status === 'SUCCESS' || tx.status === 'completed') && (
                              <button
                                onClick={() => handleRefundTransaction(tx.id)}
                                className="p-1 text-danger hover:text-danger/80 transition-colors"
                                title="Hoàn tiền"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                    {!txItems.length && !loadingTx && (
                      <tr><td colSpan={6} className="text-center py-8 text-text-muted">{t('dashboard:billing.no_transactions')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Standalone Pagination */}
          <div className="glass px-4 shrink-0">
            <Pagination
              page={txPage}
              totalPages={txTotalPages}
              onPageChange={setTxPage}
              total={txTotal}
              currentItemsCount={txItems.length}
              itemLabel="giao dịch"
            />
          </div>
        </div>
      )}

      {/* ARREARS TAB */}
      {tab === 'arrears' && (
        <div className="flex flex-col min-h-0 flex-1 gap-4">
          <div className="glass flex flex-col overflow-hidden min-h-0 flex-1">
            <div className="px-5 py-4 border-b border-white/5 shrink-0">
              <p className="font-semibold text-text-main text-sm">{t('dashboard:billing.table_title_arrears', { defaultValue: 'Danh sách các khoản nợ đọng' })}</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard:billing.table_arrears.user_id')}</th>
                      <th>{t('dashboard:billing.table_arrears.session_id')}</th>
                      <th>{t('dashboard:billing.table_arrears.amount')}</th>
                      <th>{t('dashboard:billing.table_arrears.status')}</th>
                      <th>{t('dashboard:billing.table_arrears.time')}</th>
                      <th className="text-right pr-6">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingArrears ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                          <td key={j}><div className="h-4 bg-white/5 rounded animate-pulse" /></td>
                        ))}</tr>
                      ))
                    ) : arrItems.map((a) => (
                      <motion.tr 
                        key={a.id} 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }}
                        onClick={() => setSelectedArrear(a)}
                        className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="font-mono text-xs text-text-main">{a.userId.slice(0,8)}…</td>
                        <td className="font-mono text-xs">{(a.sessionId ?? a.transactionId ?? '').slice(0,8)}…</td>
                        <td className="text-danger font-semibold">{formatCurrency(a.totalAmount ?? a.amount ?? 0)}</td>
                        <td><span className="badge badge-danger">{t(`dashboard:data.status.${a.status}`)}</span></td>
                        <td className="text-xs text-text-muted">{relativeTimeLocale(a.createdAt)}</td>
                        <td className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end items-center gap-2">
                            <button 
                              onClick={() => setSelectedArrear(a)}
                              className="p-1 text-cyan hover:text-cyan/85 transition-colors"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {isAdmin && a.status === 'PENDING' && (
                              <button
                                onClick={() => handleClearArrears(a.id)}
                                className="p-1 text-success hover:text-success/80 transition-colors"
                                title="Tất toán nợ"
                              >
                                <ClearIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                    {!arrItems.length && !loadingArrears && (
                      <tr><td colSpan={6} className="text-center py-8 text-success font-medium">{t('dashboard:billing.no_arrears')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Standalone Pagination */}
          <div className="glass px-4 shrink-0">
            <Pagination
              page={arrPage}
              totalPages={arrTotalPages}
              onPageChange={setArrPage}
              total={arrTotal}
              currentItemsCount={arrItems.length}
              itemLabel="khoản nợ"
            />
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTransaction && (
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
                <CreditCard className="w-4 h-4 text-cyan" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Chi tiết giao dịch
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã giao dịch (ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <span className="truncate pr-2">{selectedTransaction.id}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedTransaction.id);
                      toast.success("Đã sao chép mã giao dịch");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {selectedTransaction.referenceId && (
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã tham chiếu (Reference ID)</label>
                  <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                    <span className="truncate pr-2">{selectedTransaction.referenceId}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedTransaction.referenceId);
                        toast.success("Đã sao chép mã tham chiếu");
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
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Loại giao dịch</label>
                  <div>
                    <span className={`badge ${
                      selectedTransaction.type === 'TOPUP' ? 'badge-success' :
                      selectedTransaction.type === 'REFUND' ? 'badge-info' : 'badge-warning'
                    }`}>
                      {t(`dashboard:data.type.${selectedTransaction.type}`)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Số tiền</label>
                  <div className={`font-bold text-sm ${selectedTransaction.type === 'TOPUP' ? 'text-lime' : 'text-slate-900 dark:text-white'}`}>
                    {selectedTransaction.type === 'TOPUP' ? '+' : ''}{formatCurrency(selectedTransaction.amount)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái</label>
                  <div>
                    <span className={`badge ${
                      selectedTransaction.status === 'SUCCESS' || selectedTransaction.status === 'completed' ? 'badge-success' :
                      selectedTransaction.status === 'PENDING' || selectedTransaction.status === 'pending' ? 'badge-warning' : 'badge-danger'
                    }`}>
                      {t(`dashboard:data.status.${selectedTransaction.status}`)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Tiền tệ</label>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {selectedTransaction.currency || 'VND'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã ví liên kết (Wallet ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <span className="truncate pr-2">{selectedTransaction.walletId}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedTransaction.walletId);
                      toast.success("Đã sao chép mã ví");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Thời gian tạo</label>
                <div className="font-semibold text-slate-900 dark:text-white text-xs">
                  {formatDate(selectedTransaction.createdAt)}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {isAdmin && selectedTransaction.type === 'PAYMENT' && (selectedTransaction.status === 'SUCCESS' || selectedTransaction.status === 'completed') && (
                <button
                  type="button"
                  disabled={isRefunding}
                  onClick={() => handleRefundTransaction(selectedTransaction.id)}
                  className="px-3.5 py-1.5 bg-danger/10 hover:bg-danger/25 border border-danger/20 text-danger text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Hoàn tiền
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-white text-xs font-semibold transition-colors rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arrear Details Modal */}
      {selectedArrear && (
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
                <AlertTriangle className="w-4 h-4 text-warning" />
                <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
                  Chi tiết khoản nợ
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedArrear(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã hóa đơn nợ (ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white truncate">
                  <span className="truncate pr-2">{selectedArrear.id}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedArrear.id);
                      toast.success("Đã sao chép mã nợ");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã người dùng (User ID)</label>
                <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white truncate">
                  <span className="truncate pr-2">{selectedArrear.userId}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(selectedArrear.userId);
                      toast.success("Đã sao chép mã người dùng");
                    }}
                    className="text-cyan hover:text-cyan/85 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(selectedArrear.sessionId || selectedArrear.transactionId) && (
                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Mã phiên sạc / giao dịch liên quan</label>
                  <div className="flex items-center justify-between font-mono text-[11px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl px-3 py-2 text-slate-900 dark:text-white truncate">
                    <span className="truncate pr-2">{selectedArrear.sessionId ?? selectedArrear.transactionId}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(selectedArrear.sessionId ?? selectedArrear.transactionId ?? '');
                        toast.success("Đã sao chép mã liên quan");
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
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Số tiền nợ</label>
                  <div className="font-bold text-danger text-sm">
                    {formatCurrency(selectedArrear.totalAmount ?? selectedArrear.amount ?? 0)}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-slate-500 dark:text-slate-400 font-semibold">Trạng thái</label>
                  <div>
                    <span className="badge badge-danger">
                      {t(`dashboard:data.status.${selectedArrear.status}`)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-500 dark:text-slate-400 font-semibold">Thời gian tạo</label>
                <div className="font-semibold text-slate-900 dark:text-white text-xs">
                  {formatDate(selectedArrear.createdAt)}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {isAdmin && selectedArrear.status === 'PENDING' && (
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={() => handleClearArrears(selectedArrear.id)}
                  className="px-3.5 py-1.5 bg-success/10 hover:bg-success/25 border border-success/20 text-success text-xs font-semibold transition-colors rounded-xl flex items-center gap-1"
                >
                  <ClearIcon className="w-3.5 h-3.5" /> Tất toán nợ
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedArrear(null)}
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
