/**
 * EVOLTTOUCH Kiosk — Interim Charging Notice Screen
 * 
 * Shown when a walk-in user wants to charge but a booking is scheduled soon.
 */

import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, Zap, ArrowRight, X } from "lucide-react";

interface InterimNoticeScreenProps {
  onConfirm: () => void;
  onCancel: () => void;
  bookingTime?: string; // e.g. "11:30"
}

const InterimNoticeScreen: React.FC<InterimNoticeScreenProps> = ({
  onConfirm,
  onCancel,
  bookingTime = "11:30"
}) => {
  // Calculate stop time (5 mins before)
  const [hours, minutes] = bookingTime.split(":").map(Number);
  const stopDate = new Date();
  stopDate.setHours(hours);
  stopDate.setMinutes(minutes - 5);
  const stopTime = stopDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  return (
    <motion.div
      key="interim-notice"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="flex-1 flex items-center justify-center relative p-20"
    >
      {/* ── Ambient Glow BG ── */}
      <div className="ambient-glow bg-[var(--warning)] opacity-[0.1] w-[50%] h-[50%] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 blur-[120px]" />

      <div className="glass max-w-4xl w-full rounded-[48px] overflow-hidden relative z-10 flex flex-col shadow-[0_32px_80px_rgba(0,0,0,0.5)] border border-white/10">
        
        {/* Header */}
        <div className="bg-[var(--warning)]/10 px-12 py-10 flex items-center gap-6 border-b border-white/5">
          <div className="w-16 h-16 rounded-full bg-[var(--warning)] flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
            <AlertTriangle size={32} className="text-black" />
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Quy định ưu tiên</h2>
            <p className="caption !text-[var(--warning)]">TRẠM ĐÃ CÓ LỊCH ĐẶT TRƯỚC</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-12 py-12 space-y-10">
          <div className="space-y-4">
            <p className="text-2xl text-white/90 leading-relaxed font-medium">
              Trạm sạc này đã được khách hàng khác đặt lịch vào lúc <span className="text-[var(--warning)] font-bold">{bookingTime}</span>.
            </p>
            <p className="text-xl text-[var(--text-secondary)] leading-relaxed">
              Bạn vẫn có thể sạc ngay bây giờ, nhưng hệ thống sẽ <span className="text-white font-bold">tự động dừng sạc</span> vào lúc <span className="text-white font-bold">{stopTime}</span> (5 phút trước giờ hẹn) để đảm bảo quyền lợi cho khách đã đặt trước.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="glass-pill p-6 flex items-center gap-4 border-white/5">
              <Clock className="text-[var(--warning)]" size={24} />
              <div>
                <p className="caption">Thời gian còn lại</p>
                <p className="text-xl font-bold">~ 45 phút</p>
              </div>
            </div>
            <div className="glass-pill p-6 flex items-center gap-4 border-white/5">
              <Zap className="text-[var(--primary)]" size={24} />
              <div>
                <p className="caption">Tình trạng</p>
                <p className="text-xl font-bold">Sạc giới hạn giờ</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-12 py-10 bg-white/[0.02] flex gap-6 border-t border-white/5">
          <button 
            onClick={onCancel}
            className="flex-1 py-5 rounded-2xl border border-white/10 hover:bg-white/5 transition-all flex items-center justify-center gap-3 font-bold"
          >
            <X size={20} />
            HỦY BỎ
          </button>
          <button 
            onClick={onConfirm}
            className="flex-[2] py-5 rounded-2xl bg-[var(--warning)] hover:bg-[var(--warning)]/90 transition-all flex items-center justify-center gap-3 font-black text-black shadow-[0_8px_25px_rgba(245,158,11,0.3)]"
          >
            ĐỒNG Ý & BẮT ĐẦU SẠC
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default InterimNoticeScreen;
