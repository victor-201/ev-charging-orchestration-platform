/**
 * EVOLTTOUCH Kiosk — Booking Confirmation Screen
 * 
 * Shown when a charger is in 'reserved' state.
 * User must scan the QR code with their mobile app to confirm and start.
 */

import React from "react";
import { motion } from "framer-motion";
import { Zap, Calendar, QrCode, Clock, ArrowLeft } from "lucide-react";
import { CHARGER_ID } from "../api";

interface BookingConfirmationScreenProps {
  onCancel: () => void;
  // In a real app, this would be a dynamic check-in URL
  bookingId?: string;
}

const BookingConfirmationScreen: React.FC<BookingConfirmationScreenProps> = ({ 
  onCancel,
  bookingId = "B-9842" 
}) => {
  return (
    <motion.div
      key="booking-confirm"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-1 flex flex-col h-full relative"
    >
      {/* ── Ambient Glow BG ── */}
      <div className="ambient-glow bg-[var(--warning)] opacity-[0.08] w-[60%] h-[60%] top-[-10%] right-[-10%]" />
      <div className="ambient-glow bg-[var(--primary)] opacity-[0.05] w-[40%] h-[40%] bottom-[-5%] left-[-5%]" />

      {/* ── Header ── */}
      <header className="relative z-10 flex justify-between items-center mb-12">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 glass rounded-2xl flex items-center justify-center">
            <Calendar size={24} className="text-[var(--warning)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold uppercase tracking-widest text-[var(--warning)]">
              Trạm đã được đặt trước
            </h1>
            <p className="caption">Reserved Charger</p>
          </div>
        </div>

        <button 
          onClick={onCancel}
          className="glass-pill px-6 py-3 flex items-center gap-3 hover:bg-[var(--card-border)] transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-bold">QUAY LẠI</span>
        </button>
      </header>

      {/* ── Main Content ── */}
      <div className="relative z-10 flex-1 grid grid-cols-12 gap-10">
        
        {/* Left: Booking Details */}
        <div className="col-span-5 flex flex-col justify-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl font-black leading-tight">
              Xác nhận <br /> 
              <span className="text-[var(--warning)]">Đặt trạm</span>
            </h2>
            <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
              Trạm sạc này đang được giữ chỗ cho một khách hàng đã đặt trước qua ứng dụng EVOLT.
            </p>
          </div>

          <div className="glass p-8 rounded-[32px] space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[var(--warning)]/10 flex items-center justify-center">
                <Clock size={20} className="text-[var(--warning)]" />
              </div>
              <div>
                <p className="caption">Thời gian bắt đầu dự kiến</p>
                <p className="text-xl font-bold">Hôm nay, 10:30 — 11:00</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 border-t border-[var(--card-border)] pt-6">
              <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                <Zap size={20} className="text-[var(--primary)]" />
              </div>
              <div>
                <p className="caption">Mã đặt chỗ (Booking ID)</p>
                <p className="text-xl font-bold font-mono tracking-wider">{bookingId}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: QR Scan Area */}
        <div className="col-span-7 flex items-center justify-center">
          <div className="relative">
            {/* Animated scan corners */}
            <div className="absolute -top-4 -left-4 w-12 h-12 border-t-4 border-l-4 border-[var(--warning)] rounded-tl-xl" />
            <div className="absolute -top-4 -right-4 w-12 h-12 border-t-4 border-r-4 border-[var(--warning)] rounded-tr-xl" />
            <div className="absolute -bottom-4 -left-4 w-12 h-12 border-b-4 border-l-4 border-[var(--warning)] rounded-bl-xl" />
            <div className="absolute -bottom-4 -right-4 w-12 h-12 border-b-4 border-r-4 border-[var(--warning)] rounded-br-xl" />

            <div className="qr-container p-10 bg-white rounded-[40px] shadow-[0_0_60px_rgba(245,158,11,0.2)]">
              {/* Actual QR Mock */}
              <div className="w-64 h-64 bg-slate-100 rounded-2xl flex items-center justify-center relative overflow-hidden">
                <QrCode size={200} className="text-slate-900" />
                {/* Moving scan line */}
                <motion.div 
                  animate={{ top: ["0%", "100%", "0%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-1 bg-[var(--warning)] shadow-[0_0_15px_var(--warning)] z-20"
                />
              </div>
            </div>
            
            <div className="mt-10 text-center space-y-2">
              <p className="text-xl font-bold tracking-wide">QUÉT ĐỂ BẮT ĐẦU</p>
              <p className="caption max-w-[300px] mx-auto text-center">
                Mở ứng dụng EVOLT và quét mã QR trên màn hình để xác nhận phiên sạc của bạn.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="relative z-10 mt-auto pt-8 flex justify-between items-end">
        <div>
          <p className="caption mb-1">Trạng thái trạm</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--warning)] animate-pulse" />
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--warning)]">
              RESERVED — CHỜ XÁC NHẬN
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="caption mb-1">Thiết bị</p>
          <p className="text-sm font-bold uppercase tracking-widest">{CHARGER_ID}</p>
        </div>
      </footer>
    </motion.div>
  );
};

export default BookingConfirmationScreen;
