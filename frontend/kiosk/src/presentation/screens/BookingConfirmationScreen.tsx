/**
 * EVOLTTOUCH Kiosk — Booking Confirmation Screen (Hard Lock)
 * 
 * Shown when a charger is in 'reserved' state (within 10 minutes of booking).
 * Walk-ins are locked out. Only the booking owner can scan the QR to begin.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Zap, Calendar, Clock, ArrowLeft, ShieldAlert } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";
import { CHARGER_ID } from "../../data/sources/localStorage";

interface BookingConfirmationScreenProps {
  onCancel: () => void;
  onScanSuccess: (bookingId: string, qrToken: string) => void;
  bookingId?: string;
  bookingTimeRange?: string; // e.g. "10:30 — 11:00"
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

const BookingConfirmationScreen: React.FC<BookingConfirmationScreenProps> = ({ 
  onCancel,
  onScanSuccess,
  bookingId = "B-9842",
  bookingTimeRange = "Hôm nay, 10:30 — 11:00"
}) => {
  const scannerContainerId = "kiosk-reserved-scanner";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const bookingIdRef = useRef(bookingId);
  bookingIdRef.current = bookingId;

  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;

  const handleScanSuccessLocal = useCallback(
    (decodedText: string) => {
      // Stop scanner immediately
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }

      const rawToken = decodedText.trim();
      const currentBookingId = bookingIdRef.current;

      // 1. Check standard non-JWT format EV-XXXX-XXXX
      if (rawToken.startsWith("EV-") || !rawToken.includes(".")) {
        const shortId = currentBookingId.replace(/-/g, "").substring(0, 8).toUpperCase();
        if (rawToken.startsWith(`EV-${shortId}-`)) {
          onScanSuccessRef.current(currentBookingId, rawToken);
          return;
        }
      }

      // 2. Legacy/Fallback check: JWT decoding
      const payload = decodeJwtPayload(rawToken);

      if (payload && typeof payload.bookingId === "string" && payload.bookingId === currentBookingId) {
        onScanSuccessRef.current(currentBookingId, rawToken);
        return;
      }

      setScanError("Mã QR không khớp với lịch hẹn này.");
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
        } catch (e) {}
      }
      try {
        scannerRef.current.clear();
      } catch (e) {}
    }

    const html5QrCode = new Html5Qrcode(scannerContainerId);
    scannerRef.current = html5QrCode;

    try {
      const devices = await Html5Qrcode.getCameras();
      let cameraConfig: string | MediaTrackConstraints;
      if (devices && devices.length > 0) {
        cameraConfig = devices[0].id;
      } else {
        cameraConfig = { facingMode: "environment" };
      }

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 160, height: 160 },
          aspectRatio: 1.0,
        },
        handleScanSuccessLocal,
        () => {}
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
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        let cameraConfig: string | MediaTrackConstraints;
        if (devices && devices.length > 0) {
          cameraConfig = devices[0].id;
        } else {
          cameraConfig = { facingMode: "environment" };
        }

        await html5QrCode.start(
          cameraConfig,
          {
            fps: 10,
            qrbox: { width: 160, height: 160 },
            aspectRatio: 1.0,
          },
          handleScanSuccessLocal,
          () => {}
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

        <button 
          onClick={onCancel}
          className="glass-pill px-6 py-3.5 flex items-center gap-3 border-[var(--pill-border)] text-xs font-black uppercase tracking-wider transition-all duration-200 active:scale-95 hover:scale-105 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>QUAY LẠI</span>
        </button>
      </header>

      {/* ── Main Content ── */}
      <div className="relative z-10 flex-1 grid grid-cols-12 gap-8 items-center">
        
        {/* Left: Booking Details */}
        <div className="col-span-4 flex flex-col space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[var(--warning)] font-black text-xs uppercase tracking-wider">
              <ShieldAlert size={14} />
              Chế độ khóa cứng (10 phút)
            </div>
            <h2 className="text-[38px] font-black leading-[1.1] tracking-tight">
              Giữ Trạm <br /> 
              <span className="text-[var(--warning)]">Đã Đặt Trước</span>
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-medium">
              Cổng sạc này hiện đang được giữ chỗ cố định cho khách hàng đã đặt lịch trên ứng dụng EVOLT. Walk-in tạm thời bị khóa.
            </p>
          </div>

          <div className="glass p-6 rounded-[28px] border-[var(--card-border)] space-y-4 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: 'var(--sq-shine)' }} />
            
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-10 h-10 rounded-[14px] bg-[var(--warning)]/15 border border-[var(--warning)]/20 flex items-center justify-center">
                <Clock size={18} className="text-[var(--warning)]" />
              </div>
              <div>
                <p className="caption text-[10px]">Khung giờ đặt trước</p>
                <p className="text-base font-black text-[var(--text-primary)]">{bookingTimeRange}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 border-t border-[var(--card-border)] pt-4 relative z-10">
              <div className="w-10 h-10 rounded-[14px] bg-[var(--primary)]/15 border border-[var(--primary)]/20 flex items-center justify-center">
                <Zap size={18} className="text-[var(--primary)]" />
              </div>
              <div>
                <p className="caption text-[10px]">Mã đặt chỗ (Booking ID)</p>
                <p className="text-base font-black text-[var(--text-primary)] font-mono tracking-wider">{bookingId}</p>
              </div>
            </div>
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

      {/* ── Footer ── */}
      <footer className="relative z-10 mt-auto border-t border-[var(--card-border)] pt-6 flex justify-between items-center">
        <div>
          <p className="caption text-[10px] mb-0.5">Trạng thái cổng sạc</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--warning)] animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--warning)]">
              RESERVED — ĐANG KHOÁ CỨNG
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="caption text-[10px] mb-0.5">Thiết bị</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)]">{CHARGER_ID || "Chưa cấu hình"}</p>
        </div>
      </footer>
    </motion.div>
  );
};

export default BookingConfirmationScreen;
