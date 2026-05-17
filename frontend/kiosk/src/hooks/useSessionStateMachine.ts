/**
 * EVOLTTOUCH Kiosk — Session State Machine Hook
 *
 * Manages the core business logic of a charging session.
 * State flow (from 03_business_functions.md §20–22):
 *   INIT → ACTIVE → STOPPED → BILLED
 *
 * Real API integration via api/index.ts.
 * Falls back to mock data if VITE_ENABLE_MOCK_DATA=true.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TelemetryData, SessionStatus, ChargingSession, StopSessionResponse, PricingInfo } from '../types';
import {
  getActiveSession,
  startChargingSession,
  stopChargingSession,
  getPricing,
  createVnpayPayment,
  CHARGER_ID,
} from '../api';

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
  mockBookingTime: string | null;
  startSession: (isInterimConfirmed?: boolean) => Promise<void>;
  stopSession: () => Promise<void>;
  resetSession: () => void;
  updateTelemetry: (data: Partial<TelemetryData>) => void;
}

export const useSessionStateMachine = (): StateMachineReturn => {
  const [status, setStatus] = useState<SessionStatus>('INIT');
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [activeSession, setActiveSession] = useState<ChargingSession | null>(null);
  const [sessionSummary, setSessionSummary] = useState<StopSessionResponse | null>(null);
  const [pricing, setPricing] = useState<PricingInfo | null>(null);
  const [vnpayUrl, setVnpayUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mockBookingTime, setMockBookingTime] = useState<string | null>(null);
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

  // Check for reservation or existing session on mount
  useEffect(() => {
    const initializeKiosk = async () => {
      if (status !== 'INIT') return;

      const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';
      const scenario = new URLSearchParams(window.location.search).get('scenario');
      
      // Force clear session if switching scenarios to ensure clean test
      const lastScenario = localStorage.getItem('last_scenario');
      if (scenario && scenario !== lastScenario) {
        localStorage.removeItem('kiosk_session');
        localStorage.setItem('last_scenario', scenario);
      }
      
      // 1. Scenario 4: Maintenance
      if (scenario === '4') {
        setStatus('MAINTENANCE');
        return;
      }

      // 2. Scenario 3: Immediate Reserved (QR on load)
      if (scenario === '3' || (new URLSearchParams(window.location.search).get('reserved') === 'true')) {
        setStatus('RESERVED');
        return;
      }

      // 3. Scenario 2: Upcoming Booking (Notice on start)
      // handled inside startSession via the 'interim' flag check or scenario detection

      // 4. Check for active session (Resume flow)
      try {
        let active: ChargingSession | null = null;
        let price: PricingInfo | null = null;

        if (isMock) {
          const stored = localStorage.getItem('kiosk_session');
          if (stored) {
            const data = JSON.parse(stored);
            active = data.session;
            price = data.pricing;
            // Restore elapsed time if available
            if (data.elapsed) {
              setTelemetry(prev => ({ ...prev, elapsedSeconds: data.elapsed }));
            }
          }
        } else {
          [active, price] = await Promise.all([
            getActiveSession(),
            getPricing()
          ]);
        }

        if (active && price) {
          setActiveSession(active);
          setPricing(price);
          setStatus('ACTIVE');
          startElapsedTimer();
        }

        // Scenario 2: Set a mock booking time for display (approx 90 mins from now)
        if (scenario === '2') {
           const now = new Date();
           now.setMinutes(now.getMinutes() + 90);
           setMockBookingTime(now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
        }
      } catch (err) {
        console.error("Initialization failed", err);
      }
    };

    initializeKiosk();
  }, [status, startElapsedTimer]);

  /**
   * Start a new charging session.
   * Business Function [20]: Walk-in flow.
   * API: POST /charging/start → { chargerId }
   */
  const startSession = useCallback(async (isInterimConfirmed = false) => {
    if (status !== 'INIT' && status !== 'NOTICE') return;
    setErrorMessage(null);

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';

    // Scenario 2 Detection: Check if there's an upcoming booking soon
    const scenario = new URLSearchParams(window.location.search).get('scenario');
    const hasUpcomingBooking = scenario === '2' || new URLSearchParams(window.location.search).get('interim') === 'true';
    
    if (hasUpcomingBooking && !isInterimConfirmed) {
      if (status === 'INIT') {
        setStatus('NOTICE');
        return;
      }
    }

    try {
      if (isMock) {
        // Simulate API call delay
        await new Promise(r => setTimeout(r, 1200));
        const mockSession: ChargingSession = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          userId: 'mock-user-001',
          chargerId: CHARGER_ID,
          bookingId: null,
          startTime: new Date().toISOString(),
          status: 'active',
          startMeterWh: 0,
          createdAt: new Date().toISOString(),
        };
        const mockPricing: PricingInfo = {
          pricePerKwh: 3850,
          idleFeePerMinute: 1000,
          totalEstimateVnd: 0,
        };

        localStorage.setItem('kiosk_session', JSON.stringify({
          session: mockSession,
          pricing: mockPricing,
          createdAt: new Date().toISOString()
        }));

        setActiveSession(mockSession);
        setPricing(mockPricing);
      } else {
        // Real API calls
        const [session, price] = await Promise.all([
          startChargingSession(),
          getPricing(),
        ]);
        setActiveSession(session);
        setPricing(price);
      }

      setStatus('ACTIVE');
      startElapsedTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể bắt đầu phiên sạc';
      setErrorMessage(msg);
      setStatus('ERROR');
    }
  }, [status, startElapsedTimer]);

  /**
   * Stop the active charging session.
   * Business Function [22]: Stop session, trigger billing.
   * API: POST /charging/stop/:id → { totalKwh, totalCostVnd }
   */
  const stopSession = useCallback(async () => {
    if (status !== 'ACTIVE' || !activeSession) return;
    setErrorMessage(null);
    setStatus('STOPPED');
    stopElapsedTimer();

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';

    try {
      let summary: StopSessionResponse;
      let paymentUrl: string | null = null;

      if (isMock) {
        await new Promise(r => setTimeout(r, 2000));
        summary = {
          id: activeSession.id,
          status: 'billed',
          startTime: activeSession.startTime,
          endTime: new Date().toISOString(),
          totalKwh: parseFloat(telemetry.energyDelivered.toFixed(2)),
          totalCostVnd: telemetry.estimatedCost,
          stopReason: 'kiosk_user_stop',
        };
        // Simulate VNPay QR URL
        paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=${summary.totalCostVnd * 100}&vnp_TxnRef=${activeSession.id}&vnp_OrderInfo=EV+Charging+Session`;
      } else {
        summary = await stopChargingSession(
          activeSession.id,
          Math.round(telemetry.energyDelivered * 1000)
        );

        // Generate VNPay payment link for walk-in cash payment
        if (summary.totalCostVnd > 0) {
          try {
            const payment = await createVnpayPayment(summary.totalCostVnd, activeSession.id);
            paymentUrl = payment.paymentUrl;
          } catch {
            // Non-critical: QR generation failed, show amount only
            paymentUrl = null;
          }
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
  }, [status, activeSession, telemetry, stopElapsedTimer]);

  /**
   * Reset to initial state (new customer).
   */
  const resetSession = useCallback(() => {
    // Clear URL params if present
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    localStorage.removeItem('kiosk_session'); // Clear persistence
    setStatus('INIT');
    setTelemetry(INITIAL_TELEMETRY);
    setActiveSession(null);
    setSessionSummary(null);
    setVnpayUrl(null);
    setErrorMessage(null);
    stopElapsedTimer();
  }, [stopElapsedTimer]);

  /**
   * Update telemetry + compute estimated cost.
   * Called by useWebSocket on each real-time message.
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
    mockBookingTime,
    startSession,
    stopSession,
    resetSession,
    updateTelemetry,
  };
};
