'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useTranslation } from 'react-i18next';
import {
  Zap, LayoutDashboard, MapPin, Battery, CreditCard,
  Users, BarChart3, Bell, Settings, LogOut,
  Wrench, ShieldAlert, User,
} from 'lucide-react';
import { cn } from '@/core/utils/cn';

const NAV_ITEMS = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'map', href: '/dashboard/map', icon: MapPin },
  { key: 'sessions', href: '/dashboard/sessions', icon: Battery },
  { key: 'bookings', href: '/dashboard/bookings', icon: ShieldAlert },
  { key: 'billing', href: '/dashboard/billing', icon: CreditCard },
  { key: 'users', href: '/dashboard/users', icon: User },
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
  const [clickedHref, setClickedHref] = useState<string | null>(null);
  const { t } = useTranslation('common');

  // Reset clickedHref when the pathname actually changes (navigation completes)
  useEffect(() => {
    setClickedHref(null);
  }, [pathname]);

  // Set --sidebar-w on document root for main content to adapt
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(
        '--sidebar-w',
        expanded ? '224px' : '72px'
      );
    }
  }, [expanded]);

  const isActive = (href: string) => {
    const current = clickedHref || pathname;
    return href === '/dashboard' ? current === '/dashboard' : current.startsWith(href);
  };

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        'fixed left-4 top-4 bottom-4 z-50 flex flex-col py-5 px-3 glass-shine',
        expanded ? 'w-56' : 'w-[72px]'
      )}
      style={{
        background: 'var(--card-bg)',
        backdropFilter: 'blur(60px)',
        WebkitBackdropFilter: 'blur(60px)',
        border: '1.5px solid var(--card-border)',
        borderRadius: '28px',
        boxShadow: 'var(--card-shadow)',
        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Corner Markers */}
      <div className="corner-marker cm-tl" />
      <div className="corner-marker cm-tr" />
      <div className="corner-marker cm-bl" />
      <div className="corner-marker cm-br" />

      {/* Logo */}
      <div className="flex items-center gap-3 px-1 mt-2 mb-8 overflow-hidden">
        <div className="shrink-0 w-11 h-11 flex items-center justify-center">
          <img src="/EVoltBoard.png" alt="EVoltBoard Logo" className="w-10 h-10 object-contain" />
        </div>
        <span
          className={cn(
            'font-bold text-sm tracking-tight whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            expanded ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-2 w-0 pointer-events-none'
          )}
          style={{ color: 'var(--text-main)' }}
        >
          {t('brand.name')}
        </span>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-1 overflow-hidden">
        {NAV_ITEMS.filter(({ key }) => {
          const isAdmin = user?.roles?.includes('admin');
          // Pages exclusively for admins: staff mgmt, analytics, billing, user mgmt
          // Staff can see: dashboard, map, sessions, bookings, maintenance, notifications, settings
          if (!isAdmin && ['staff', 'analytics', 'billing', 'users'].includes(key)) {
            return false;
          }
          return true;
        }).map(({ key, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setClickedHref(href)}
              className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-200 group overflow-hidden"
              style={{
                background: active ? 'rgba(16, 191, 201, 0.12)' : 'transparent',
                border: active ? '1px solid rgba(16, 191, 201, 0.25)' : '1px solid transparent',
                borderLeft: active ? '4px solid var(--brand-cyan)' : '1px solid transparent',
                color: active ? '#10bfc9' : 'var(--text-faded)',
              }}
            >
              <Icon className="shrink-0 w-5 h-5 transition-colors" />
              <span
                className={cn(
                  'text-[13px] font-medium whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                  expanded ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-2 w-0 pointer-events-none'
                )}
              >
                {t(`nav.${key}`)}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="pt-4 pb-2 overflow-hidden" style={{ borderTop: '1px solid var(--card-border)' }}>
        <div
          className={cn(
            'px-2.5 py-2 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] mb-3 overflow-hidden',
            expanded ? 'opacity-100 max-h-20 translate-y-0' : 'opacity-0 max-h-0 -translate-y-2 pointer-events-none'
          )}
          style={{ background: 'var(--sq-3-bg)' }}
        >
          <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-main)' }}>
            {user?.fullName || user?.email}
          </p>
          <p className="text-[11px] truncate" style={{ color: 'var(--text-faded)' }}>
            {user?.roles?.map(r => t(`roles.${r}`, { defaultValue: r })).join(', ')}
          </p>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl w-full transition-all duration-200"
          style={{ color: 'var(--text-faded)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-faded)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <LogOut className="shrink-0 w-5 h-5" />
          <span
            className={cn(
              'text-[13px] font-medium whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
              expanded ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-2 w-0 pointer-events-none'
            )}
          >
            {t('nav.logout')}
          </span>
        </button>
      </div>
    </aside>
  );
}
