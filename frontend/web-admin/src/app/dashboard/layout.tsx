'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import Sidebar from '@/core/components/layout/Sidebar';
import Topbar from '@/core/components/layout/Topbar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useTranslation } from 'react-i18next';
import Background from '@/core/theme/Background';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isCheckingAuth, fetchMe } = useAuthStore();
  const { t } = useTranslation('common');

  useEffect(() => {
    fetchMe().then(() => {
      if (!useAuthStore.getState().isAuthenticated) {
        router.push('/login');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Still verifying the token — show a spinner, do NOT redirect yet.
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <Background />
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
          <p className="text-sm" style={{ color: 'var(--text-faded)' }}>{t('auth.verifying')}</p>
        </div>
      </div>
    );
  }

  // Token check finished — user is not authenticated, redirect to login.
  if (!isAuthenticated) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex relative overflow-hidden">
        <Background />
        <Sidebar />
        <div 
          className="flex-1 flex flex-col min-h-screen relative z-10 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ marginLeft: 'calc(var(--sidebar-w, 72px) + 16px)' }}
        >
          <Topbar />
          <main className="flex-1 p-6 relative z-10">{children}</main>
        </div>
      </div>
      <Toaster position="top-right" theme="dark" richColors />
    </QueryClientProvider>
  );
}
