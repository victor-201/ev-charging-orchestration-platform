/**
 * EVOLTTOUCH Kiosk — Session State Machine Hook (Clean Architecture)
 *
 * Manages the core business logic of a charging session.
 * State flow: INIT → ACTIVE → STOPPED → BILLED
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  TelemetryData,
  SessionStatus,
  ChargingSession,
  StopSessionResponse,
  PricingInfo
} from '../../domain/entities/entities';
import {
  GetActiveSessionUseCase,
  GetLatestTelemetryUseCase,
  StartSessionUseCase,
  StopSessionUseCase,
  GetPricingUseCase,
  CreateVnpayPaymentUseCase,
} from '../../application/useCases';
import { CHARGER_ID, STATION_ID, POINT_ID, resolveKioskIdentifiers } from '../../data/sources/localStorage';
import { useWebSocket } from './useWebSocket';
import { KIOSK_GUEST_USER_ID } from '../../lib/kiosk-guest';

export type { SessionStatus };
export type { TelemetryData };

const INITIAL_TELEMETRY: TelemetryData = {
  soc: 0,
  power: 0,
  voltage: 380,
  current: 0,
  temperature: 25,
  energyDelivered: 0,
  estimatedCost: 0,
  elapsedSeconds: 0,
};

/** Booking time data passed from look-ahead detection to the RESERVED screen */
export interface ReservedBookingInfo {
  startTime: string; // ISO string
  endTime: string;   // ISO string
}

interface StateMachineReturn {
  status: SessionStatus;
  telemetry: TelemetryData;
  activeSession: ChargingSession | null;
  sessionSummary: StopSessionResponse | null;
  pricing: PricingInfo | null;
  vnpayUrl: string | null;
  errorMessage: string | null;
  isPaid: boolean;
  /** True when the active/last session was initiated by a real app user (not a walk-in kiosk guest). */
  isAppUserSession: boolean;
  /** Booking time info available when RESERVED was triggered via the look-ahead slot check. */
  reservedBookingInfo: ReservedBookingInfo | null;
  startSession: () => Promise<void>;
  startBookingSession: (bookingId: string, qrToken: string) => Promise<void>;
  stopSession: () => Promise<void>;
  resetSession: () => void;
  updateTelemetry: (data: Partial<TelemetryData>) => void;
  triggerMaintenance: () => void;
  triggerOffline: () => void;
  triggerReserved: (info?: ReservedBookingInfo) => void;
  triggerNotice: () => void;
  triggerScanQr: () => void;
}

// Instantiate Use Cases cleanly
const getActiveSessionUseCase = new GetActiveSessionUseCase();
const getLatestTelemetryUseCase = new GetLatestTelemetryUseCase();
const startSessionUseCase = new StartSessionUseCase();
const stopSessionUseCase = new StopSessionUseCase();
const getPricingUseCase = new GetPricingUseCase();
const createVnpayPaymentUseCase = new CreateVnpayPaymentUseCase();

