/**
 * EVOLTTOUCH Kiosk — Charging Dashboard (ACTIVE State)
 *
 * The primary operational screen.
 * Displays real-time telemetry from WebSocket:
 *   - SoC % (State of Charge) as large circular progress ring
 *   - kWh delivered, power kW, voltage V
 *   - Estimated cost (taxi-meter style, updates each second)
 *   - Session timer
 * Actions: Stop session button
 *
 * L-RE-2: 1:1 FSM state mapping (ACTIVE)
 * L-RE-4: All colors via CSS Custom Properties (var(--*))
 *
 * Sub-components split per L-RE-5 (≤100 lines each):
 *   - HudMetric   → ./widgets/HudMetric.tsx
 *   - BillingRow  → ./widgets/BillingRow.tsx
 *   - MetricChip  → ./widgets/MetricChip.tsx
 */

import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Power,
  Zap,
  Activity,
  Thermometer,
  Clock,
} from "lucide-react";
import type { TelemetryData, ChargingSession, PricingInfo } from "../types";
import HudMetric from "./widgets/HudMetric";
import BillingRow from "./widgets/BillingRow";
import MetricChip from "./widgets/MetricChip";

interface ChargingDashboardProps {
  telemetry: TelemetryData;
  session: ChargingSession;
  pricing: PricingInfo | null;
  onStop: () => Promise<void>;
}

