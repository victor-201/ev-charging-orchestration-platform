'use client';

import { useTranslation } from 'react-i18next';

export default function DashboardLoading() {
  const { t } = useTranslation('common');
  return (
    <div className="h-[400px] flex items-center justify-center relative overflow-hidden">
      <div className="flex flex-col items-center gap-4 relative z-10">
        <div className="w-10 h-10 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
        <p className="text-sm text-text-faded font-medium">
          {t('auth.verifying') || 'Đang tải dữ liệu...'}
        </p>
      </div>
    </div>
  );
}
