/**
 * EVOLTTOUCH Kiosk — Booking Confirmation Screen (Hard Lock)
 * 
 * Shown when a charger is in 'reserved' state (within 10 minutes of booking).
 * Walk-ins are locked out. Only the booking owner can scan the QR to begin.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, ShieldAlert, Clock, RotateCcw } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { GetStationDetailUseCase } from "../../application/useCases";
import { CHARGER_ID, STATION_ID, POINT_ID } from "../../data/sources/localStorage";
import type { ChargerInfo } from "../../domain/entities/entities";
import type { ReservedBookingInfo } from "../hooks/useSessionStateMachine";

interface BookingConfirmationScreenProps {
  onScanSuccess: (bookingId: string, qrToken: string) => void;
  onCancel?: () => void;
  reservedBookingInfo?: ReservedBookingInfo | null;
}

// Minimal JWT decode (no verify — server verifies)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const payload = atob(base64);
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/** Choose the best rear/environment camera for QR scanning */
async function resolveCameraConfig(): Promise<string | MediaTrackConstraints> {
  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      const label = devices[0].label?.toLowerCase() ?? '';
      if (label.includes('front') || label.includes('trước')) {
        const rear = devices.find(d =>
          d.label?.toLowerCase().includes('back') ||
          d.label?.toLowerCase().includes('rear') ||
          d.label?.toLowerCase().includes('sau') ||
          d.label?.toLowerCase().includes('environment')
        );
        if (rear) return rear.id;
      }
      return devices[0].id;
    }
  } catch { }
  return { facingMode: "environment" };
}

const getStationDetailUseCase = new GetStationDetailUseCase();

