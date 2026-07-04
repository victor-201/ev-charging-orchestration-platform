/**
 * EVOLTTOUCH Kiosk — Welcome / INIT Screen (Clean Architecture)
 *
 * Shown when the charger is idle and waiting for a customer.
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ShieldCheck, Wifi, ArrowRight, WrenchIcon, QrCode, RefreshCw } from "lucide-react";
import { CHARGER_ID, STATION_ID, POINT_ID, setChargerId } from "../../data/sources/localStorage";
import { GetStationDetailUseCase, GetAvailabilitySlotsUseCase } from "../../application/useCases";
import type { ChargerInfo } from "../../domain/entities/entities";

interface WelcomeScreenProps {
  onStart: () => Promise<void>;
  onScanQrBooking: () => void;
  triggerMaintenance: () => void;
  triggerOffline: () => void;
  triggerReserved: () => void;
  onNoticeTrigger: (bookingTime: string, remainingMins: number) => void;
}

const getStationDetailUseCase = new GetStationDetailUseCase();
const getAvailabilitySlotsUseCase = new GetAvailabilitySlotsUseCase();

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStart,
  onScanQrBooking,
  triggerMaintenance,
  triggerOffline,
  triggerReserved,
  onNoticeTrigger,
}) => {
  const [chargers, setChargers] = useState<ChargerInfo[]>([]);
  const [selectedCharger, setSelectedCharger] = useState<string>(CHARGER_ID || '');
  const [loading, setLoading] = useState(false);
  const [stationName, setStationName] = useState<string>("");
  const [stationAddress, setStationAddress] = useState<string>("");

  useEffect(() => {
    const fetchStationData = async () => {
      try {
        setLoading(true);
        console.log('[Kiosk] Fetching station detail for stationId:', STATION_ID);
        const detail = await getStationDetailUseCase.execute(STATION_ID);
        const list = detail.chargers || [];
        setChargers(list);
        setStationName(detail.name || "");
        setStationAddress(detail.address || "");

        // Default select first available or first charger
        if (list.length > 0) {
          const defaultCharger = list.find(c => c.id === POINT_ID || c.connectors?.some(conn => conn.id === CHARGER_ID)) || list[0];
          setSelectedCharger(defaultCharger.id);
        }
      } catch (err) {
        console.warn('[Kiosk] Could not fetch station details', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStationData();
  }, []);

  // Monitor charger status changes to handle FAULTED/OFFLINE/RESERVED state automatically
  useEffect(() => {
    if (!selectedCharger || chargers.length === 0) return;
    const current = chargers.find(c => c.id === selectedCharger);
    if (current) {
      const statusUpper = (current.status || '').toUpperCase();
      if (statusUpper === 'FAULTED') {
        console.log('[Kiosk] Selected charger is FAULTED, transitioning to MaintenanceScreen');
        triggerMaintenance();
      } else if (statusUpper === 'OFFLINE') {
        console.log('[Kiosk] Selected charger is OFFLINE, transitioning to OfflineScreen');
        triggerOffline();
      } else if (statusUpper === 'RESERVED') {
        console.log('[Kiosk] Selected charger is RESERVED, transitioning to BookingConfirmationScreen');
        triggerReserved();
      }
    }
  }, [selectedCharger, chargers, triggerMaintenance, triggerOffline, triggerReserved]);

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleStart = async () => {
    if (!selectedCharger) return;
    const matched = chargers.find(c => c.id === selectedCharger);
    if (matched?.connectors?.length) {
      setChargerId(matched.connectors[0].id, matched.id);
    } else {
      setChargerId(selectedCharger);
    }

    setLoading(true);
    try {
      const todayStr = getTodayDateString();
      const slots = await getAvailabilitySlotsUseCase.execute(selectedCharger, todayStr);
      const now = new Date();

      const upcomingBookings = slots
        .filter((s: any) => s.isBooked)
        .map((s: any) => ({
          ...s,
          startTime: new Date(s.startTime),
          endTime: new Date(s.endTime)
        }))
        .filter((s: any) => s.startTime > now)
        .sort((a: any, b: any) => a.startTime.getTime() - b.startTime.getTime());

      if (upcomingBookings.length > 0) {
        const nextBooking = upcomingBookings[0];
        const diffMs = nextBooking.startTime.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60_000);

        // Hard lock window check (if booking starts in <= 10 mins)
        if (diffMins <= 10) {
          console.log("[Kiosk] Booking starts in <= 10 minutes. Locking charger to RESERVED state.");
          triggerReserved();
          return;
        }

        // Soft lock look-ahead window check (120 minutes / 2 hours)
        if (diffMins <= 120) {
          const bookingTimeStr = nextBooking.startTime.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          console.log(`[Kiosk] Soft lock warning triggered. Upcoming booking at ${bookingTimeStr} in ${diffMins} mins.`);
          onNoticeTrigger(bookingTimeStr, diffMins);
          return;
        }
      }

      // No booking in the 2-hour window. Start as normal.
      await onStart();
    } catch (err) {
      console.warn("[Kiosk] Failed to verify booking slots look-ahead. Proceeding as normal.", err);
      await onStart();
    } finally {
      setLoading(false);
    }
  };

  // Derive dynamic properties for selected charger
  const currentCharger = chargers.find(c => c.id === selectedCharger);
  const statusUpper = (currentCharger?.status || 'AVAILABLE').toUpperCase();

  const isAvailable = statusUpper === 'AVAILABLE' || statusUpper === 'FREE';
  const isInUse = statusUpper === 'IN_USE' || statusUpper === 'OCCUPIED';
  const isOffline = statusUpper === 'OFFLINE';
  const isReserved = statusUpper === 'RESERVED';

  // Compute connector details dynamically
  const maxPowerKwText = currentCharger?.connectors?.length
    ? `${Math.max(...currentCharger.connectors.map((c: any) => c.maxPowerKw || 0))} kW`
    : (currentCharger?.maxPowerKw ? `${currentCharger.maxPowerKw} kW` : '350 kW');

  const connectorsText = currentCharger?.connectors?.length
    ? currentCharger.connectors.map((c: any) => `${c.connectorType || 'CCS'} (${c.maxPowerKw || 0}kW)`).join(' / ')
    : (currentCharger?.maxPowerKw ? `${currentCharger.maxPowerKw} kW` : 'CCS2 / CHAdeMO');

  // Compute button state and labels
  let buttonLabel = 'BẮT ĐẦU SẠC';
  let buttonDisabled = !selectedCharger || loading;

  if (loading) {
    buttonLabel = 'ĐANG KÍCH HOẠT...';
  } else if (isInUse) {
    buttonLabel = `TRỤ ${currentCharger?.name || ''} ĐANG ĐƯỢC SỬ DỤNG`.toUpperCase().trim();
    buttonDisabled = true;
  } else if (isOffline) {
    buttonLabel = `${(currentCharger?.name || 'Trụ sạc').toUpperCase()} ĐANG BẢO TRÌ / OFFLINE`;
    buttonDisabled = true;
  } else if (isReserved) {
    buttonLabel = `TRỤ ${currentCharger?.name || ''} ĐÃ ĐƯỢC ĐẶT TRƯỚC`.toUpperCase().trim();
    buttonDisabled = true;
  }

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
        style={{ background: isOffline ? 'var(--danger)' : 'var(--primary)', opacity: 0.06 }}
      />
      <div
        className="ambient-glow w-[40%] h-[40%] bottom-[-5%] right-[-5%]"
        style={{ background: 'var(--secondary)', opacity: 0.06 }}
      />
      <div className="grid-overlay opacity-40" />

      {/* ── Header Bar ── */}
      <header className="relative z-10 flex justify-between items-center">
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
              <span className={`status-dot ${isOffline ? 'error' : 'active'}`} />
              {loading ? 'Connecting to Station...' : isOffline ? 'Charger Unavailable' : 'Ready for Connection'}
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
            Chào mừng đến EVOLT Network. Trạm sạc đã sẵn sàng phục vụ quý khách.
          </motion.p>

          <div className="flex flex-col gap-4">
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className={`flex items-center gap-4 transition-all duration-300 font-black uppercase tracking-wider relative overflow-hidden group btn-primary ${buttonDisabled ? "cursor-not-allowed opacity-60" : "hover:scale-[1.02] active:scale-[0.98]"
                }`}
              onClick={handleStart}
              disabled={buttonDisabled}
              style={{
                padding: "18px 44px",
                borderRadius: "20px",
                fontSize: "16px",
                cursor: buttonDisabled ? "not-allowed" : "pointer",
                background: isOffline
                  ? "#dc2626"
                  : isInUse || isReserved
                    ? "rgba(100,116,139,0.3)"
                    : "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
                color: "#ffffff",
                border: "none",
                boxShadow: isOffline
                  ? "0 0 24px rgba(220,38,38,0.35), 0 4px 16px rgba(0,0,0,0.25)"
                  : buttonDisabled
                    ? "none"
                    : "0 0 32px var(--cyan-glow), 0 4px 16px rgba(0,0,0,0.3)",
                opacity: 1,
              }}
            >
              {loading ? (
                <RefreshCw size={20} className="animate-spin relative z-10" />
              ) : isOffline ? (
                <WrenchIcon size={20} />
              ) : (
                <Zap size={20} />
              )}
              <span className="relative z-10">{buttonLabel}</span>
              {!buttonDisabled && <ArrowRight size={20} className="relative z-10" />}
            </motion.button>

            {/* Flow 1: Booking QR scan button */}
            {isAvailable && !buttonDisabled && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.65 }}
                onClick={onScanQrBooking}
                className="flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                style={{
                  padding: "14px 36px",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: "700",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "var(--pill-bg)",
                  color: "var(--primary)",
                  border: "1.5px solid var(--primary)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  boxShadow: "0 0 12px var(--cyan-glow)",
                }}
              >
                <QrCode size={18} />
                <span>Đã đặt lịch? Quét QR</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Right: Orb — adapts content based on offline state */}
        <div className="relative flex-shrink-0">
          {/* Outer ring pulse — red when offline, cyan when available */}
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.4, 0.15] }}
            transition={{ duration: isOffline ? 2 : 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full"
            style={{ border: isOffline ? '1.5px solid rgba(239, 68, 68, 0.5)' : '1.5px solid rgba(16, 191, 201, 0.3)' }}
          />
          {/* Second outer ring */}
          <motion.div
            animate={{ scale: [1, 1.14, 1], opacity: [0.08, 0.25, 0.08] }}
            transition={{ duration: isOffline ? 3 : 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute inset-0 rounded-full"
            style={{ border: isOffline ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(154, 237, 87, 0.2)' }}
          />

          {/* Main orb */}
          <div
            className="w-[440px] h-[440px] rounded-full flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'var(--card-bg)',
              backdropFilter: 'blur(60px)',
              WebkitBackdropFilter: 'blur(60px)',
              border: isOffline ? '2px solid rgba(239, 68, 68, 0.4)' : '1.5px solid var(--card-border)',
              boxShadow: isOffline
                ? 'var(--card-shadow), 0 0 60px rgba(239,68,68,0.12)'
                : 'var(--card-shadow), 0 0 60px var(--cyan-glow)',
            }}
          >
            {/* Shine overlay */}
            <div className="absolute inset-0 rounded-full" style={{ background: 'var(--sq-shine)', zIndex: 1 }} />
            {/* Corner markers */}
            <div className="corner-marker cm-tl" />
            <div className="corner-marker cm-tr" />
            {/* Inner decorative rings */}
            <div className="absolute w-[75%] h-[75%] rounded-full" style={{ border: '1px solid var(--card-border)' }} />
            <div className="absolute w-[50%] h-[50%] rounded-full" style={{ border: '1px solid var(--card-border)', opacity: 0.15 }} />

            {/* Gradient overlay */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isOffline
                  ? 'radial-gradient(circle at 50% 50%, rgba(239,68,68,0.06) 0%, transparent 70%)'
                  : 'radial-gradient(circle at 40% 35%, rgba(16,191,201,0.08) 0%, rgba(154,237,87,0.04) 60%, transparent 80%)',
              }}
            />

            {/* Center content — conditional */}
            <AnimatePresence mode="wait">
              {isOffline ? (
                /* ── OFFLINE: Maintenance info panel inside orb ── */
                <motion.div
                  key="offline-content"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.35 }}
                  className="relative z-10 flex flex-col items-center gap-4 px-10 text-center w-full"
                >
                  {/* Warning badge */}
                  <div
                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl w-full justify-center"
                    style={{ background: '#dc2626', boxShadow: '0 4px 14px rgba(220,38,38,0.3)' }}
                  >
                    <motion.span
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                      className="inline-flex items-center text-lg text-white"
                    >
                      <Zap size={18} fill="white" className="shrink-0 text-white" />
                    </motion.span>
                    <span className="text-white font-black text-xs uppercase tracking-wider leading-tight">
                      {(currentCharger?.name || 'TRỤ SẠC').toUpperCase()}<br />ĐANG BẢO TRÌ / OFFLINE
                    </span>
                  </div>

                  {/* Power rating */}
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>DC FAST CHARGE</p>
                    <p className="text-3xl font-black tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>
                      {maxPowerKwText.toUpperCase()}
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="w-16 h-px" style={{ background: 'rgba(239,68,68,0.3)' }} />

                  {/* Specs */}
                  <div className="w-full space-y-1.5 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>TRỤ</span>
                      <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{currentCharger?.name || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>CÔNG SUẤT</span>
                      <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{maxPowerKwText}</span>
                    </div>
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text-muted)' }}>KẾT NỐI</span>
                      <span className="text-[10px] font-black text-right ml-2 leading-tight" style={{ color: 'var(--text-primary)' }}>{connectorsText}</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* ── AVAILABLE: Animated charging orb content ── */
                <motion.div
                  key="available-content"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.35 }}
                  className="relative z-10 flex flex-col items-center gap-3"
                >
                  <motion.div
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Zap size={80} style={{ color: 'var(--primary)', opacity: 0.25 }} />
                  </motion.div>
                  <p className="caption text-center" style={{ color: 'var(--text-muted)' }}>
                    {maxPowerKwText} DC Fast Charge
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Footer / Station Dashboard Bar ── */}
      <footer className="relative z-10 mt-auto border-t border-[var(--card-border)] pt-8 pb-2 flex justify-between items-center gap-8">
        {/* Block 1: Station Info */}
        <div className="flex-1 flex flex-col gap-1 min-w-[250px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">TRẠM SẠC</span>
          <h4 className="text-base font-black text-[var(--text-primary)] leading-tight truncate">
            {stationName || "Trạm sạc EVOLT"}
          </h4>
          {stationAddress ? (
            <p className="text-xs font-semibold text-[var(--text-secondary)] leading-tight truncate">
              {stationAddress}
            </p>
          ) : (
            <p className="text-xs font-semibold text-[var(--text-secondary)] leading-tight truncate">
              Connecting to station...
            </p>
          )}
        </div>

        <div className="h-10 w-px bg-[var(--card-border)] opacity-30" />

        {/* Block 2: Charger Info */}
        <div className="flex-1 flex flex-col gap-1 min-w-[200px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">TRỤ SẠC</span>
          <h4 className="text-base font-black text-[var(--text-primary)] leading-tight">
            {currentCharger?.name || (CHARGER_ID ? `Trụ (${CHARGER_ID.substring(0, 8)})` : "Chưa cấu hình")}
          </h4>
          <p className="text-xs font-semibold text-[var(--text-secondary)] leading-tight">
            <span className="text-gradient font-black">{maxPowerKwText}</span> · {connectorsText}
          </p>
        </div>

        <div className="h-10 w-px bg-[var(--card-border)] opacity-30" />

        {/* Block 3: Status Badge */}
        <div className="flex-shrink-0 flex flex-col gap-1.5 min-w-[150px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">TRẠNG THÁI TRỤ</span>
          <div>
            <span
              className="px-3.5 py-1 rounded-full text-[11px] font-black tracking-wider uppercase inline-flex items-center gap-2"
              style={{
                background:
                  isOffline || statusUpper === "FAULTED"
                    ? "#dc2626"
                    : isInUse || isReserved
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(34,197,94,0.15)",
                color:
                  isOffline || statusUpper === "FAULTED"
                    ? "#fff"
                    : isInUse || isReserved
                      ? "#d97706"
                      : "#16a34a",
                border:
                  isOffline || statusUpper === "FAULTED"
                    ? "none"
                    : isInUse || isReserved
                      ? "1px solid rgba(245,158,11,0.3)"
                      : "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isOffline || statusUpper === "FAULTED"
                    ? "bg-white"
                    : isInUse || isReserved
                      ? "bg-[#d97706]"
                      : "bg-[#16a34a]"
                  }`}
              />
              {isOffline
                ? "OFFLINE"
                : statusUpper === "FAULTED"
                  ? "LỖI TRỤ SẠC"
                  : isInUse
                    ? "ĐANG SỬ DỤNG"
                    : isReserved
                      ? "ĐÃ ĐẶT TRƯỚC"
                      : "SẴN SÀNG"}
            </span>
          </div>
        </div>

        <div className="h-10 w-px bg-[var(--card-border)] opacity-30" />

        {/* Block 4: Branding / Tech specs */}
        <div className="flex flex-col gap-1 text-right min-w-[180px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">HỆ THỐNG</span>
          <h4 className="text-sm font-black text-[var(--text-primary)] leading-tight uppercase tracking-wider">
            EVOLT NETWORK
          </h4>
          <p className="text-[10px] font-bold text-[var(--text-secondary)] tracking-widest opacity-60">
            SECURE CHARGE PORTAL
          </p>
        </div>
      </footer>
    </motion.div>
  );
};

export default WelcomeScreen;
