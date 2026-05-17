'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import Sidebar from '@/core/components/layout/Sidebar';
import Topbar from '@/core/components/layout/Topbar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useTranslation } from 'react-i18next';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, fetchMe } = useAuthStore();
  const { t } = useTranslation('common');

  useEffect(() => {
    fetchMe().then(() => {
      if (!useAuthStore.getState().isAuthenticated) router.push('/login');
    });
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
          <p className="text-text-muted text-sm">{t('auth.verifying')}</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-[#121212] bg-grid flex">
        <div className="absolute inset-0 bg-dark-radial pointer-events-none" />
        <Sidebar />
        <div className="flex-1 ml-[88px] flex flex-col min-h-screen">
          <Topbar />
          <main className="flex-1 p-6 relative z-10">{children}</main>
        </div>
      </div>
      <Toaster position="top-right" theme="dark" richColors />
    </QueryClientProvider>
  );
}