// SVG ring math
const RING_RADIUS = 230;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const formatNumber = (num: number, decimals: number = 2) =>
  num.toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const ChargingDashboard: React.FC<ChargingDashboardProps> = ({
  telemetry,
  session,
  pricing,
  onStop,
}) => {
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const [fullChargeTime, setFullChargeTime] = useState<string | null>(null);
  const [finalChargingCost, setFinalChargingCost] = useState<number | null>(null);
  const [finalEnergyDelivered, setFinalEnergyDelivered] = useState<number | null>(null);

  useEffect(() => {
    if (telemetry.soc >= 100 && !fullChargeTime) {
      setFullChargeTime(
        new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      );
      setFinalChargingCost(telemetry.estimatedCost);
      setFinalEnergyDelivered(telemetry.energyDelivered);
    }
  }, [telemetry.soc, fullChargeTime, telemetry.estimatedCost, telemetry.energyDelivered]);

  const chargingFee = finalChargingCost !== null ? finalChargingCost : telemetry.estimatedCost;
  const idleFee = finalChargingCost !== null ? Math.max(0, telemetry.estimatedCost - finalChargingCost) : 0;
  const energyConsumed = finalEnergyDelivered !== null ? finalEnergyDelivered : telemetry.energyDelivered;

  const offset = useMemo(
    () => RING_CIRCUMFERENCE * (1 - telemetry.soc / 100),
    [telemetry.soc],
  );

  const elapsedLabel = useMemo(() => {
    const m = Math.floor(telemetry.elapsedSeconds / 60);
    const s = telemetry.elapsedSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [telemetry.elapsedSeconds]);

  const sessionIdShort = session.id.split("-").pop()?.toUpperCase() ?? "—";
  const isFull = telemetry.soc >= 99;

  return (
    <motion.div
      key="charging"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="flex-1 flex flex-col h-full"
    >
      {/* Ambient BG — active charging = cyan glow */}
      <div className="ambient-glow bg-[var(--primary)] opacity-[0.08] w-[45%] h-[45%] top-[-10%] right-[-5%]" />

      {/* ── Status Bar ── */}
      <div className="relative z-10 flex justify-between items-center mb-8">
        <div className="flex items-center gap-5">
          <div className="glass-pill px-5 py-2.5 flex items-center gap-2.5">
            <span className="status-dot active" />
            <span className="text-xs font-bold tracking-widest uppercase">Đang sạc</span>
          </div>
          <div className="h-5 w-px bg-[var(--card-border)]" />
          <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider">
            SESSION #{sessionIdShort}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`glass-pill px-5 py-2.5 flex items-center gap-3 transition-all duration-500 ${
              isFull ? "animate-pulse-danger" : ""
            }`}
            style={isFull ? {
              borderColor: "var(--danger)",
              boxShadow: "0 0 25px var(--red-glow)",
              color: "var(--danger)",
            } : {}}
          >
            <Clock
              size={20}
              className={isFull ? "text-[var(--danger)]" : "text-[var(--primary)]"}
            />
            <span
              className={`text-xl font-mono font-black ${
                isFull ? "text-[var(--danger)]" : ""
              }`}
            >
              {elapsedLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="relative z-10 flex-1 grid grid-cols-12 gap-6">
        {/* ── LEFT: Central SoC Visualizer ── */}
        <div className="col-span-7 glass flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 grid-overlay opacity-30 rounded-[28px]" />

          {/* SVG Circular Ring */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-10">
            <svg viewBox="0 0 500 500" className="progress-ring w-full h-full max-w-[460px] max-h-[460px]">
              <defs>
                <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--primary)" />
                  <stop offset="100%" stopColor="var(--secondary)" />
                </linearGradient>
                <filter id="ring-glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle cx="250" cy="250" r={RING_RADIUS} fill="none" stroke="var(--card-border)" strokeWidth="14" />
              <motion.circle
                cx="250"
                cy="250"
                r={RING_RADIUS}
                fill="none"
                stroke="url(#ring-gradient)"
                strokeWidth="14"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
                strokeLinecap="round"
                filter="url(#ring-glow)"
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </svg>
          </div>

          {/* Center content */}
          <div className="relative z-10 flex flex-col items-center text-center mt-4">
            <motion.div
              key={telemetry.soc}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex items-baseline gap-2"
            >
              <span className="text-[clamp(4rem,7vw,130px)] font-black leading-none tracking-tighter tabular-nums">
                {telemetry.soc}
              </span>
              <span className="text-[clamp(1.5rem,2.5vw,40px)] font-bold text-[var(--primary)] mb-2">%</span>
            </motion.div>
            <p className="caption mt-2">Mức pin (SoC)</p>
          </div>

          {/* HUD Corners */}
          <div className="absolute top-8 left-8 space-y-6">
            <HudMetric icon={<Activity size={14} />} label="Công suất" value={formatNumber(telemetry.power, 1)} unit="kW" highlight />
            <HudMetric icon={<Zap size={14} />}      label="Điện áp"  value={formatNumber(telemetry.voltage, 1)} unit="V" />
          </div>
          <div className="absolute bottom-8 right-8 text-right space-y-6">
            <HudMetric icon={<Thermometer size={14} />} label="Nhiệt độ pin" value={formatNumber(telemetry.temperature, 1)} unit="°C" align="right" />
            <HudMetric icon={<Activity size={14} />}    label="Dòng điện"   value={formatNumber(telemetry.current, 1)}     unit="A"  align="right" highlight />
          </div>
        </div>

        {/* ── RIGHT: Billing + Info + Action ── */}
        <div className="col-span-5 flex flex-col gap-5">
          {/* Billing Card — Taxi Meter Style */}
          <div className="glass flex-1 p-8 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-[var(--primary)]/5 blur-3xl rounded-full pointer-events-none" />

            <div>
              <p className="caption-branded mb-5">Tiền điện sạc</p>
              <motion.div
                key={Math.floor(chargingFee / 1000)}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1, scale: idleFee > 0 ? 0.8 : 1 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="flex items-baseline gap-3 origin-left"
              >
                <span className="text-[64px] font-black tabular-nums leading-none">
                  {chargingFee.toLocaleString("vi-VN")}
                </span>
                <span className="text-[43px] font-black text-[var(--text-secondary)] opacity-50">₫</span>
              </motion.div>

              <AnimatePresence>
                {idleFee > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col items-end mt-2 pr-4"
                  >
                    <p className="text-sm font-bold text-[var(--danger)] uppercase tracking-widest opacity-80 mb-1">
                      + Phí nhàn rỗi
                    </p>
                    <p className="text-[38px] font-black text-[var(--danger)] tabular-nums leading-none">
                      {idleFee.toLocaleString("vi-VN")}
                      <span className="text-[25px] font-black ml-2 opacity-60">₫</span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-[var(--card-border)] pt-5 space-y-3">
              <BillingRow label="Giá điện" value={pricing ? `${pricing.pricePerKwh.toLocaleString()} ₫/kWh` : "—"} />
              <BillingRow label="Phí nhàn rỗi (Đơn giá)" value={pricing ? `${pricing.idleFeePerMinute.toLocaleString()} ₫/phút` : "—"} />
              <BillingRow
                label="Giờ bắt đầu"
                value={new Date(session.startTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              />
              {fullChargeTime && <BillingRow label="Giờ sạc đầy" value={fullChargeTime} />}
            </div>
          </div>

          {/* Session Summary Chips */}
          <div className={`grid gap-4 ${telemetry.soc >= 100 ? "grid-cols-2" : "grid-cols-1"}`}>
            <MetricChip label="Điện năng tiêu thụ" value={formatNumber(energyConsumed, 2)} unit="kWh" />
            {telemetry.soc >= 100 && (
              <MetricChip
                label="Tổng thanh toán"
                value={telemetry.estimatedCost.toLocaleString("vi-VN")}
                unit="₫"
                variant="danger"
              />
            )}
          </div>

          {/* Stop Button */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="btn-danger w-full py-5 flex items-center justify-center gap-3 text-base relative overflow-hidden group"
            onClick={() => setIsConfirmingStop(true)}
          >
            <span className="spirit-glow opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="spirit-glow-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Power size={20} className="relative z-10" />
            <span className="relative z-10">DỪNG SẠC</span>
          </motion.button>
        </div>
      </div>

      {/* ── Stop Confirmation Modal ── */}
      <AnimatePresence>
        {isConfirmingStop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="glass-elevated p-12 w-full max-w-lg flex flex-col items-center text-center gap-8"
            >
              <div className="w-20 h-20 rounded-full bg-[var(--danger)]/10 flex items-center justify-center">
                <Power size={36} className="text-[var(--danger)]" />
              </div>
              <div>
                <h2 className="text-3xl font-black mb-3">DỪNG PHIÊN SẠC?</h2>
                <p className="text-[var(--text-secondary)]">
                  Bạn có chắc chắn muốn kết thúc phiên sạc hiện tại và thanh toán?
                </p>
              </div>
              <div className="flex gap-6 w-full mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn-secondary flex-1"
                  onClick={() => setIsConfirmingStop(false)}
                >
                  HỦY
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn-danger flex-1"
                  onClick={() => { setIsConfirmingStop(false); onStop(); }}
                >
                  XÁC NHẬN
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ChargingDashboard;
