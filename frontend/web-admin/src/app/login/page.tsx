'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { motion } from 'framer-motion';
import { Zap, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { mapApiError } from '@/i18n/error-mapping';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const { t, i18n } = useTranslation('common');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password, mfaToken || undefined);
      router.push('/dashboard');
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string; code?: string } } }).response;
      if (res?.data?.code === 'MFA_REQUIRED') {
        setShowMfa(true);
        setError(t('auth.mfa_required_toast'));
      } else {
        setError(mapApiError(res?.data?.code, res?.data?.message));
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] bg-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Locale Switcher */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={() => {
            const nextLang = i18n.language === 'vi' ? 'en' : 'vi';
            i18n.changeLanguage(nextLang);
            document.cookie = `i18next=${nextLang}; path=/; max-age=31536000`;
          }}
          className="btn-secondary h-9 px-4 flex items-center gap-2 font-semibold text-xs tracking-wider uppercase bg-white/10"
        >
          {i18n.language === 'vi' ? 'VI' : 'EN'}
        </button>
      </div>

      <div className="absolute inset-0 bg-dark-radial pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-cyan/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-gradient mb-5 shadow-glow">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-h2 font-bold text-white mb-1">EVOLTBOARD</h1>
          <p className="text-text-secondary text-sm">{t('auth.platform_subtitle')}</p>
        </div>

        <div className="glass p-8">
          <h2 className="text-xl font-semibold text-white mb-6">{t('auth.login_title')}</h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2.5 p-3.5 mb-5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary uppercase tracking-wider mb-2">
                {t('auth.email_label')}
              </label>
              <input
                type="email"
                className="ev-input"
                placeholder={t('auth.email_placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text-secondary uppercase tracking-wider mb-2">
                {t('auth.password_label')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="ev-input pr-11"
                  placeholder={t('auth.password_placeholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {showMfa && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <label className="block text-[12px] font-medium text-text-secondary uppercase tracking-wider mb-2">
                  {t('auth.mfa_label')}
                </label>
                <input
                  type="text"
                  className="ev-input font-mono tracking-[0.3em] text-center text-lg"
                  placeholder={t('auth.mfa_placeholder')}
                  maxLength={6}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                />
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {isLoading ? t('auth.login_loading') : t('auth.login_btn')}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/5 text-center">
            <p className="text-text-muted text-xs">
              {t('auth.footer_text')}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
