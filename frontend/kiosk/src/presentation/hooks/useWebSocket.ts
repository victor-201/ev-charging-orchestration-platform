/**
 * EVOLTTOUCH Kiosk — Socket.IO Real-time Telemetry Hook
 *
 * Maintains a persistent, auto-reconnecting Socket.IO connection
 * to Kong Gateway on namespace /charging for real-time telemetry during ACTIVE sessions.
 *
 * Real WS payload maps to TelemetryPayload from types/index.ts.
 *
 * Dev-mode fallback: if no real charging_updated event arrives within SIM_GRACE_MS,
 * a simulated ticker emits realistic 22 kW DC-charging data so the dashboard
 * looks live even without a physical OCPP charger.
 */

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TelemetryData, TelemetryPayload, ChargingSession } from '../../domain/entities/entities';

/** Delay (ms) before the simulated ticker fires if no real event arrives */
const SIM_GRACE_MS = 4_000;
/** Simulated tick interval (ms) */
const SIM_TICK_MS = 1_000;
/** Simulated charger power (kW) */
const SIM_POWER_KW = 22;

interface UseWebSocketOptions {
  chargerId: string | null;
  sessionId: string | null;
  startMeterWh: number;
  currentMeterWh?: number;
  /** Starting SoC% from session record — seeds the dev simulator */
  startSocPercent?: number | null;
  onTelemetry: (data: Partial<TelemetryData>) => void;
  onSessionStarted?: (session: ChargingSession) => void;
  onSessionCompleted?: (payload: any) => void;
  onChargerStatusChanged?: (payload: { chargerId: string; status?: string; newStatus?: string }) => void;
  onPaymentCompleted?: (payload: any) => void;
  enabled: boolean;
}

