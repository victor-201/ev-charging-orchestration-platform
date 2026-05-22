/**
 * EVOLTTOUCH Kiosk — Welcome / INIT Screen
 *
 * Shown when the charger is idle and waiting for a customer.
 * Business logic: User approaches kiosk → tap to begin identification.
 */

import React from "react";
import { motion } from "framer-motion";
import { Zap, ShieldCheck, Wifi, ArrowRight, Sun, Moon } from "lucide-react";
import { CHARGER_ID, STATION_ID } from "../api";

interface WelcomeScreenProps {
  onStart: () => Promise<void>;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, theme, onToggleTheme }) => {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      className="flex-1 flex flex-col h-full p-10"
    >
      {/* ── Ambient Glow BG ── */}
      <div
        className="ambient-glow w-[50%] h-[50%] top-[-5%] left-[-5%]"
        style={{ background: 'var(--primary)', opacity: 0.08 }}
      />
      <div
        className="ambient-glow w-[40%] h-[40%] bottom-[-5%] right-[-5%]"
        style={{ background: 'var(--secondary)', opacity: 0.06 }}
      />
      <div className="grid-overlay opacity-40" />

      {/* ── Header Bar ── */}
      <header className="relative z-10 flex justify-between items-center mb-16">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-[20px] flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'var(--card-bg)',
              backdropFilter: 'blur(60px)',
              WebkitBackdropFilter: 'blur(60px)',
              border: '1.5px solid var(--card-border)',
              boxShadow: '0 0 20px var(--cyan-glow)',
            }}
          >
            <div className="absolute inset-0" style={{ background: 'var(--sq-shine)' }} />
            <img src="/EVoltTouch.png" alt="EVoltTouch Logo" className="w-10 h-10 object-contain relative z-10" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
              EVOLT
              <span className="font-light" style={{ color: 'var(--text-secondary)' }}>
                TOUCH
              </span>
            </h1>
            <p className="caption">Smart Charging Display</p>
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex gap-3">
          <div className="glass-pill px-5 py-2.5 flex items-center gap-2">
            <Wifi size={14} style={{ color: 'var(--success)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              GRID ONLINE
            </span>
          </div>
          <div className="glass-pill px-5 py-2.5 flex items-center gap-2">
            <ShieldCheck size={14} style={{ color: 'var(--primary)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              ISO 15118
            </span>
          </div>
          <button 
            onClick={onToggleTheme}
            className="glass-pill w-10 h-10 flex items-center justify-center transition-all duration-300 active:scale-95 hover:scale-105 cursor-pointer"
            style={{
              background: 'var(--pill-bg)',
              borderColor: 'var(--pill-border)',
              color: 'var(--pill-text)',
              boxShadow: 'var(--pill-shadow)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            {theme === "dark" ? (
              <Sun size={15} style={{ color: 'var(--warning)' }} />
            ) : (
              <Moon size={15} style={{ color: 'var(--accent)' }} />
            )}
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="relative z-10 flex-1 flex items-center justify-between gap-16">
        {/* Left: Hero Text + CTA */}
        <div className="max-w-xl space-y-10">
          <div className="space-y-5">
            <motion.span
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="caption-branded flex items-center gap-2"
            >
              <span className="status-dot active" />
              Ready for Connection
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-[76px] font-black leading-[0.95] tracking-tighter"
            >
              Charge
              <br />
              <span className="text-gradient">Smarter.</span>
              <br />
              <span className="text-[var(--text-primary)] opacity-25">
                Faster.
              </span>
            </motion.h1>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="text-lg text-[var(--text-secondary)] leading-relaxed font-medium"
          >
            Chào mừng đến EVOLT Network. Chạm để bắt đầu phiên sạc của bạn.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="btn-primary flex items-center gap-4"
            onClick={onStart}
          >
            <Zap size={20} />
            BẮT ĐẦU SẠC
            <ArrowRight size={20} />
          </motion.button>
        </div>

        {/* Right: Animated Orb */}
        <div className="relative flex-shrink-0">
          {/* Outer ring pulse */}
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full"
            style={{ border: '1.5px solid rgba(16, 191, 201, 0.3)' }}
          />
          {/* Second outer ring */}
          <motion.div
            animate={{ scale: [1, 1.14, 1], opacity: [0.08, 0.2, 0.08] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute inset-0 rounded-full"
            style={{ border: '1px solid rgba(154, 237, 87, 0.2)' }}
          />
          {/* Main orb — glass-elevated */}
          <div
            className="w-[440px] h-[440px] rounded-full flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'var(--card-bg)',
              backdropFilter: 'blur(60px)',
              WebkitBackdropFilter: 'blur(60px)',
              border: '1.5px solid var(--card-border)',
              boxShadow: 'var(--card-shadow), 0 0 60px var(--cyan-glow)',
            }}
          >
            {/* Shine overlay */}
            <div className="absolute inset-0 rounded-full" style={{ background: 'var(--sq-shine)', zIndex: 1 }} />
            {/* Corner markers adapted for circle */}
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            {/* Inner decorative rings */}
            <div className="absolute w-[75%] h-[75%] rounded-full" style={{ border: '1px solid var(--card-border)' }} />
            <div className="absolute w-[50%] h-[50%] rounded-full" style={{ border: '1px solid var(--card-border)', opacity: 0.15 }} />

            {/* Center icon cluster */}
            <div className="relative z-10 flex flex-col items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Zap size={80} style={{ color: 'var(--primary)', opacity: 0.25 }} />
              </motion.div>
              <p className="caption text-center" style={{ color: 'var(--text-muted)' }}>350 kW DC Fast Charge</p>
            </div>

            {/* Gradient overlay */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle at 40% 35%, rgba(16,191,201,0.08) 0%, rgba(154,237,87,0.04) 60%, transparent 80%)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Footer Stats ── */}
      <footer className="relative z-10 mt-auto border-t border-[var(--card-border)] pt-8 flex justify-between items-end">
        <div className="flex gap-12">
          <FooterStat label="Trạm ID" value={STATION_ID} />
          <FooterStat label="Thiết bị" value={CHARGER_ID} />
          <FooterStat label="Công suất max" value="350 kW" />
          <FooterStat label="Loại kết nối" value="CCS2 / CHAdeMO" />
        </div>
        <div className="text-right">
          <p className="caption mb-1">Managed by</p>
          <p className="text-sm font-bold tracking-wide">
            EVOLT ORCHESTRATION PLATFORM
          </p>
        </div>
      </footer>
    </motion.div>
  );
};

const FooterStat: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div>
    <p className="caption mb-1">{label}</p>
    <p className="text-sm font-bold tracking-wide">{value}</p>
  </div>
);

export default WelcomeScreen;
