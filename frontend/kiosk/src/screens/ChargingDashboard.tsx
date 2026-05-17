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
 */

import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Power,
  Zap,
  Activity,
  Thermometer,
  Clock,
  DollarSign,
} from "lucide-react";
import type { TelemetryData, ChargingSession, PricingInfo } from "../types";

interface ChargingDashboardProps {
  telemetry: TelemetryData;
  session: ChargingSession;
  pricing: PricingInfo | null;
  onStop: () => Promise<void>;
}

// SVG ring math
const RING_RADIUS = 230;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const formatNumber = (num: number, decimals: number = 2) => {
  return num.toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

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
        new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
      // Capture the cost and energy at the moment of 100% SoC
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
            <span className="text-xs font-bold tracking-widest uppercase">
              Đang sạc
            </span>
          </div>
          <div className="h-5 w-px bg-white/10" />
          <span className="text-xs font-mono text-[var(--text-muted)] tracking-wider">
            SESSION #{sessionIdShort}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div 
            className={`glass-pill px-5 py-2.5 flex items-center gap-3 transition-all duration-500 ${
              telemetry.soc >= 99 ? "animate-pulse-danger" : ""
            }`}
            style={telemetry.soc >= 99 ? {
              borderColor: 'rgba(239, 68, 68, 0.6)',
              backgroundColor: 'transparent',
              boxShadow: '0 0 25px rgba(239, 68, 68, 0.4)',
              color: '#ef4444'
            } : {}}
          >
            <Clock 
              size={20} 
              className={telemetry.soc >= 99 
                ? "text-[var(--danger)] drop-shadow-[0_0_8px_rgba(255,59,48,0.6)]" 
                : "text-[var(--primary)]"
              } 
            />
            <span className={`text-xl font-mono font-black ${
              telemetry.soc >= 99 
                ? "text-[var(--danger)] drop-shadow-[0_0_8px_rgba(255,59,48,0.6)]" 
                : ""
            }`}>
              {elapsedLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="relative z-10 flex-1 grid grid-cols-12 gap-6">
        {/* ── LEFT: Central SoC Visualizer ── */}
        <div className="col-span-7 glass flex flex-col items-center justify-center relative overflow-hidden">
          {/* Inner grid overlay */}
          <div className="absolute inset-0 grid-overlay opacity-30 rounded-[28px]" />

          {/* SVG Circular Ring */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-10">
            <svg viewBox="0 0 500 500" className="progress-ring w-full h-full max-w-[460px] max-h-[460px]">
              <defs>
                <linearGradient
                  id="ring-gradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
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

              {/* Background track */}
              <circle
                cx="250"
                cy="250"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="14"
              />
              {/* Progress arc */}
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
                <span className="text-[clamp(1.5rem,2.5vw,40px)] font-bold text-[var(--primary)] mb-2">
                  %
                </span>
              </motion.div>
              <p className="caption mt-2">Mức pin (SoC)</p>
            </div>

          {/* HUD Corners */}
          <div className="absolute top-8 left-8 space-y-6">
            <HudMetric
              icon={<Activity size={14} />}
              label="Công suất"
              value={formatNumber(telemetry.power, 1)}
              unit="kW"
              highlight
            />
            <HudMetric
              icon={<Zap size={14} />}
              label="Điện áp"
              value={formatNumber(telemetry.voltage, 1)}
              unit="V"
            />
          </div>
          <div className="absolute bottom-8 right-8 text-right space-y-6">
            <HudMetric
              icon={<Thermometer size={14} />}
              label="Nhiệt độ pin"
              value={formatNumber(telemetry.temperature, 1)}
              unit="°C"
              align="right"
            />
            <HudMetric
              icon={<Activity size={14} />}
              label="Dòng điện"
              value={formatNumber(telemetry.current, 1)}
              unit="A"
              align="right"
              highlight
            />
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
                animate={{ 
                  y: 0, 
                  opacity: 1,
                  scale: idleFee > 0 ? 0.8 : 1,
                }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="flex items-baseline gap-3 origin-left"
              >
                <span className="text-[64px] font-black tabular-nums leading-none">
                  {chargingFee.toLocaleString("vi-VN")}
                </span>
                <span className="text-[43px] font-black text-[var(--text-secondary)] opacity-50">
                  ₫
                </span>
              </motion.div>

              {/* Idle Fee — Appears right below hero cost, right-aligned */}
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

            <div className="border-t border-white/[0.06] pt-5 space-y-3">
              <BillingRow
                label="Giá điện"
                value={
                  pricing
                    ? `${pricing.pricePerKwh.toLocaleString()} ₫/kWh`
                    : "—"
                }
              />
              <BillingRow
                label="Phí nhàn rỗi (Đơn giá)"
                value={
                  pricing
                    ? `${pricing.idleFeePerMinute.toLocaleString()} ₫/phút`
                    : "—"
                }
              />
              <BillingRow
                label="Giờ bắt đầu"
                value={new Date(session.startTime).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
              {fullChargeTime && (
                <BillingRow label="Giờ sạc đầy" value={fullChargeTime} />
              )}
            </div>
          </div>

          {/* Session Summary Chips */}
          <div className={`grid gap-4 ${telemetry.soc >= 100 ? "grid-cols-2" : "grid-cols-1"}`}>
            <MetricChip
              label="Điện năng tiêu thụ"
              value={formatNumber(energyConsumed, 2)}
              unit="kWh"
            />
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
            {/* Border Spirit Animation (2 spirits via Framer Motion for precision) */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <motion.div
                animate={{
                  top: ["0%", "100%", "100%", "0%", "0%"],
                  left: ["100%", "100%", "0%", "0%", "100%"],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "linear",
                  times: [0, 0.15, 0.5, 0.65, 1],
                }}
                style={{ position: 'absolute', width: 8, height: 8, background: 'var(--danger)', borderRadius: '50%', filter: 'blur(2px)', boxShadow: '0 0 12px var(--danger), 0 0 24px var(--danger)', transform: 'translate(-50%, -50%)', zIndex: 10 }}
              />
              <motion.div
                animate={{
                  top: ["100%", "0%", "0%", "100%", "100%"],
                  left: ["0%", "0%", "100%", "100%", "0%"],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "linear",
                  times: [0, 0.15, 0.5, 0.65, 1],
                }}
                style={{ position: 'absolute', width: 8, height: 8, background: 'var(--danger)', borderRadius: '50%', filter: 'blur(2px)', boxShadow: '0 0 12px var(--danger), 0 0 24px var(--danger)', transform: 'translate(-50%, -50%)', zIndex: 10 }}
              />
            </div>
            
            <Power size={20} className="relative z-10" />
            <span className="relative z-10">DỪNG SẠC</span>
          </motion.button>
        </div>
      </div>

      {/* ── Stop Confirmation Modal Overlay ── */}
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
                  onClick={() => {
                    setIsConfirmingStop(false);
                    onStop();
                  }}
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

// ── Sub-components ──

const HudMetric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  align?: "left" | "right";
  highlight?: boolean;
}> = ({ icon, label, value, unit, align = "left", highlight = false }) => (
  <div className={align === "right" ? "text-right" : "text-left"}>
    <div
      className={`flex items-center gap-1.5 caption mb-1.5 ${align === "right" ? "justify-end" : ""}`}
    >
      <span className="text-[var(--primary)]">{icon}</span>
      {label}
    </div>
    <p className="text-3xl font-bold tabular-nums flex items-baseline gap-1">
      <span className={highlight ? "text-gradient" : ""}>{value}</span>
      <span className="text-xl font-bold opacity-40">{unit}</span>
    </p>
  </div>
);

const BillingRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex justify-between items-center text-base">
    <span className="text-[var(--text-muted)] font-medium">{label}</span>
    <span className="font-bold">{value}</span>
  </div>
);

const MetricChip: React.FC<{ label: string; value: string; unit?: string; variant?: "default" | "danger" }> = ({
  label,
  value,
  unit,
  variant = "default"
}) => (
  <div className={`metric-card transition-all duration-500 flex flex-col justify-center items-center py-6 ${
    variant === "danger" ? "bg-[var(--danger)]/10 border border-[var(--danger)]/50 shadow-[0_0_20px_rgba(255,59,48,0.2)]" : ""
  }`}>
    <p className={`mb-3 text-base font-bold uppercase tracking-widest ${
      variant === "danger" ? "text-[var(--danger)] opacity-90" : "text-[var(--text-secondary)] opacity-70"
    }`}>{label}</p>
    <p className={`text-4xl font-black tabular-nums flex items-baseline gap-2 ${
      variant === "danger" ? "text-[var(--danger)] drop-shadow-[0_0_8px_rgba(255,59,48,0.5)]" : ""
    }`}>
      <span>{value}</span>
      {unit && <span className="text-2xl font-black opacity-40">{unit}</span>}
    </p>
  </div>
);

export default ChargingDashboard;
