/**
 * Localization Formatting Utilities
 *
 * Formats numeric metrics, currencies, times, and relative date differences
 * conforming to the active UI internationalization locale context.
 */

import i18next from '../index';

export const formatCurrency = (amount: number): string => {
  const lng = i18next.language || 'vi';
  
  if (lng === 'en') {
    // Enforces English currency formatting for VND to maintain consistent numeric symbols for international users.
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND' }).format(amount);
  }

  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

export const formatNumberLocale = (n: number): string => {
  const lng = i18next.language || 'vi';
  return new Intl.NumberFormat(lng === 'en' ? 'en-US' : 'vi-VN').format(n);
};

export const formatDate = (dateStr: string, options?: Intl.DateTimeFormatOptions): string => {
  const lng = i18next.language || 'vi';
  return new Date(dateStr).toLocaleString(lng === 'en' ? 'en-US' : 'vi-VN', options);
};

export const relativeTimeLocale = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  const lng = i18next.language || 'vi';

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(seconds / 86400);
  const months = Math.floor(seconds / 2592000); // 30 days
  const years = Math.floor(seconds / 31536000); // 365 days

  if (lng === 'en') {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${minutes}m ago`;
    if (seconds < 86400) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
  }

  if (seconds < 60) return `${seconds}s trước`;
  if (seconds < 3600) return `${minutes}m trước`;
  if (seconds < 86400) return `${hours}h trước`;
  if (days < 30) return `${days} ngày trước`;
  if (months < 12) return `${months} tháng trước`;
  return `${years} năm trước`;
};

export const tSafe = (key: string, fallback?: string): string => {
  if (!i18next.isInitialized) return fallback || key;
  const result = i18next.t(key);
  if (result === key || result === key.split(':').pop()) {
    return fallback || result;
  }
  return result;
};

export const translateMessage = (msgOrKey: string | undefined | null, fallbackKey: string): string => {
  if (!msgOrKey) return tSafe(fallbackKey);
  const cleanMsg = msgOrKey.trim();
  const prefixes = [
    '',
    'common:api_errors.',
    'dashboard:api_errors.',
    'dashboard:maintenance.',
    'dashboard:staff.',
    'dashboard:users.',
    'dashboard:bookings.',
    'dashboard:map.',
    'dashboard:sessions.',
    'common:common.',
    'common:gps.',
    'dashboard:home.checkin.'
  ];

  for (const prefix of prefixes) {
    const fullKey = prefix ? `${prefix}${cleanMsg}` : cleanMsg;
    const translated = i18next.t(fullKey);
    if (translated !== fullKey && translated !== fullKey.split(':').pop()) {
      return translated;
    }
  }

  return tSafe(fallbackKey);
};