const BookingConfirmationScreen: React.FC<BookingConfirmationScreenProps> = ({
  onScanSuccess,
  onCancel,
  reservedBookingInfo,
}) => {
  const scannerContainerId = "kiosk-reserved-scanner";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [countdownSecs, setCountdownSecs] = useState<number>(() => {
    if (reservedBookingInfo && reservedBookingInfo.startTime) {
      const startTime = new Date(reservedBookingInfo.startTime);
      const expirationTime = new Date(startTime.getTime() + 5 * 60_000);
      return Math.max(0, Math.floor((expirationTime.getTime() - Date.now()) / 1000));
    }
    const stored = localStorage.getItem('kiosk_reserved_at');
    if (!stored) {
      localStorage.setItem('kiosk_reserved_at', Date.now().toString());
      return 15 * 60;
    }
    const elapsed = Math.floor((Date.now() - Number(stored)) / 1000);
    return Math.max(0, 15 * 60 - elapsed);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      let remaining = 0;
      if (reservedBookingInfo && reservedBookingInfo.startTime) {
        const startTime = new Date(reservedBookingInfo.startTime);
        const expirationTime = new Date(startTime.getTime() + 5 * 60_000);
        remaining = Math.floor((expirationTime.getTime() - Date.now()) / 1000);
      } else {
        const stored = localStorage.getItem('kiosk_reserved_at');
        const elapsed = stored ? Math.floor((Date.now() - Number(stored)) / 1000) : 0;
        remaining = 15 * 60 - elapsed;
      }
      remaining = Math.max(0, remaining);
      setCountdownSecs(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        if (onCancel) {
          onCancel();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reservedBookingInfo, onCancel]);

  const countdownLabel = useMemo(() => {
    const m = Math.floor(countdownSecs / 60);
    const s = countdownSecs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [countdownSecs]);



  const [stationName, setStationName] = useState("");
  const [stationAddress, setStationAddress] = useState("");
  const [currentCharger, setCurrentCharger] = useState<ChargerInfo | null>(null);

  useEffect(() => {
    getStationDetailUseCase.execute(STATION_ID)
      .then(detail => {
        setStationName(detail.name || "");
        setStationAddress(detail.address || "");
        const chargers: ChargerInfo[] = detail.chargers || [];
        const matched = chargers.find(c => c.id === POINT_ID || c.connectors?.some(conn => conn.id === CHARGER_ID));
        setCurrentCharger(matched || chargers[0] || null);
      })
      .catch(() => { });
  }, []);

  const maxPowerKwText = currentCharger?.connectors?.length
    ? `${Math.max(...currentCharger.connectors.map((c: any) => c.maxPowerKw || 0))} kW`
    : (currentCharger?.maxPowerKw ? `${currentCharger.maxPowerKw} kW` : '—');

  const connectorsText = currentCharger?.connectors?.length
    ? currentCharger.connectors.map((c: any) => `${c.connectorType || 'CCS'} (${c.maxPowerKw || 0}kW)`).join(' / ')
    : (currentCharger?.maxPowerKw ? `${currentCharger.maxPowerKw} kW` : '—');



  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;

  const handleScanSuccessLocal = useCallback(
    (decodedText: string) => {
      // Stop scanner immediately
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => { });
      }

      const rawToken = decodedText.trim();


      // 1. Check standard non-JWT format EV-XXXX-XXXX
      if (rawToken.startsWith("EV-") || !rawToken.includes(".")) {
        onScanSuccessRef.current("", rawToken);
        return;
      }

      // 2. Legacy/Fallback check: JWT decoding
      const payload = decodeJwtPayload(rawToken);

      if (payload && typeof payload.bookingId === "string") {
        onScanSuccessRef.current(payload.bookingId as string, (payload.qrToken as string) || rawToken);
        return;
      }

      setScanError("Mã QR không hợp lệ.");
      // Auto-restart after 3 seconds
      setTimeout(() => {
        setScanError(null);
        restartScanner();
      }, 3000);
    },
    []
  );

  const restartScanner = useCallback(async () => {
    if (scannerRef.current) {
      if (scannerRef.current.isScanning) {
        try {
          await scannerRef.current.stop();
        } catch (e) { }
      }
      try {
        scannerRef.current.clear();
      } catch (e) { }
    }

    const html5QrCode = new Html5Qrcode(scannerContainerId);
    scannerRef.current = html5QrCode;

    try {
      const cameraConfig = await resolveCameraConfig();

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: { width: 160, height: 160 },
          aspectRatio: 1.0,
          videoConstraints: { width: { max: 1280 }, height: { max: 720 } },
        },
        handleScanSuccessLocal,
        () => { }
      );
    } catch (err) {
      console.warn("Failed to restart scanner:", err);
    }
  }, [handleScanSuccessLocal]);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode(scannerContainerId);
    scannerRef.current = html5QrCode;
    let isMounted = true;

    const startScanner = async () => {
      try {
        const cameraConfig = await resolveCameraConfig();
        if (!isMounted) return;

        await html5QrCode.start(
          cameraConfig,
          {
            fps: 15,
            qrbox: { width: 160, height: 160 },
            aspectRatio: 1.0,
            videoConstraints: { width: { max: 1280 }, height: { max: 720 } },
          },
          handleScanSuccessLocal,
          () => { }
        );
      } catch (err) {
        console.warn("Failed to start scanner on reserved screen:", err);
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch((err) => {
          console.error("Failed to stop scanner on cleanup:", err);
        });
      }
    };
  }, [handleScanSuccessLocal]);

  return (
    <motion.div
      key="booking-confirm"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="flex-1 flex flex-col h-full relative p-10"
    >
      {/* ── Ambient Glow BG ── */}
      <div className="ambient-glow bg-[var(--warning)] opacity-[0.08] w-[60%] h-[60%] top-[-10%] right-[-10%] blur-[130px]" />
      <div className="ambient-glow bg-[var(--primary)] opacity-[0.05] w-[40%] h-[40%] bottom-[-5%] left-[-5%] blur-[100px]" />
      <div className="grid-overlay opacity-30" />

      {/* ── Header ── */}
      <header className="relative z-10 flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 glass rounded-[20px] flex items-center justify-center border-[var(--card-border)] shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <Calendar size={26} className="text-[var(--warning)]" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest text-[var(--warning)]">
              Cổng Sạc Đã Giữ Chỗ
            </h1>
            <p className="caption">Reserved Charger Gate</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Countdown clock pill — amber/yellow throughout */}
          <div
            className="glass-pill px-5 py-2.5 flex items-center gap-3"
            style={{
              borderColor: 'rgba(245,158,11,0.4)',
              boxShadow: '0 0 18px rgba(245,158,11,0.15)',
            }}
          >
            <Clock size={20} className="text-[var(--warning)]" />
            <span className="text-xl font-mono font-black text-[var(--warning)]">
              {countdownLabel}
            </span>
          </div>
        </div>

      </header>

      {/* ── Main Content ── */}
      <div className="relative z-10 flex-1 grid grid-cols-12 gap-8 items-center">

        {/* Left: Booking Details */}
        <div className="col-span-4 flex flex-col space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[var(--warning)] font-black text-xs uppercase tracking-wider w-fit">
              <ShieldAlert size={14} />
              Khóa cứng 15 phút
            </div>
            <h2 className="text-[38px] font-black leading-[1.1] tracking-tight">
              Giữ Trạm <br />
              <span className="text-[var(--warning)]">Đã Đặt Trước</span>
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-medium">
              Cổng sạc này hiện đang được giữ chỗ cố định cho khách hàng đã đặt lịch trên ứng dụng EVOLT. Walk-in tạm thời bị khóa.
            </p>
          </div>

        </div>

        {/* Right: Dual Authentication Area */}
        <div className="col-span-8 grid grid-cols-2 gap-6 items-stretch justify-center">

          {/* Card A: Kiosk camera scans Phone */}
          <div
            className="p-6 rounded-[32px] border-[1.5px] border-[var(--card-border)] relative overflow-hidden flex flex-col items-center justify-between text-center min-h-[380px]"
            style={{
              background: 'var(--card-bg)',
              backdropFilter: 'blur(60px)',
              WebkitBackdropFilter: 'blur(60px)',
              boxShadow: 'var(--card-shadow), 0 20px 40px rgba(16,191,201,0.06)',
            }}
          >
            <div className="absolute inset-0" style={{ background: 'var(--sq-shine)' }} />

            <div className="relative z-10 w-full">
              <span className="caption mb-2.5 block text-[var(--primary)] font-black text-[10px]">Cách 1 — Kiosk Quét Điện Thoại</span>
              <h3 className="text-base font-black uppercase tracking-wider mb-2">ĐƯA QR TRƯỚC CAMERA</h3>
            </div>

            {/* Viewport Frame */}
            <div className="relative z-10 w-[190px] h-[190px] rounded-2xl overflow-hidden border-2 border-[var(--primary)] shadow-[0_0_20px_var(--cyan-glow)] bg-black/40">
              <div id={scannerContainerId} className="w-full h-full" />
              {scanError ? (
                <div className="absolute inset-0 bg-red-950/90 backdrop-blur-sm flex items-center justify-center p-3 text-center">
                  <p className="text-[10px] font-black text-red-400 leading-normal">{scanError}</p>
                </div>
              ) : (
                <motion.div
                  animate={{ top: ["0%", "100%", "0%"] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute left-0 right-0 h-1 bg-[var(--primary)] shadow-[0_0_15px_var(--primary)] z-20"
                />
              )}
            </div>

            <p className="relative z-10 text-[10px] text-[var(--text-secondary)] leading-relaxed mt-3 font-semibold max-w-[220px]">
              Đưa mã QR trên ứng dụng của bạn trước camera Kiosk để xác thực tự động
            </p>
          </div>

          {/* Card B: Phone scans Kiosk */}
          <div
            className="p-6 rounded-[32px] border-[1.5px] border-[var(--card-border)] relative overflow-hidden flex flex-col items-center justify-between text-center min-h-[380px]"
            style={{
              background: 'var(--card-bg)',
              backdropFilter: 'blur(60px)',
              WebkitBackdropFilter: 'blur(60px)',
              boxShadow: 'var(--card-shadow), 0 20px 40px rgba(245,158,11,0.06)',
            }}
          >
            <div className="absolute inset-0" style={{ background: 'var(--sq-shine)' }} />

            <div className="relative z-10 w-full">
              <span className="caption mb-2.5 block text-[var(--warning)] font-black text-[10px]">Cách 2 — Điện Thoại Quét Kiosk</span>
              <h3 className="text-base font-black uppercase tracking-wider mb-2">DÙNG APP QUÉT KIOSK</h3>
            </div>

            {/* QR Canvas */}
            <div className="relative z-10 w-[190px] h-[190px] bg-white rounded-2xl overflow-hidden flex items-center justify-center p-3 shadow-inner">
              <QRCodeCanvas
                value={`EVCHARGER-${CHARGER_ID || ""}`}
                size={166}
                level="H"
                includeMargin={false}
              />
              <motion.div
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute left-0 right-0 h-1 bg-[var(--warning)] shadow-[0_0_15px_var(--warning)] z-20"
              />
            </div>

            <p className="relative z-10 text-[10px] text-[var(--text-secondary)] leading-relaxed mt-3 font-semibold max-w-[220px]">
              Mở app <span className="text-[var(--warning)] font-bold">EVOLT</span>, quét mã QR trên để xác thực quyền chủ xe và bắt đầu sạc
            </p>
          </div>

        </div>
      </div>

      {/* ── Footer: Station Dashboard Bar (amber/reserved theme) ── */}
      <footer className="relative z-10 mt-auto border-t pt-8 pb-2 flex justify-between items-center gap-8" style={{ borderColor: 'rgba(245,158,11,0.25)' }}>

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

        <div className="h-10 w-px opacity-30" style={{ background: 'rgba(245,158,11,0.4)' }} />

        {/* Block 2: Charger Info */}
        <div className="flex-1 flex flex-col gap-1 min-w-[200px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">TRỤ SẠC</span>
          <h4 className="text-base font-black text-[var(--text-primary)] leading-tight">
            {currentCharger?.name || (CHARGER_ID ? `Trụ (${CHARGER_ID.substring(0, 8)})` : "Chưa cấu hình")}
          </h4>
          <p className="text-xs font-semibold text-[var(--text-secondary)] leading-tight">
            <span className="font-black text-[var(--warning)]">{maxPowerKwText}</span> · {connectorsText}
          </p>
        </div>

        <div className="h-10 w-px opacity-30" style={{ background: 'rgba(245,158,11,0.4)' }} />

        {/* Block 3: Status Badge */}
        <div className="flex-shrink-0 flex flex-col gap-1.5 min-w-[150px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">TRẠNG THÁI TRỤ</span>
          <div>
            <span
              className="px-3.5 py-1 rounded-full text-[11px] font-black tracking-wider uppercase inline-flex items-center gap-2"
              style={{
                background: "rgba(245,158,11,0.15)",
                color: "#d97706",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#d97706] animate-pulse" />
              ĐÃ ĐẶT TRƯỚC
            </span>
          </div>
        </div>

        <div className="h-10 w-px opacity-30" style={{ background: 'rgba(245,158,11,0.4)' }} />

        {/* Block 4: System Branding / Specs */}
        <div className="flex flex-col gap-1 text-right min-w-[180px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">HỆ THỐNG</span>
          <h4 className="text-sm font-black text-[var(--text-primary)] leading-tight uppercase tracking-wider">
            EVOLT NETWORK
          </h4>
          <p className="text-[10px] font-bold tracking-widest opacity-60 text-[var(--warning)]">
            SECURE CHARGE PORTAL
          </p>
        </div>

      </footer>
    </motion.div>
  );
};

export default BookingConfirmationScreen;
