/**
 * EVOLTTOUCH Kiosk — Maintenance Screen
 * 
 * Shown when the charger is in 'faulted' or 'maintenance' state.
 */

import React from "react";
import { motion } from "framer-motion";
import { Hammer, AlertCircle, Phone, Info, ZapOff } from "lucide-react";
import { CHARGER_ID } from "../api";

const MaintenanceScreen: React.FC = () => {
  return (
    <motion.div
      key="maintenance"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center relative p-20"
    >
      {/* ── Ambient Glow BG (Gray/Dim) ── */}
      <div className="ambient-glow bg-slate-500 opacity-[0.05] w-[60%] h-[60%] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <div className="grid-overlay opacity-30" />

      {/* ── Main Card ── */}
      <div className="relative z-10 max-w-3xl w-full text-center space-y-12">
        
        {/* Animated Icon Container */}
        <div className="relative inline-block">
          <motion.div 
            animate={{ 
              scale: [1, 1.05, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-32 h-32 glass rounded-[40px] flex items-center justify-center relative z-10 mx-auto border-white/10"
          >
            <Hammer size={48} className="text-slate-400" />
          </motion.div>
          {/* Pulsing Alert Circle */}
          <motion.div 
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -top-4 -right-4 w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center border border-white/10"
          >
            <ZapOff size={20} className="text-slate-500" />
          </motion.div>
        </div>

        <div className="space-y-6">
          <h1 className="text-6xl font-black tracking-tight leading-tight uppercase">
            Trạm đang <br />
            <span className="text-slate-500">Bảo trì</span>
          </h1>
          <p className="text-xl text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
            Chúng tôi đang tiến hành kiểm tra kỹ thuật định kỳ hoặc sửa chữa để đảm bảo an toàn tuyệt đối cho quý khách.
          </p>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-6 pt-4">
          <div className="glass p-6 rounded-3xl border-white/5 flex flex-col items-center gap-3">
            <Info size={24} className="text-slate-400" />
            <div>
              <p className="caption">Dự kiến hoàn thành</p>
              <p className="text-lg font-bold">~ 14:00 Hôm nay</p>
            </div>
          </div>
          <div className="glass p-6 rounded-3xl border-white/5 flex flex-col items-center gap-3">
            <Phone size={24} className="text-[var(--primary)]" />
            <div>
              <p className="caption">Hỗ trợ kỹ thuật</p>
              <p className="text-lg font-bold">1900 6000</p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-10 flex flex-col items-center gap-2">
          <p className="caption">Mã thiết bị: {CHARGER_ID}</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-slate-600" />
            <p className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">
              Offline for technical inspection
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default MaintenanceScreen;
