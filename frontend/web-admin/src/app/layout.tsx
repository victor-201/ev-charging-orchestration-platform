import type { Metadata } from 'next';
import './globals.css';
import I18nProvider from '@/i18n/I18nProvider';

export const metadata: Metadata = {
  title: 'EVOLTBOARD — EV Charging Admin',
  description: 'Enterprise-grade control center for EV Charging Orchestration Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-[#121212] text-white antialiased">
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
