'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/api-client';
import { formatCurrency, relativeTimeLocale } from '@/i18n/formatter';
import { motion } from 'framer-motion';
import { CreditCard, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { mapApiError } from '@/i18n/error-mapping';

type Transaction = {
  id: string; walletId: string; type: string; amount: number;
  currency: string; status: string; referenceId: string; createdAt: string;
};

type Arrears = {
  id: string; userId: string; sessionId: string; amount: number;
  status: string; createdAt: string;
};

export default function BillingPage() {
  const [tab, setTab] = useState<'transactions' | 'arrears'>('transactions');
  const { t } = useTranslation(['dashboard', 'common']);

  const { data: transactions, isLoading: loadingTx } = useQuery<Transaction[]>({
    queryKey: ['transactions'],
    queryFn: async () => (await apiClient.get('/transactions', { params: { limit: 50 } })).data,
  });

  const { data: arrears, isLoading: loadingArrears, refetch: refetchArrears } = useQuery<Arrears[]>({
    queryKey: ['arrears'],
    queryFn: async () => (await apiClient.get('/billing/arrears', { params: { status: 'ACTIVE' } })).data,
  });

  const handleClearArrears = async (id: string) => {
    try {
      await apiClient.post(`/billing/arrears/${id}/clear`, { note: 'Admin cleared manually' });
      toast.success(t('common:api_errors.CLEAR_ARREARS_SUCCESS'));
      refetchArrears();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { code?: string } } }).response;
      toast.error(mapApiError(res?.data?.code, t('common:api_errors.CLEAR_ARREARS_FAILED')));
    }
  };

  const totalArrears = arrears?.reduce((acc, curr) => acc + curr.amount, 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h2 font-bold text-white">{t('dashboard:billing.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('dashboard:billing.subtitle')}</p>
        </div>
        <div className="flex gap-4">
          <div className="glass px-4 py-2 flex items-center gap-3 border-danger/30">
            <div className="w-8 h-8 rounded-full bg-danger/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-danger" />
            </div>
            <div>
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
                {t('dashboard:billing.total_arrears')}
              </p>
              <p className="text-danger font-bold">{formatCurrency(totalArrears)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        <button
          onClick={() => setTab('transactions')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 flex items-center gap-2 ${
            tab === 'transactions' ? 'bg-cyan/20 text-cyan border border-cyan/25' : 'text-text-muted hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" /> {t('dashboard:billing.tab_transactions')}
        </button>
        <button
          onClick={() => setTab('arrears')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-180 flex items-center gap-2 ${
            tab === 'arrears' ? 'bg-warning/20 text-warning border border-warning/25' : 'text-text-muted hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> {t('dashboard:billing.tab_arrears')}
        </button>
      </div>

      <div className="glass overflow-hidden">
        {tab === 'transactions' ? (
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:billing.table_tx.ref')}</th>
                  <th>{t('dashboard:billing.table_tx.type')}</th>
                  <th>{t('dashboard:billing.table_tx.amount')}</th>
                  <th>{t('dashboard:billing.table_tx.status')}</th>
                  <th>{t('dashboard:billing.table_tx.time')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingTx ? (
                   <tr><td colSpan={5} className="text-center py-8 text-text-muted">{t('common:common.loading')}</td></tr>
                ) : transactions?.map((tx) => (
                  <motion.tr key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td className="font-mono text-xs text-white">{tx.referenceId || tx.id.slice(0, 8)}</td>
                    <td>
                      <span className={`badge ${
                        tx.type === 'TOPUP' ? 'badge-success' : 
                        tx.type === 'REFUND' ? 'badge-info' : 'badge-warning'
                      }`}>
                        {t(`dashboard:data.type.${tx.type}`)}
                      </span>
                    </td>
                    <td className={tx.type === 'TOPUP' ? 'text-lime' : 'text-white'}>
                      {tx.type === 'TOPUP' ? '+' : ''}{formatCurrency(tx.amount)}
                    </td>
                    <td>
                      <span className={`badge ${
                        tx.status === 'SUCCESS' ? 'badge-success' :
                        tx.status === 'PENDING' ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {t(`dashboard:data.status.${tx.status}`)}
                      </span>
                    </td>
                    <td className="text-xs text-text-muted">{new Date(tx.createdAt).toLocaleString()}</td>
                  </motion.tr>
                ))}
                {!transactions?.length && !loadingTx && (
                  <tr><td colSpan={5} className="text-center py-8 text-text-muted">{t('dashboard:billing.no_transactions')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>{t('dashboard:billing.table_arrears.user_id')}</th>
                  <th>{t('dashboard:billing.table_arrears.session_id')}</th>
                  <th>{t('dashboard:billing.table_arrears.amount')}</th>
                  <th>{t('dashboard:billing.table_arrears.status')}</th>
                  <th>{t('dashboard:billing.table_arrears.time')}</th>
                  <th>{t('dashboard:billing.table_arrears.action')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingArrears ? (
                   <tr><td colSpan={6} className="text-center py-8 text-text-muted">{t('common:common.loading')}</td></tr>
                ) : arrears?.map((a) => (
                  <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <td className="font-mono text-xs text-white">{a.userId.slice(0,8)}…</td>
                    <td className="font-mono text-xs">{a.sessionId.slice(0,8)}…</td>
                    <td className="text-danger font-semibold">{formatCurrency(a.amount)}</td>
                    <td><span className="badge badge-danger">{t(`dashboard:data.status.${a.status}`)}</span></td>
                    <td className="text-xs text-text-muted">{relativeTimeLocale(a.createdAt)}</td>
                    <td>
                      <button
                        onClick={() => handleClearArrears(a.id)}
                        className="btn-secondary px-3 py-1 text-xs hover:bg-success/20 hover:text-success hover:border-success/50"
                      >
                        {t('dashboard:billing.clear_manual')}
                      </button>
                    </td>
                  </motion.tr>
                ))}
                {!arrears?.length && !loadingArrears && (
                  <tr><td colSpan={6} className="text-center py-8 text-success font-medium">{t('dashboard:billing.no_arrears')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
