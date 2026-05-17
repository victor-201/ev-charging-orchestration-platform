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

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Zap, RotateCcw } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import type { StopSessionResponse } from '../types';

interface BilledScreenProps {
  summary: StopSessionResponse;
  vnpayUrl: string | null;
  onReset: () => void;
}

const BilledScreen: React.FC<BilledScreenProps> = ({ summary, vnpayUrl, onReset }) => {
  const [qrError, setQrError] = useState(false);

  const durationMs = new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime();
  const durationMin = Math.round(durationMs / 60000);

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
            <div className="border-y border-white/[0.06] py-6 space-y-3">
              <SummaryRow
                icon={<Zap size={16} className="text-[var(--primary)]" />}
                label="Điện năng đã sạc"
                value={`${summary.totalKwh.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`}
              />
              <SummaryRow
                icon={<Clock size={16} className="text-[var(--text-muted)]" />}
                label="Thời gian sạc"
                value={`${durationMin} phút`}
              />
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
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="btn-secondary flex items-center justify-center gap-3 mt-6 py-4"
            onClick={onReset}
          >
            <RotateCcw size={18} />
            PHIÊN SẠC MỚI
          </motion.button>
        </div>

        {/* ── RIGHT: QR Payment ── */}
        <div className="glass bg-white/[0.02] border-none p-8 flex flex-col items-center justify-center gap-6">
          <div className="text-center space-y-1">
            <p className="caption-branded">Hóa đơn điện tử</p>
            <h3 className="text-xl font-bold">Quét để thanh toán</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {vnpayUrl ? 'Hỗ trợ VNPay QR / Banking App' : 'Mã phiên sạc'}
            </p>
          </div>

          {/* QR Code */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 160 }}
            className="qr-container"
          >
            {!qrError ? (
              <QRCodeCanvas
                value={qrData}
                size={180}
                level="H"
                includeMargin={false}
              />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center">
                <p className="text-center text-sm text-gray-400">QR không khả dụng</p>
              </div>
            )}
          </motion.div>

          {/* Payment Methods */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-4 items-center opacity-50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                <span className="text-xs font-bold tracking-widest uppercase">Secured by EVOLT</span>
              </div>
            </div>

            <div className="glass-pill px-5 py-2 flex items-center gap-2 mt-2">
              <span className="text-xs text-[var(--text-muted)]">Mã phiên:</span>
              <span className="text-xs font-mono font-bold text-[var(--primary)]">
                #{summary.id.split('-').pop()?.toUpperCase()}
              </span>
            </div>
          </div>
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