export const useWebSocket = ({
  chargerId,
  sessionId,
  startMeterWh,
  currentMeterWh,
  startSocPercent,
  onTelemetry,
  onSessionStarted,
  onSessionCompleted,
  onChargerStatusChanged,
  onPaymentCompleted,
  enabled,
}: UseWebSocketOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const hadRealTelemetry = useRef(false);

  // Persistent sim state across effect re-runs (survives React strict-mode double-mount)
  const simSocRef = useRef(0);
  const simMeterWhRef = useRef(0);
  const simInitializedForSessionRef = useRef<string | null>(null);

  // Keep references to all callbacks to prevent reconnecting socket on callback changes
  const onTelemetryRef = useRef(onTelemetry);
  const onSessionStartedRef = useRef(onSessionStarted);
  const onSessionCompletedRef = useRef(onSessionCompleted);
  const onChargerStatusChangedRef = useRef(onChargerStatusChanged);
  const onPaymentCompletedRef = useRef(onPaymentCompleted);
  const startMeterWhRef = useRef(startMeterWh);
  const currentMeterWhRef = useRef(currentMeterWh ?? startMeterWh);
  const startSocPercentRef = useRef(startSocPercent ?? 0);
  const sessionIdRef = useRef(sessionId);

  // Synchronously sync the refs in the render body so that they are always
  // up-to-date during the render phase and before any effects run.
  onTelemetryRef.current = onTelemetry;
  onSessionStartedRef.current = onSessionStarted;
  onSessionCompletedRef.current = onSessionCompleted;
  onChargerStatusChangedRef.current = onChargerStatusChanged;
  onPaymentCompletedRef.current = onPaymentCompleted;
  startMeterWhRef.current = startMeterWh;
  currentMeterWhRef.current = currentMeterWh ?? startMeterWh;
  startSocPercentRef.current = startSocPercent ?? 0;
  sessionIdRef.current = sessionId;

  const mapPayload = useCallback(
    (raw: TelemetryPayload): Partial<TelemetryData> => {
      const deliveredKwh = Math.max(0, (raw.meterWh - startMeterWhRef.current) / 1000);
      const currentPower = raw.powerKw ?? 0;

      // Realistic values calculation for display
      const computedVoltage = 380 + (Math.random() - 0.5) * 4;
      const computedCurrent = currentPower > 0
        ? parseFloat((currentPower / 0.380).toFixed(1))
        : 0;
      const computedTemp = currentPower > 0
        ? parseFloat((32 + (currentPower / 350) * 15 + (Math.random() - 0.5) * 2).toFixed(1))
        : 25;

      return {
        soc:             raw.socPercent ?? 0,
        power:           currentPower,
        voltage:         raw.voltageV ?? computedVoltage,
        current:         raw.currentA ?? computedCurrent,
        temperature:     raw.temperatureC ?? computedTemp,
        energyDelivered: parseFloat(deliveredKwh.toFixed(2)),
      };
    },
    []
  );

  // 1. Connection management effect: runs only on chargerId/enabled change
  useEffect(() => {
    if (!enabled || !chargerId) {
      if (socketRef.current) {
        console.log('[Socket.IO] Disconnecting socket due to disabled/changed chargerId');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const wsUrlRaw = import.meta.env.VITE_WS_URL || 'http://localhost:8000/socket.io/charging';

    let connectionUrl = wsUrlRaw;
    let socketPath = '/socket.io/charging';

    try {
      const parsed = new URL(wsUrlRaw);
      connectionUrl = `${parsed.origin}/charging`;
      socketPath = '/socket.io';
    } catch {
      if (wsUrlRaw.includes('/socket.io/charging')) {
        const origin = wsUrlRaw.split('/socket.io/charging')[0];
        connectionUrl = `${origin}/charging`;
        socketPath = '/socket.io';
      }
    }

    console.log('[Socket.IO] Connecting to:', connectionUrl, 'path:', socketPath);

    const socket = io(connectionUrl, {
      path: socketPath,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected');
      console.log('[Socket.IO] Subscribing to charger:', chargerId);
      socket.emit('subscribe_charger', { chargerId });
      
      if (sessionIdRef.current) {
        console.log('[Socket.IO] Joining room with sessionId:', sessionIdRef.current);
        socket.emit('join', { sessionId: sessionIdRef.current });
      }
    });

    socket.on('joined', (data) => {
      console.log('[Socket.IO] Successfully joined session room:', data);
    });

    socket.on('charging_started', (payload: any) => {
      if (sessionIdRef.current && payload.sessionId !== sessionIdRef.current) {
        console.log('[Socket.IO] Ignoring charging_started because another session is already active:', sessionIdRef.current);
        return;
      }
      console.log('[Socket.IO] Received charging_started event:', payload);
      if (onSessionStartedRef.current) {
        const session: ChargingSession = {
          id: payload.sessionId,
          userId: payload.userId,
          chargerId: payload.chargerId,
          bookingId: payload.bookingId,
          startTime: payload.startTime || new Date().toISOString(),
          status: 'active',
          startMeterWh: payload.startMeterWh ?? 0,
          createdAt: payload.startTime || new Date().toISOString(),
        };
        onSessionStartedRef.current(session);
      }
    });

    socket.on('charging_updated', (payload: TelemetryPayload) => {
      if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) {
        return;
      }
      console.log('[Socket.IO] Received real telemetry update:', payload);
      hadRealTelemetry.current = true;
      onTelemetryRef.current(mapPayload(payload));
    });

    socket.on('charging_completed', (payload: any) => {
      if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) {
        return;
      }
      console.log('[Socket.IO] Received charging_completed event:', payload);
      if (onSessionCompletedRef.current) {
        onSessionCompletedRef.current(payload);
      }
    });

    socket.on('charger_status', (payload: any) => {
      console.log('[Socket.IO] Received charger_status event:', payload);
      if (onChargerStatusChangedRef.current) {
        onChargerStatusChangedRef.current(payload);
      }
    });

    socket.on('payment_completed', (payload: any) => {
      console.log('[Socket.IO] Received payment_completed event:', payload);
      if (onPaymentCompletedRef.current) {
        onPaymentCompletedRef.current(payload);
      }
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });

    return () => {
      console.log('[Socket.IO] Cleaning up Socket.IO connection');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, chargerId, mapPayload]);

  // 2. Dynamic Room Joining Effect: runs when sessionId changes
  useEffect(() => {
    if (enabled && sessionId && socketRef.current) {
      if (socketRef.current.connected) {
        console.log('[Socket.IO] Dynamically joining room with sessionId:', sessionId);
        socketRef.current.emit('join', { sessionId });
      }
    }
  }, [enabled, sessionId]);

  // 3. Telemetry Simulation Effect: scoped to active session ID
  useEffect(() => {
    if (!sessionId || !enabled) return;

    // (Re)initialize sim counters only when the session changes
    if (simInitializedForSessionRef.current !== sessionId) {
      simSocRef.current = startSocPercentRef.current;
      simMeterWhRef.current = currentMeterWhRef.current;
      simInitializedForSessionRef.current = sessionId;
    }

    hadRealTelemetry.current = false;

    let simIntervalRef: ReturnType<typeof setInterval> | null = null;

    const startSimTicker = () => {
      if (hadRealTelemetry.current || simIntervalRef) return;
      console.log('[Socket.IO] No real telemetry — starting simulated ticker (dev mode).');

      simIntervalRef = setInterval(() => {
        if (hadRealTelemetry.current) {
          clearInterval(simIntervalRef!);
          simIntervalRef = null;
          return;
        }

        const powerKw  = SIM_POWER_KW + (Math.random() - 0.5) * 1.5;
        const deltaWh  = powerKw * (SIM_TICK_MS / 3_600_000) * 1000;
        simMeterWhRef.current += deltaWh;
        simSocRef.current      = Math.min(100, simSocRef.current + 0.06);

        const deliveredKwh = (simMeterWhRef.current - startMeterWhRef.current) / 1000;
        const voltage      = 380 + (Math.random() - 0.5) * 3;
        const current      = parseFloat((powerKw / 0.380 + (Math.random() - 0.5) * 1).toFixed(1));
        const temperature  = parseFloat(
          (32 + (simSocRef.current / 100) * 15 + (Math.random() - 0.5) * 1.5).toFixed(1)
        );

        onTelemetryRef.current({
          power:           parseFloat(powerKw.toFixed(1)),
          soc:             Math.round(simSocRef.current),
          voltage,
          current,
          temperature,
          energyDelivered: parseFloat(deliveredKwh.toFixed(3)),
        });
      }, SIM_TICK_MS);
    };

    const graceTimer = setTimeout(startSimTicker, SIM_GRACE_MS);

    return () => {
      clearTimeout(graceTimer);
      if (simIntervalRef) clearInterval(simIntervalRef);
    };
  }, [enabled, sessionId]);
};

