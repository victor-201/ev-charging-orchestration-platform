'use client';

import { useAuthStore } from '@/features/auth/store/auth.store';
import { Bell, Search, Sun, Moon, Globe } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Cookies from 'js-cookie';

export default function Topbar() {
  const { user } = useAuthStore();
  const [dark, setDark] = useState(true);
  const { t, i18n } = useTranslation('common');

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'vi' ? 'en' : 'vi';
    i18n.changeLanguage(nextLang);
    Cookies.set('i18next', nextLang, { expires: 365, path: '/' });
  };

  return (
    <header className="topbar sticky top-0 z-40 flex items-center justify-between px-6 h-[64px]">
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder={t('topbar.search_placeholder')}
            className="ev-input pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleLanguage}
          className="btn-secondary h-9 px-3 flex items-center gap-2 font-semibold text-xs tracking-wider uppercase"
          title="Change Language"
        >
          <Globe className="w-4 h-4 text-cyan" />
          {i18n.language === 'vi' ? 'VI' : 'EN'}
        </button>

        <button
          onClick={() => setDark(!dark)}
          className="btn-secondary w-9 h-9 flex items-center justify-center p-0"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button className="btn-secondary w-9 h-9 flex items-center justify-center p-0 relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />
        </button>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center text-white text-sm font-bold shadow-glow-sm cursor-pointer ml-2">
          {user?.fullName?.[0] || user?.email?.[0] || 'A'}
        </div>
      </div>
    </header>
  );
}
