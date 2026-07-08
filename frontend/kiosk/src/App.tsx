/**
 * EVOLTTOUCH Vision Enterprise — App Root (v7.0 - Production API Ready)
 *
 * Orchestrates the charging session lifecycle:
 *   INIT → ACTIVE → STOPPED → BILLED
 *
 * Design: Apple Vision Pro / Liquid Glass / Enterprise
 * Theme: theme_design.md (Enterprise Liquid Glass Design System)
 */

import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";

// Dev Tools API & Icons
import { 
  setChargerId, 
  setStationId, 
  resetKioskIdentifiers, 
  CHARGER_ID, 
  STATION_ID,
  POINT_ID,
} from "./data/sources/localStorage";
import { GetStationDetailUseCase } from "./application/useCases";
import type { StationDetail, ChargerInfo } from "./domain/entities/entities";
import { Wrench, X, RefreshCw, Check, RotateCcw, Zap, Clock, Activity, Sun, Moon } from "lucide-react";

// Hooks
import { useSessionStateMachine } from "./presentation/hooks/useSessionStateMachine";

// Screens
import WelcomeScreen from "./presentation/screens/WelcomeScreen";
import ChargingDashboard from "./presentation/screens/ChargingDashboard";
import ProcessingScreen from "./presentation/screens/ProcessingScreen";
import BilledScreen from "./presentation/screens/BilledScreen";
import ErrorScreen from "./presentation/screens/ErrorScreen";
import BookingConfirmationScreen from "./presentation/screens/BookingConfirmationScreen";
import InterimNoticeScreen from "./presentation/screens/InterimNoticeScreen";
import MaintenanceScreen from "./presentation/screens/MaintenanceScreen";
import OfflineScreen from "./presentation/screens/OfflineScreen";
import QrScannerScreen from "./presentation/screens/QrScannerScreen";

const getStationStatusMeta = (status: string | null) => {
  if (!status) return { text: "Không xác định", colorClass: "text-slate-400" };
  switch (status.toLowerCase()) {
    case 'active':
      return { text: "Hoạt động", colorClass: "text-emerald-500" };
    case 'closed':
      return { text: "Đóng cửa", colorClass: "text-red-500" };
    case 'maintenance':
      return { text: "Bảo trì", colorClass: "text-amber-500" };
    case 'inactive':
      return { text: "Ngưng hoạt động", colorClass: "text-slate-400" };
    default:
      return { text: status, colorClass: "text-slate-400" };
  }
};