export const useSessionStateMachine = (): StateMachineReturn => {
  const [status, setStatus] = useState<SessionStatus>('INIT');
  const [kioskChargerId, setKioskChargerId] = useState<string | null>(CHARGER_ID || null);
  const [kioskPointId, setKioskPointId] = useState<string | null>(POINT_ID || null);
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [activeSession, setActiveSession] = useState<ChargingSession | null>(null);
  const [sessionSummary, setSessionSummary] = useState<StopSessionResponse | null>(null);
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [vnpayUrl, setVnpayUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [reservedBookingInfo, setReservedBookingInfo] = useState<ReservedBookingInfo | null>(null);
  const [isAppUserSession, setIsAppUserSession] = useState<boolean>(false);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionInProgressRef = useRef<boolean>(false);

  const startElapsedTimer = useCallback(() => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => {
      setTelemetry(prev => ({ ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }));
    }, 1000);
  }, []);

  /**
   * Seed initial telemetry values from session record so the dashboard
   * doesn't start at 0% SoC and 0s elapsed on mount.
   */
  const seedTelemetryFromSession = useCallback((session: ChargingSession, latestTelemetry?: any, pricePerKwh?: number) => {
    const initialSoc = latestTelemetry?.socPercent ?? session.startSocPercent ?? 0;
    const elapsedSecs = session.startTime
      ? Math.max(0, Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000))
      : 0;
    
    let initialEnergy = session.energyKwh ?? 0;
    let initialCost = session.amountDue ?? 0;

    if (latestTelemetry?.meterWh != null) {
      const startMeter = Number(session.startMeterWh ?? 0);
      initialEnergy = Math.max(0, (latestTelemetry.meterWh - startMeter) / 1000);
      
      const rate = pricePerKwh ?? 3500;
      initialCost = Math.ceil(initialEnergy * rate);
    }

    setTelemetry(prev => ({
      ...prev,
      soc: initialSoc,
      elapsedSeconds: elapsedSecs,
      energyDelivered: parseFloat(initialEnergy.toFixed(3)),
      estimatedCost: initialCost,
      power: latestTelemetry?.powerKw ? Number(latestTelemetry.powerKw) : 0,
      voltage: latestTelemetry?.voltageV ? Number(latestTelemetry.voltageV) : 380,
      current: latestTelemetry?.currentA ? Number(latestTelemetry.currentA) : 0,
      temperature: latestTelemetry?.temperatureC ? Number(latestTelemetry.temperatureC) : 25,
    }));
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, []);

  useEffect(() => {
    const initializeKiosk = async () => {
      if (status !== 'INIT') return;

      const ids = await resolveKioskIdentifiers();
      setKioskChargerId(ids.chargerId);
      setKioskPointId(ids.pointId);

      if (!ids.chargerId) {
        return;
      }

      try {
        const [active, price] = await Promise.all([
          getActiveSessionUseCase.execute(ids.chargerId),
          getPricingUseCase.execute(ids.stationId, ids.chargerId)
        ]);

        if (active && price) {
          setActiveSession(active);
          setPricing(price);
          setIsAppUserSession(active.userId !== KIOSK_GUEST_USER_ID);

          let latestTelemetry = null;
          try {
            const telRes = await getLatestTelemetryUseCase.execute(active.id);
            if (telRes?.readings?.[0]) {
              latestTelemetry = telRes.readings[0];
            }
          } catch (telErr) {
            console.warn('[Kiosk] Failed to fetch latest telemetry for active session:', telErr);
          }

          seedTelemetryFromSession(active, latestTelemetry, price.pricePerKwh);
          setStatus('ACTIVE');
          startElapsedTimer();
        } else if (price) {
          setPricing(price);
        }
      } catch (err) {
        console.error('[Kiosk] Initialization failed:', err);
      }
    };

    initializeKiosk();
  }, [status, startElapsedTimer, seedTelemetryFromSession]);

  /**
   * Flow 2 — Walk-in: Start without booking (user walks up to kiosk)
   */
  const startSession = useCallback(async () => {
    if (status !== 'INIT') return;
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    setErrorMessage(null);

    const currentChargerId = kioskChargerId || CHARGER_ID;
    if (!currentChargerId) {
      setErrorMessage('Vui lòng chọn trụ sạc trước khi bắt đầu.');
      setStatus('ERROR');
      actionInProgressRef.current = false;
      return;
    }

    try {
      const [session, price] = await Promise.all([
        startSessionUseCase.execute(currentChargerId),
        getPricingUseCase.execute(STATION_ID, currentChargerId),
      ]);

      setActiveSession(session);
      setPricing(price);
      setIsAppUserSession(false);
      seedTelemetryFromSession(session, undefined, price.pricePerKwh);
      setStatus('ACTIVE');
      startElapsedTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu phiên sạc';
      setErrorMessage(msg);
      setStatus('ERROR');
    } finally {
      actionInProgressRef.current = false;
    }
  }, [status, startElapsedTimer, seedTelemetryFromSession, kioskChargerId]);

  /**
   * Flow 1 — Pre-booked: Start with bookingId + qrToken from scanned user app QR.
   * Called by QrScannerScreen after successfully decoding the user's booking JWT QR.
   * Kiosk sends: POST /charging/start { chargerId, bookingId, qrToken } with kiosk JWT.
   */
  const startBookingSession = useCallback(async (bookingId: string, qrToken: string) => {
    if (status !== 'SCAN_QR' && status !== 'RESERVED') return;
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    setErrorMessage(null);

    const currentChargerId = kioskChargerId || CHARGER_ID;
    if (!currentChargerId) {
      setErrorMessage('Kiosk chưa được cấu hình trụ sạc.');
      setStatus('ERROR');
      actionInProgressRef.current = false;
      return;
    }

    try {
      const [session, price] = await Promise.all([
        startSessionUseCase.execute(currentChargerId, bookingId, qrToken),
        getPricingUseCase.execute(STATION_ID, currentChargerId),
      ]);

      setActiveSession(session);
      setPricing(price);
      setIsAppUserSession(true);
      seedTelemetryFromSession(session, undefined, price.pricePerKwh);
      setStatus('ACTIVE');
      startElapsedTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mã QR không hợp lệ hoặc đã hết hạn';
      setErrorMessage(msg);
      setStatus('ERROR');
    } finally {
      actionInProgressRef.current = false;
    }
  }, [status, startElapsedTimer, seedTelemetryFromSession, kioskChargerId]);

  /**
   * Stop the active charging session.
   */
  const stopSession = useCallback(async () => {
    if (status !== 'ACTIVE' || !activeSession) return;
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    setErrorMessage(null);
    setStatus('STOPPED');
    stopElapsedTimer();

    try {
      const summary = await stopSessionUseCase.execute(
        activeSession.id,
        Math.round(telemetry.energyDelivered * 1000)
      );

      let paymentUrl: string | null = null;

      // Guest payment link for walk-in flow.
      if (summary.totalCostVnd > 0) {
        try {
          const payment = await createVnpayPaymentUseCase.execute(summary.totalCostVnd, activeSession.id);
          paymentUrl = payment.paymentUrl;
        } catch (paymentErr) {
          console.warn('[Kiosk] VNPay QR generation failed:', paymentErr);
        }
      }

      setSessionSummary(summary);
      setVnpayUrl(paymentUrl);
      setStatus('BILLED');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết thúc phiên sạc';
      setErrorMessage(msg);
      setStatus('ERROR');
    } finally {
      actionInProgressRef.current = false;
    }
  }, [status, activeSession, telemetry.energyDelivered, stopElapsedTimer]);

  /**
   * Reset to initial state for the next customer.
   */
  const resetSession = useCallback(() => {
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    localStorage.removeItem('kiosk_reserved_at');
    setStatus('INIT');
    setTelemetry(INITIAL_TELEMETRY);
    setActiveSession(null);
    setSessionSummary(null);
    setVnpayUrl(null);
    setErrorMessage(null);
    setIsPaid(false);
    setIsAppUserSession(false);
    setReservedBookingInfo(null);
    stopElapsedTimer();
  }, [stopElapsedTimer]);

  const triggerMaintenance = useCallback(() => {
    setStatus('MAINTENANCE');
  }, []);

  const triggerOffline = useCallback(() => {
    setStatus('OFFLINE');
  }, []);

  const triggerReserved = useCallback((info?: ReservedBookingInfo) => {
    if (info) setReservedBookingInfo(info);
    // Store entry timestamp for persistent countdown across reloads
    if (!localStorage.getItem('kiosk_reserved_at')) {
      localStorage.setItem('kiosk_reserved_at', Date.now().toString());
    }
    setStatus('RESERVED');
  }, []);

  const triggerNotice = useCallback(() => {
    setStatus('NOTICE');
  }, []);

  const triggerScanQr = useCallback(() => {
    setStatus('SCAN_QR');
  }, []);

  /**
   * Update telemetry and compute estimated cost based on current pricing.
   */
  const updateTelemetry = useCallback(
    (data: Partial<TelemetryData>) => {
      setTelemetry(prev => {
        const next = { ...prev, ...data };
        // Auto-compute estimated cost using current pricing
        if (pricing && next.energyDelivered > 0) {
          next.estimatedCost = Math.round(next.energyDelivered * pricing.pricePerKwh);
        }
        return next;
      });
    },
    [pricing]
  );

  const handleSessionCompleted = useCallback(async (payload: any) => {
    if (status !== 'ACTIVE' || !activeSession || payload.sessionId !== activeSession.id) return;
    if (actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    stopElapsedTimer();

    const totalCostVnd = (payload.energyFeeVnd ?? 0) + (payload.idleFeeVnd ?? 0);
    const summary: StopSessionResponse = {
      id: payload.sessionId,
      status: 'completed',
      startTime: activeSession.startTime,
      endTime: payload.endTime || new Date().toISOString(),
      totalKwh: payload.kwhConsumed ?? 0,
      totalCostVnd: totalCostVnd,
      stopReason: payload.stopReason || 'Remote Stop',
      energyFeeVnd: payload.energyFeeVnd ?? 0,
      idleFeeVnd: payload.idleFeeVnd ?? 0,
    };

    let paymentUrl: string | null = null;
    if (totalCostVnd > 0) {
      try {
        const payment = await createVnpayPaymentUseCase.execute(totalCostVnd, activeSession.id);
        paymentUrl = payment.paymentUrl;
      } catch (paymentErr) {
        console.warn('[Kiosk] VNPay QR generation failed:', paymentErr);
      }
    }

    setSessionSummary(summary);
    setVnpayUrl(paymentUrl);
    setStatus('BILLED');
    actionInProgressRef.current = false;
  }, [status, activeSession, stopElapsedTimer]);

  const handleChargerStatusChanged = useCallback((payload: { chargerId: string; status?: string; newStatus?: string }) => {
    const currentPointId = kioskPointId || POINT_ID;
    if (payload.chargerId !== currentPointId) return;
    const statusVal = payload.status || payload.newStatus;
    if (!statusVal) return;
    console.log('[Kiosk] Charger status changed to:', statusVal);

    switch (statusVal.toLowerCase()) {
      case 'reserved':
        setStatus(prev => {
          if (prev === 'INIT' || prev === 'SCAN_QR') {
            // Store entry timestamp only on fresh transition
            if (!localStorage.getItem('kiosk_reserved_at')) {
              localStorage.setItem('kiosk_reserved_at', Date.now().toString());
            }
            return 'RESERVED';
          }
          return prev;
        });
        break;
      case 'available':
      case 'preparing':
        setStatus(prev => {
          if (prev === 'RESERVED' || prev === 'SCAN_QR' || prev === 'MAINTENANCE' || prev === 'OFFLINE') return 'INIT';
          return prev;
        });
        break;
      case 'offline':
      case 'unavailable':
        setStatus(prev => {
          if (prev !== 'ACTIVE' && prev !== 'STOPPED' && prev !== 'BILLED') return 'OFFLINE';
          return prev;
        });
        break;
      case 'faulted':
        setStatus(prev => {
          if (prev !== 'ACTIVE' && prev !== 'STOPPED' && prev !== 'BILLED') return 'MAINTENANCE';
          return prev;
        });
        break;
      default:
        break;
    }
  }, [kioskPointId]);

  const handlePaymentCompleted = useCallback((payload: any) => {
    console.log('[Kiosk] Payment completed event received:', payload);
    setIsPaid(true);
  }, []);

  // Connect WebSocket to listen to start events and telemetry
  useWebSocket({
    chargerId: kioskPointId || POINT_ID,
    sessionId: activeSession?.id ?? null,
    startMeterWh: activeSession ? activeSession.startMeterWh : 0,
    currentMeterWh: activeSession ? (activeSession.startMeterWh + telemetry.energyDelivered * 1000) : 0,
    startSocPercent: telemetry.soc,
    onTelemetry: updateTelemetry,
    onSessionStarted: useCallback((session: ChargingSession) => {
      setActiveSession(session);
      setIsAppUserSession(session.userId !== KIOSK_GUEST_USER_ID);
      setStatus('ACTIVE');
      startElapsedTimer();
      const currentChargerId = kioskChargerId || CHARGER_ID;
      // Fetch pricing independently
      getPricingUseCase.execute(STATION_ID, currentChargerId)
        .then(price => { if (price) setPricing(price); })
        .catch(() => { });
    }, [startElapsedTimer, kioskChargerId]),
    onSessionCompleted: handleSessionCompleted,
    onChargerStatusChanged: handleChargerStatusChanged,
    onPaymentCompleted: handlePaymentCompleted,
    enabled: !!(kioskPointId || POINT_ID),
  });

  return {
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
  };
};
