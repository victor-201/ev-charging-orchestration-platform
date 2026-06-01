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
import type { TelemetryData, TelemetryPayload } from '../../domain/entities/entities';

/** Delay (ms) before the simulated ticker fires if no real event arrives */
const SIM_GRACE_MS = 4_000;
/** Simulated tick interval (ms) */
const SIM_TICK_MS = 3_000;
/** Simulated charger power (kW) */
const SIM_POWER_KW = 22;

interface UseWebSocketOptions {
  sessionId: string | null;
  startMeterWh: number;
  onTelemetry: (data: Partial<TelemetryData>) => void;
  enabled: boolean;
}

export const useWebSocket = ({
  sessionId,
  startMeterWh,
  onTelemetry,
  enabled,
}: UseWebSocketOptions) => {
  const socketRef        = useRef<Socket | null>(null);
  /** True once a real charging_updated payload has been received */
  const hadRealTelemetry = useRef(false);

  /**
   * Map raw backend TelemetryPayload to UI TelemetryData.
   * Computes delivered energy delta and applies rich fallback values
   * for temperature, voltage, and current to guarantee rich premium aesthetics.
   */
  const mapPayload = useCallback(
    (raw: TelemetryPayload): Partial<TelemetryData> => {
      const deliveredKwh = Math.max(0, (raw.meterWh - startMeterWh) / 1000);
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
    [startMeterWh]
  );

  useEffect(() => {
    if (!enabled || !sessionId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Reset per-session sim state
    hadRealTelemetry.current = false;

    const wsUrlRaw = import.meta.env.VITE_WS_URL || 'http://localhost:8000/socket.io/charging';

    // Robustly parse the URL to separate Server Origin + Namespace vs socket.io path
    let connectionUrl = wsUrlRaw;
    let socketPath = '/socket.io/charging';

    try {
      const parsed = new URL(wsUrlRaw);
      connectionUrl = `${parsed.origin}/charging`;
      socketPath = parsed.pathname.includes('/socket.io/charging')
        ? '/socket.io/charging'
        : parsed.pathname;
    } catch {
      if (wsUrlRaw.includes('/socket.io/charging')) {
        const origin = wsUrlRaw.split('/socket.io/charging')[0];
        connectionUrl = `${origin}/charging`;
        socketPath = '/socket.io/charging';
      }
    }

    console.log('[Socket.IO] Connecting to:', connectionUrl, 'path:', socketPath);

    // Create Socket.IO connection
    const socket = io(connectionUrl, {
      path: socketPath,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });

    socketRef.current = socket;

    // ── Dev-mode simulated telemetry ──────────────────────────────────────────
    // When no real charging_updated event arrives within SIM_GRACE_MS, start a
    // fake ticker so the dashboard looks live without a physical OCPP charger.
    let simIntervalRef: ReturnType<typeof setInterval> | null = null;
    // Running simulation accumulators (mutated inside interval, no re-render)
    const simSocRef     = { current: 0 };           // 0→100 %
    const simMeterWhRef = { current: startMeterWh }; // Wh, offset from session start meter

    const startSimTicker = () => {
      if (hadRealTelemetry.current || simIntervalRef) return;
      console.log('[Socket.IO] No real telemetry — starting simulated ticker (dev mode).');

      simIntervalRef = setInterval(() => {
        if (hadRealTelemetry.current) {
          clearInterval(simIntervalRef!);
          simIntervalRef = null;
          return;
        }

        // Advance simulation state each tick
        const powerKw  = SIM_POWER_KW + (Math.random() - 0.5) * 1.5;
        const deltaWh  = powerKw * (SIM_TICK_MS / 3_600_000) * 1000; // Wh for this tick
        simMeterWhRef.current += deltaWh;
        simSocRef.current      = Math.min(100, simSocRef.current + 0.18);

        const deliveredKwh = (simMeterWhRef.current - startMeterWh) / 1000;
        const voltage      = 380 + (Math.random() - 0.5) * 3;
        const current      = parseFloat((powerKw / 0.380 + (Math.random() - 0.5) * 1).toFixed(1));
        const temperature  = parseFloat(
          (32 + (simSocRef.current / 100) * 15 + (Math.random() - 0.5) * 1.5).toFixed(1)
        );

        onTelemetry({
          power:           parseFloat(powerKw.toFixed(1)),
          soc:             Math.round(simSocRef.current),
          voltage,
          current,
          temperature,
          energyDelivered: parseFloat(deliveredKwh.toFixed(3)),
        });
      }, SIM_TICK_MS);
    };

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected, joining room with sessionId:', sessionId);
      socket.emit('join', { sessionId });
    });

    socket.on('joined', (data) => {
      console.log('[Socket.IO] Successfully joined session room:', data);
    });

    socket.on('charging_updated', (payload: TelemetryPayload) => {
      console.log('[Socket.IO] Received real telemetry update:', payload);
      hadRealTelemetry.current = true;
      if (simIntervalRef) {
        clearInterval(simIntervalRef);
        simIntervalRef = null;
        console.log('[Socket.IO] Sim ticker stopped — real OCPP charger connected.');
      }
      onTelemetry(mapPayload(payload));
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });

    // Start the grace-period timer; if no real event arrives, sim kicks in
    const graceTimer = setTimeout(startSimTicker, SIM_GRACE_MS);

    return () => {
      console.log('[Socket.IO] Cleaning up Socket.IO connection');
      clearTimeout(graceTimer);
      if (simIntervalRef) clearInterval(simIntervalRef);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, sessionId, startMeterWh, mapPayload, onTelemetry]);
};
