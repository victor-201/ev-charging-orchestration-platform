/**
 * EVOLTTOUCH Vision Enterprise — App Root (v7.0)
 *
 * Orchestrates the 4-state charging session lifecycle:
 *   INIT → ACTIVE → STOPPED → BILLED
 *
 * Design: Apple Vision Pro / Liquid Glass / Enterprise
 * Theme: theme_design.md (Enterprise Liquid Glass Design System)
 *
 * Integration points:
 *   - useSessionStateMachine: API calls for start/stop session
 *   - useWebSocket: real-time telemetry (SoC, kWh, power, cost)
 *   - Screens: WelcomeScreen, ChargingDashboard, ProcessingScreen, BilledScreen, ErrorScreen
 */

import React, { useMemo } from "react";
import { AnimatePresence } from "framer-motion";

// Hooks
import { useSessionStateMachine } from "./hooks/useSessionStateMachine";
import { useWebSocket } from "./hooks/useWebSocket";

// Screens
import WelcomeScreen from "./screens/WelcomeScreen";
import ChargingDashboard from "./screens/ChargingDashboard";
import ProcessingScreen from "./screens/ProcessingScreen";
import BilledScreen from "./screens/BilledScreen";
import ErrorScreen from "./screens/ErrorScreen";
import BookingConfirmationScreen from "./screens/BookingConfirmationScreen";
import InterimNoticeScreen from "./screens/InterimNoticeScreen";
import MaintenanceScreen from "./screens/MaintenanceScreen";

const App: React.FC = () => {
  const {
    status,
    telemetry,
    activeSession,
    sessionSummary,
    pricing,
    vnpayUrl,
    errorMessage,
    startSession,
    stopSession,
    resetSession,
    updateTelemetry,
  } = useSessionStateMachine();

  // WebSocket: active only during ACTIVE state
  useWebSocket({
    sessionId: activeSession?.id ?? null,
    startMeterWh: activeSession?.startMeterWh ?? 0,
    onTelemetry: updateTelemetry,
    enabled: status === "ACTIVE",
  });

  // Mock session fallback for screens that need it
  const safeSession = useMemo(
    () =>
      activeSession ?? {
        id: "00000000-0000-0000-0000-000000000000",
        userId: "",
        chargerId: import.meta.env.VITE_CHARGER_ID || "CHG-001-A",
        bookingId: null,
        startTime: new Date().toISOString(),
        status: "active",
        startMeterWh: 0,
        createdAt: new Date().toISOString(),
      },
    [activeSession],
  );

  const safeSummary = useMemo(
    () =>
      sessionSummary ?? {
        id: "00000000-0000-0000-0000-000000000000",
        status: "billed",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        totalKwh: 0,
        totalCostVnd: 0,
        stopReason: "",
      },
    [sessionSummary],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-white p-10 flex flex-col font-sans">
      {/* ─── Screen Router (AnimatePresence for transitions) ─── */}
      <AnimatePresence mode="wait">
        {status === "INIT" && (
          <WelcomeScreen key="init" onStart={startSession} />
        )}

        {status === "RESERVED" && (
          <BookingConfirmationScreen 
            key="reserved" 
            onCancel={resetSession}
          />
        )}

        {status === "NOTICE" && (
          <InterimNoticeScreen
            key="notice"
            bookingTime={mockBookingTime || "11:30"}
            onConfirm={() => {
              // Special confirm function to force ACTIVE state
              startSession(true); 
            }}
            onCancel={resetSession}
          />
        )}

        {status === "MAINTENANCE" && (
          <MaintenanceScreen key="maintenance" />
        )}

        {status === "ACTIVE" && (
          <ChargingDashboard
            key="active"
            telemetry={telemetry}
            session={safeSession}
            pricing={pricing}
            onStop={stopSession}
          />
        )}

        {status === "STOPPED" && <ProcessingScreen key="stopped" />}

        {status === "BILLED" && (
          <BilledScreen
            key="billed"
            summary={safeSummary}
            vnpayUrl={vnpayUrl}
            onReset={resetSession}
          />
        )}

        {status === "ERROR" && (
          <ErrorScreen
            key="error"
            message={errorMessage ?? "Lỗi không xác định"}
            onRetry={resetSession}
          />
        )}
      </AnimatePresence>

      {/* ─── Global Footer ─── */}
      <footer className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
        <span className="text-[9px] font-bold uppercase tracking-[0.6em] text-white/10">
          EVOLT Platform Enterprise Kiosk v7.0
        </span>
      </footer>
    </div>
  );
};

export default App;
