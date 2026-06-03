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
  StartSessionUseCase,
  StopSessionUseCase,
  GetPricingUseCase,
  CreateVnpayPaymentUseCase,
} from '../../application/useCases';
import { CHARGER_ID, STATION_ID, resolveKioskIdentifiers } from '../../data/sources/localStorage';

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

interface StateMachineReturn {
  status: SessionStatus;
  telemetry: TelemetryData;
  activeSession: ChargingSession | null;
  sessionSummary: StopSessionResponse | null;
  pricing: PricingInfo | null;
  vnpayUrl: string | null;
  errorMessage: string | null;
  startSession: () => Promise<void>;
  startBookingSession: (bookingId: string, qrToken: string) => Promise<void>;
  stopSession: () => Promise<void>;
  resetSession: () => void;
  updateTelemetry: (data: Partial<TelemetryData>) => void;
  triggerMaintenance: () => void;
  triggerOffline: () => void;
  triggerReserved: () => void;
  triggerNotice: () => void;
  triggerScanQr: () => void;
}

// Instantiate Use Cases cleanly
const getActiveSessionUseCase = new GetActiveSessionUseCase();
const startSessionUseCase = new StartSessionUseCase();
const stopSessionUseCase = new StopSessionUseCase();
const getPricingUseCase = new GetPricingUseCase();
const createVnpayPaymentUseCase = new CreateVnpayPaymentUseCase();

export const useSessionStateMachine = (): StateMachineReturn => {
  const [status, setStatus] = useState<SessionStatus>('INIT');
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [activeSession, setActiveSession] = useState<ChargingSession | null>(null);
  const [sessionSummary, setSessionSummary] = useState<StopSessionResponse | null>(null);
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [vnpayUrl, setVnpayUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startElapsedTimer = useCallback(() => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => {
      setTelemetry(prev => ({ ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }));
    }, 1000);
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

      await resolveKioskIdentifiers();

      if (!CHARGER_ID) {
        return;
      }

      try {
        const [active, price] = await Promise.all([
          getActiveSessionUseCase.execute(CHARGER_ID),
          getPricingUseCase.execute(STATION_ID, CHARGER_ID)
        ]);

        if (active && price) {
          setActiveSession(active);
          setPricing(price);
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
  }, [status, startElapsedTimer]);

  /**
   * Flow 2 — Walk-in: Start without booking (user walks up to kiosk)
   */
  const startSession = useCallback(async () => {
    if (status !== 'INIT') return;
    setErrorMessage(null);

    if (!CHARGER_ID) {
      setErrorMessage('Vui lòng chọn trụ sạc trước khi bắt đầu.');
      setStatus('ERROR');
      return;
    }

    try {
      const [session, price] = await Promise.all([
        startSessionUseCase.execute(CHARGER_ID),
        getPricingUseCase.execute(STATION_ID, CHARGER_ID),
      ]);

      setActiveSession(session);
      setPricing(price);
      setStatus('ACTIVE');
      startElapsedTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu phiên sạc';
      setErrorMessage(msg);
      setStatus('ERROR');
    }
  }, [status, startElapsedTimer]);

  /**
   * Flow 1 — Pre-booked: Start with bookingId + qrToken from scanned user app QR.
   * Called by QrScannerScreen after successfully decoding the user's booking JWT QR.
   * Kiosk sends: POST /charging/start { chargerId, bookingId, qrToken } with kiosk JWT.
   */
  const startBookingSession = useCallback(async (bookingId: string, qrToken: string) => {
    if (status !== 'SCAN_QR' && status !== 'RESERVED') return;
    setErrorMessage(null);

    if (!CHARGER_ID) {
      setErrorMessage('Kiosk chưa được cấu hình trụ sạc.');
      setStatus('ERROR');
      return;
    }

    try {
      const [session, price] = await Promise.all([
        startSessionUseCase.execute(CHARGER_ID, bookingId, qrToken),
        getPricingUseCase.execute(STATION_ID, CHARGER_ID),
      ]);

      setActiveSession(session);
      setPricing(price);
      setStatus('ACTIVE');
      startElapsedTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mã QR không hợp lệ hoặc đã hết hạn';
      setErrorMessage(msg);
      setStatus('ERROR');
    }
  }, [status, startElapsedTimer]);

  /**
   * Stop the active charging session.
   */
  const stopSession = useCallback(async () => {
    if (status !== 'ACTIVE' || !activeSession) return;
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
    }
  }, [status, activeSession, telemetry.energyDelivered, stopElapsedTimer]);

  /**
   * Reset to initial state for the next customer.
   */
  const resetSession = useCallback(() => {
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    setStatus('INIT');
    setTelemetry(INITIAL_TELEMETRY);
    setActiveSession(null);
    setSessionSummary(null);
    setVnpayUrl(null);
    setErrorMessage(null);
    stopElapsedTimer();
  }, [stopElapsedTimer]);

  const triggerMaintenance = useCallback(() => {
    setStatus('MAINTENANCE');
  }, []);

  const triggerOffline = useCallback(() => {
    setStatus('OFFLINE');
  }, []);

  const triggerReserved = useCallback(() => {
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

  return {
    status,
    telemetry,
    activeSession,
    sessionSummary,
    pricing,
    vnpayUrl,
    errorMessage,
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