const getChargerStatusMeta = (status: string | undefined) => {
  if (!status) return { text: "Không xác định", colorClass: "text-slate-400", Icon: Zap };
  switch (status.toLowerCase()) {
    case 'available':
      return { text: "Sẵn sàng", colorClass: "text-emerald-500", Icon: Zap };
    case 'in_use':
      return { text: "Đang sạc", colorClass: "text-indigo-500", Icon: Activity };
    case 'offline':
      return { text: "Ngoại tuyến", colorClass: "text-slate-400", Icon: Wrench };
    case 'faulted':
      return { text: "Lỗi thiết bị", colorClass: "text-red-500", Icon: Wrench };
    case 'reserved':
      return { text: "Đặt trước", colorClass: "text-amber-500", Icon: Clock };
    default:
      return { text: status, colorClass: "text-slate-400", Icon: Zap };
  }
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("kiosk-theme") as "light" | "dark" | null;
    return saved || "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    localStorage.setItem("kiosk-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  };

  // --- Dev Tools State and Logic ---
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [chargers, setChargers] = useState<ChargerInfo[]>([]);
  const [isLoadingChargers, setIsLoadingChargers] = useState(false);
  const [inputStationId, setInputStationId] = useState(STATION_ID);
  const [devError, setDevError] = useState<string | null>(null);
  const [stationDetail, setStationDetail] = useState<StationDetail | null>(null);

  const getStationDetailUseCase = new GetStationDetailUseCase();

  const fetchChargers = useCallback(async (stationId?: string) => {
    setIsLoadingChargers(true);
    setDevError(null);
    const targetId = stationId ?? STATION_ID;
    try {
      const detail = await getStationDetailUseCase.execute(targetId);
      setStationDetail(detail);
      setChargers(detail.chargers || []);
    } catch (err) {
      console.error("[DevTools] Failed to fetch station detail:", err);
      setDevError("Không thể tải thông tin trạm.");
      setStationDetail(null);
      setChargers([]);
    } finally {
      setIsLoadingChargers(false);
    }
  }, []);

  useEffect(() => {
    if (isDevToolsOpen && STATION_ID) {
      fetchChargers(STATION_ID);
    }
  }, [isDevToolsOpen, fetchChargers]);

  const handlePreviewStation = async () => {
    if (!inputStationId.trim()) return;
    await fetchChargers(inputStationId.trim());
  };

  const handleSaveStation = () => {
    if (!inputStationId.trim()) return;
    setStationId(inputStationId.trim());
    window.location.reload();
  };

  const handleSelectCharger = (chargerPointId: string) => {
    const matched = chargers.find(c => c.id === chargerPointId);
    if (matched?.connectors?.length) {
      setChargerId(matched.connectors[0].id, matched.id);
    } else {
      setChargerId(chargerPointId);
    }
    window.location.reload();
  };

  const handleReset = () => {
    resetKioskIdentifiers();
    window.location.reload();
  };

  const {
    status,
    telemetry,
    activeSession,
    sessionSummary,
    pricing,
    vnpayUrl,
    errorMessage,
    isPaid,
    isAppUserSession,
    reservedBookingInfo,
    startSession,
    startBookingSession,
    stopSession,
    resetSession,
    updateTelemetry,
    triggerMaintenance,
    triggerOffline,
    triggerReserved,
    triggerNotice,
    triggerScanQr,
  } = useSessionStateMachine();

  const [noticeBookingTime, setNoticeBookingTime] = useState<string>("11:30");
  const [noticeRemainingMins, setNoticeRemainingMins] = useState<number>(45);



  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col font-sans p-6"
      style={{ background: 'transparent', color: 'var(--text-main)' }}
    >
      {/* ─── Screen Router (AnimatePresence for transitions) ─── */}
      <AnimatePresence mode="wait">
        {status === "INIT" && (
          <WelcomeScreen 
            key="init" 
            onStart={startSession}
            onScanQrBooking={triggerScanQr}
            triggerMaintenance={triggerMaintenance}
            triggerOffline={triggerOffline}
            triggerReserved={triggerReserved}
            onNoticeTrigger={(bookingTime, remainingMins) => {
              setNoticeBookingTime(bookingTime);
              setNoticeRemainingMins(remainingMins);
              triggerNotice();
            }}
          />
        )}

        {status === "SCAN_QR" && (
          <QrScannerScreen
            key="scan-qr"
            onScanSuccess={startBookingSession}
            onCancel={resetSession}
          />
        )}

        {status === "RESERVED" && (
          <BookingConfirmationScreen 
            key="reserved" 
            onScanSuccess={startBookingSession}
            onCancel={resetSession}
            reservedBookingInfo={reservedBookingInfo}
          />
        )}

        {status === "NOTICE" && (
          <InterimNoticeScreen
            key="notice"
            bookingTime={noticeBookingTime}
            remainingMinutes={noticeRemainingMins}
            onConfirm={() => {
              startSession(); 
            }}
            onCancel={resetSession}
          />
        )}

        {status === "MAINTENANCE" && (
          <MaintenanceScreen key="maintenance" />
        )}

        {status === "OFFLINE" && (
          <OfflineScreen key="offline" onRetry={resetSession} />
        )}

        {status === "ACTIVE" && (
          <ChargingDashboard
            key="active"
            telemetry={telemetry}
            session={activeSession!}
            pricing={pricing}
            onStop={stopSession}
          />
        )}

        {status === "STOPPED" && <ProcessingScreen key="stopped" />}

        {status === "BILLED" && (
          <BilledScreen
            key="billed"
            summary={sessionSummary!}
            vnpayUrl={vnpayUrl}
            isPaid={isPaid}
            isAppUserSession={isAppUserSession}
            pricing={pricing}
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
        <span className="text-[9px] font-bold uppercase tracking-[0.6em] text-[var(--text-faded)] opacity-30">
          EVOLT Platform Enterprise Kiosk v7.0
        </span>
      </footer>

      {/* ─── DEV TOOLS FLOATING BUBBLE ─── */}
      <div className="fixed bottom-6 right-6 z-[99999] flex flex-col items-end">
        <button
          onClick={() => setIsDevToolsOpen(true)}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer border animate-bounce"
          style={{
            background: "var(--pill-bg)",
            borderColor: "var(--pill-border)",
            boxShadow: "0 0 15px var(--cyan-glow)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            color: "var(--primary)",
          }}
          title="Developer Tools"
        >
          <Wrench size={20} className="animate-pulse" />
        </button>
      </div>

      {/* ─── DEV TOOLS MODAL PANEL ─── */}
      {isDevToolsOpen && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
          <div 
            className="w-full max-w-lg glass-elevated p-8 flex flex-col gap-6 relative overflow-hidden rounded-[28px] border-[1.5px] border-[var(--card-border)]"
            style={{
              color: "var(--text-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
            }}
          >
            {/* Modal Header */}
            <div className="relative z-10 flex justify-between items-center pb-3 border-b border-[var(--card-border)]">
              <div>
                <h3 className="text-lg font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                  <Wrench size={18} className="text-[var(--primary)]" />
                  Dev Tools
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Cấu hình trạm & trụ sạc để kiểm thử chức năng</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Theme Switcher */}
                <button
                  onClick={toggleTheme}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 hover:bg-white/10 dark:hover:bg-white/5 border border-[var(--pill-border)] cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                  title={theme === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
                >
                  {theme === "dark" ? (
                    <Sun size={15} className="text-amber-500" />
                  ) : (
                    <Moon size={15} className="text-indigo-500 dark:text-indigo-400" />
                  )}
                </button>
                <button
                  onClick={() => setIsDevToolsOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 hover:bg-white/10 dark:hover:bg-white/5 border border-[var(--pill-border)] cursor-pointer"
                  style={{ color: "var(--text-primary)" }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="relative z-10 flex flex-col gap-5 max-h-[60vh] overflow-y-auto pr-1">
              
              {/* 1. Current config */}
              <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ background: "var(--pill-bg)", borderColor: "var(--pill-border)" }}>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Cấu hình hiện tại</span>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Zap size={12} className="text-[var(--primary)] shrink-0" />
                    <span className="font-bold text-[var(--text-primary)]">Trạm:</span>
                    <span className="font-mono text-[var(--text-secondary)] break-all" title={STATION_ID}>{STATION_ID}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Zap size={12} className="text-amber-500 shrink-0" />
                    <span className="font-bold text-[var(--text-primary)]">Trụ (Point):</span>
                    <span className="font-mono text-[var(--text-secondary)] break-all" title={POINT_ID}>{POINT_ID || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Zap size={12} className="text-emerald-500 shrink-0" />
                    <span className="font-bold text-[var(--text-primary)]">Charger (Connector):</span>
                    <span className="font-mono text-[var(--text-secondary)] break-all" title={CHARGER_ID}>{CHARGER_ID || "—"}</span>
                  </div>
                </div>
              </div>

              {/* 2. Station ID input + preview */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Nhập Station ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputStationId}
                    onChange={(e) => setInputStationId(e.target.value)}
                    placeholder="Ví dụ: 55555555-0000-4000-8000-000000000001"
                    className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold border transition-all focus:outline-none focus:border-[var(--primary)]"
                    style={{ background: "var(--pill-bg)", borderColor: "var(--pill-border)", color: "var(--text-primary)" }}
                  />
                  <button
                    onClick={() => handlePreviewStation()}
                    disabled={isLoadingChargers}
                    className="px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer border border-[var(--pill-border)]"
                    style={{ color: "var(--text-primary)", background: "var(--pill-bg)" }}
                  >
                    {isLoadingChargers ? "..." : "Xem"}
                  </button>
                  <button
                    onClick={handleSaveStation}
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    style={{ background: "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)", color: "#ffffff", border: "none" }}
                  >
                    Lưu
                  </button>
                </div>
                {stationDetail?.name && (
                  <span className="text-[11px] font-semibold text-emerald-500 px-1 flex items-center gap-1">
                    <Check size={11} />
                    {stationDetail.name}
                  </span>
                )}
              </div>

              {/* 3. Chargers list from preview */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Danh sách trụ sạc
                  </label>
                  {isLoadingChargers && (
                    <RefreshCw size={12} className="animate-spin text-[var(--primary)]" />
                  )}
                </div>

                <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {(() => {
                    if (isLoadingChargers && chargers.length === 0) {
                      return (
                        <div className="text-center py-8 border border-dashed border-[var(--pill-border)] rounded-2xl">
                          <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[var(--text-secondary)]" />
                          <p className="text-xs text-[var(--text-secondary)]">Đang tải danh sách trụ sạc...</p>
                        </div>
                      );
                    }
                    if (devError) {
                      return (
                        <div className="text-center py-6 px-4 border border-red-500/20 bg-red-500/5 text-red-500 rounded-2xl text-xs font-semibold">
                          {devError}
                        </div>
                      );
                    }
                    if (!stationDetail && !isLoadingChargers) {
                      return (
                        <div className="text-center py-8 border border-dashed border-[var(--pill-border)] rounded-2xl text-xs text-[var(--text-secondary)]">
                          Nhập Station ID và bấm "Xem" để tải danh sách trụ.
                        </div>
                      );
                    }
                    if (chargers.length === 0) {
                      return (
                        <div className="text-center py-8 border border-dashed border-[var(--pill-border)] rounded-2xl text-xs text-[var(--text-secondary)]">
                          Không tìm thấy trụ sạc nào tại trạm này.
                        </div>
                      );
                    }

                    return chargers.map((c) => {
                      const isSelected = c.id === POINT_ID || c.connectors?.some(conn => conn.id === CHARGER_ID);
                      const meta = getChargerStatusMeta(c.status);
                      const ChargerIcon = meta.Icon;
                      const powerText = c.connectors?.length
                        ? `${Math.max(...c.connectors.map(co => co.maxPowerKw || 0))} kW`
                        : (c.maxPowerKw ? `${c.maxPowerKw} kW` : null);
                      const connectorsText = c.connectors?.length
                        ? c.connectors.map(co => `${co.connectorType} (${co.maxPowerKw}kW)`).join(', ')
                        : null;

                      return (
                        <div
                          key={c.id}
                          onClick={() => handleSelectCharger(c.id)}
                          className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                            isSelected
                              ? 'bg-gradient-to-r from-[var(--primary)]/10 to-[var(--accent)]/10 border-[var(--primary)]/40 shadow-[0_0_15px_rgba(16,191,202,0.1)]'
                              : 'bg-white/5 dark:bg-white/5 border-[var(--pill-border)] hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'bg-white/10 dark:bg-white/5 text-[var(--text-secondary)]'}`}>
                              <ChargerIcon size={15} />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-bold truncate max-w-[200px]">
                                {c.name || `Trụ ${c.id.substring(0, 4)}`}
                              </span>
                              <span className="text-[9px] font-mono text-[var(--text-secondary)] truncate max-w-[200px]">
                                {c.id}
                              </span>
                              {powerText && (
                                <span className="text-[9px] font-semibold text-[var(--primary)] truncate max-w-[200px] flex items-center gap-1">
                                  <Zap size={10} className="shrink-0" />
                                  {powerText}
                                </span>
                              )}
                              {connectorsText && (
                                <span className="text-[8px] text-[var(--text-secondary)] truncate max-w-[200px] leading-tight mt-0.5">
                                  {connectorsText}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-semibold ${meta.colorClass}`}>{meta.text}</span>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center text-white">
                                <Check size={11} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="relative z-10 pt-4 border-t border-[var(--card-border)] flex flex-col gap-3">
              <div className="flex gap-3">
                <button
                  onClick={() => fetchChargers(inputStationId)}
                  disabled={isLoadingChargers}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border border-[var(--pill-border)] hover:bg-white/10 dark:hover:bg-white/5 cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ color: "var(--text-primary)" }}
                >
                  <RefreshCw size={12} className={isLoadingChargers ? "animate-spin" : ""} />
                  Làm mới danh sách
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border border-[var(--pill-border)] hover:bg-white/10 dark:hover:bg-white/5 cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ color: "var(--text-primary)" }}
                >
                  <RotateCcw size={12} />
                  Đặt lại mặc định
                </button>
              </div>
              <button
                onClick={() => setIsDevToolsOpen(false)}
                className="w-full py-3 rounded-xl text-sm font-extrabold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, var(--primary) 100%)",
                  color: "#ffffff",
                  border: "none",
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
