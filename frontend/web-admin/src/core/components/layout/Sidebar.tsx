'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useTranslation } from 'react-i18next';
import {
  Zap, LayoutDashboard, MapPin, Battery, CreditCard,
  Users, BarChart3, Bell, Settings, LogOut, ChevronRight,
  Wrench, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/core/utils/cn';

const NAV_ITEMS = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'map', href: '/dashboard/map', icon: MapPin },
  { key: 'sessions', href: '/dashboard/sessions', icon: Battery },
  { key: 'bookings', href: '/dashboard/bookings', icon: ShieldAlert },
  { key: 'billing', href: '/dashboard/billing', icon: CreditCard },
  { key: 'staff', href: '/dashboard/staff', icon: Users },
  { key: 'notifications', href: '/dashboard/notifications', icon: Bell },
  { key: 'maintenance', href: '/dashboard/maintenance', icon: Wrench },
  { key: 'analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { key: 'settings', href: '/dashboard/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation('common');

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        'fixed left-4 top-4 bottom-4 z-50 flex flex-col py-5 px-3 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        'glass',
        expanded ? 'w-56' : 'w-[72px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-1 mb-8 overflow-hidden">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center shadow-glow">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="font-bold text-white text-sm tracking-tight whitespace-nowrap"
            >
              EVOLTBOARD
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-1 overflow-hidden">
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-180 group overflow-hidden',
                active
                  ? 'bg-cyan/10 border border-cyan/20 text-cyan'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              )}
            >
              <Icon className={cn('shrink-0 w-5 h-5 transition-colors', active ? 'text-cyan' : '')} />
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.16 }}
                    className="text-[13px] font-medium whitespace-nowrap"
                  >
                    {t(`nav.${key}`)}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="pt-4 border-t border-white/5 overflow-hidden">
        {expanded && (
          <div className="mb-3 px-2.5 py-2 rounded-xl bg-white/5">
            <p className="text-[12px] font-semibold text-white truncate">{user?.fullName || user?.email}</p>
            <p className="text-[11px] text-text-muted truncate">
              {user?.roles?.map(r => t(`roles.${r}`, { defaultValue: r })).join(', ')}
            </p>
          </div>
        )}
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl w-full text-text-muted hover:text-danger hover:bg-danger/8 transition-all duration-180"
        >
          <LogOut className="shrink-0 w-5 h-5" />
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[13px] font-medium whitespace-nowrap"
              >
                {t('nav.logout')}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </aside>
  );
}
