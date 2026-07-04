/**
 * EVOLTTOUCH Kiosk — Billed / Session Complete Screen
 *
 * Final state after billing is computed.
 * Shows:
 *   - Session summary (kWh, duration, cost)
 *   - VNPay QR code for walk-in cash payment
 *
 * Business Function [22] → [24]/[25]: Session completed → billing
 * API [69]: POST /payments/create → paymentUrl → QR render
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Zap, RotateCcw, Loader2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import type { StopSessionResponse, PricingInfo } from '../../domain/entities/entities';

interface BilledScreenProps {
  summary: StopSessionResponse;
  vnpayUrl: string | null;
  isPaid?: boolean;
  isAppUserSession?: boolean;
  pricing: PricingInfo | null;
  onReset: () => void;
}

const BilledScreen: React.FC<BilledScreenProps> = ({ summary, vnpayUrl, isPaid, isAppUserSession, pricing, onReset }) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!isPaid) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaid, onReset]);

  const durationMs = new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime();
  const durationMin = Math.round(durationMs / 60000);

  const startPricePerKwh = pricing?.pricePerKwh ?? 3500;
  const startIdleFeePerMin = pricing?.idleFeePerMinute ?? 1000;

  const energyFee = summary.energyFeeVnd ?? (summary.totalKwh * startPricePerKwh);
  const idleFee = summary.idleFeeVnd ?? Math.max(0, summary.totalCostVnd - energyFee);
  const idleMinutes = idleFee > 0 ? Math.round(idleFee / startIdleFeePerMin) : 0;

  const chargingDurationMin = Math.max(0, durationMin - idleMinutes);
  const chargingEndTime = new Date(new Date(summary.startTime).getTime() + chargingDurationMin * 60000);

  // Fallback QR data if no URL
  const qrData = vnpayUrl ||
    `EVOLT:SESSION:${summary.id}:AMOUNT:${summary.totalCostVnd}:TIME:${summary.endTime}`;

  return (
    <motion.div
      key="billed"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="flex-1 flex items-center justify-center"
    >
      {/* Success ambient glow */}
      <div className="ambient-glow bg-[var(--success)] opacity-[0.06] w-[60%] h-[60%] top-[-10%] left-[20%]" />

      <div className="glass-elevated p-8 md:p-12 w-full max-w-5xl grid grid-cols-2 gap-8 md:gap-12 min-h-0">

        {/* ── LEFT: Summary ── */}
        <div className="flex flex-col justify-between">
          <div className="space-y-6">
            {/* Icon + Title */}
            <div className="space-y-4">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 bg-[var(--success)]/10 rounded-3xl flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-[var(--success)]" />
                </div>
                <motion.div
                  className="animate-success-ping absolute inset-0 rounded-3xl bg-[var(--success)]/20"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                />
              </div>
              <div>
                <h1 className="text-5xl font-black tracking-tighter leading-tight">
                  PHIÊN SẠC<br />
                  <span className="text-gradient">HOÀN TẤT</span>
                </h1>
                <p className="text-[var(--text-secondary)] mt-2 font-medium text-base">
                  Xe của bạn đã được sạc thành công.
                </p>
              </div>
            </div>

            {/* Session Details */}
            <div className="border-y border-[var(--card-border)] py-6 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-muted)] mb-2">Chi tiết hóa đơn</h3>
              
              {/* Tiền điện sạc */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold">
                    <Zap size={16} className="text-[var(--primary)]" />
                    <span>Tiền điện sạc</span>
                  </div>
                  <span className="text-xl font-bold text-[var(--text-primary)]">
                    {Math.round(energyFee).toLocaleString('vi-VN')} ₫
                  </span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] pl-6 space-y-0.5">
                  <p>• Chi tiết: Điện năng tiêu thụ thực tế của xe trong phiên sạc.</p>
                  <p>• Công thức: {summary.totalKwh.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh × {startPricePerKwh.toLocaleString('vi-VN')} ₫/kWh</p>
                  <p>• Thời gian: {new Date(summary.startTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} - {chargingEndTime.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} (ngày {new Date(summary.startTime).toLocaleDateString("vi-VN")})</p>
                </div>
              </div>

              {/* Phí nhàn rỗi */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold">
                    <Clock size={16} className={idleFee > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'} />
                    <span>Phí nhàn rỗi</span>
                  </div>
                  <span className={`text-xl font-bold ${idleFee > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                    {Math.round(idleFee).toLocaleString('vi-VN')} ₫
                  </span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] pl-6 space-y-0.5">
                  <p>• Chi tiết: Áp dụng khi sạc đầy quá {(pricing?.idleGraceMinutes ?? 20)} phút ân hạn nhưng chưa rút sạc.</p>
                  {idleFee > 0 ? (
                    <>
                      <p>• Công thức: {idleMinutes} phút × {startIdleFeePerMin.toLocaleString('vi-VN')} ₫/phút</p>
                      <p>• Thời gian: Tính từ {new Date(chargingEndTime.getTime() + (pricing?.idleGraceMinutes ?? 15) * 60000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} đến {new Date(summary.endTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
                    </>
                  ) : (
                    <p>• Trạng thái: Không phát sinh (rút cáp trước thời hạn tính phí phạt).</p>
                  )}
                </div>
              </div>
            </div>

            {/* Total Cost — Hero */}
            <div className="flex justify-between items-end">
              <div>
                <p className="caption mb-2">Tổng thanh toán</p>
                <div className="flex items-baseline gap-2">
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                    className="text-[64px] font-black tabular-nums leading-none text-gradient"
                  >
                    {summary.totalCostVnd.toLocaleString('vi-VN')}
                  </motion.span>
                  <span className="text-[42px] font-bold text-[var(--text-secondary)] opacity-50">₫</span>
                </div>
              </div>
            </div>
          </div>

          {/* Reset Button */}
          {isPaid && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="btn-secondary flex items-center justify-center gap-3 mt-6 py-4 w-full"
              onClick={onReset}
            >
              <RotateCcw size={18} />
              {`PHIÊN SẠC MỚI (${countdown}s)`}
            </motion.button>
          )}
        </div>

        {/* ── RIGHT: States ── */}
        <div className="glass bg-transparent border-none p-8 flex flex-col items-center justify-center gap-6">
          {isPaid ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center gap-4">
              <CheckCircle2 size={64} className="text-[var(--success)]" />
              <h3 className="text-2xl font-black">Thanh toán hoàn tất!</h3>
              <p className="text-[var(--text-secondary)]">
                {isAppUserSession ? 'Giao dịch đã được trừ tự động từ ví Evolt.' : 'Hóa đơn đã được thanh toán qua VNPay.'}
              </p>
            </motion.div>
          ) : isAppUserSession ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-center gap-4">
              <Loader2 size={64} className="text-[var(--primary)] animate-spin" />
              <h3 className="text-2xl font-black">Đang xác nhận</h3>
              <p className="text-[var(--text-secondary)]">Đang xử lý trừ tiền từ tài khoản ứng dụng của bạn...</p>
            </motion.div>
          ) : (
            <>
              <div className="text-center space-y-1">
                <p className="caption-branded">Hóa đơn điện tử</p>
                <h3 className="text-xl font-bold">Quét để thanh toán</h3>
              </div>
              <QRCodeCanvas value={qrData} size={180} level="H" />
              <div className="glass-pill px-5 py-2 flex items-center gap-2 mt-2">
                <span className="text-xs text-[var(--text-muted)]">Mã phiên:</span>
                <span className="text-xs font-mono font-bold text-[var(--primary)]">
                  #{summary.id.split('-').pop()?.toUpperCase()}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const SummaryRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="flex justify-between items-center">
    <div className="flex items-center gap-2 text-[var(--text-secondary)] font-medium">
      {icon}
      <span>{label}</span>
    </div>
    <span className="text-xl font-bold">{value}</span>
  </div>
);

export default BilledScreen;
