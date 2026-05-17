/**
 * EVOLTTOUCH Kiosk — WebSocket Hook
 *
 * Maintains a persistent, auto-reconnecting WebSocket connection
 * to Kong Gateway for real-time telemetry during ACTIVE sessions.
 *
 * Real WS payload maps to TelemetryPayload from types/index.ts.
 * Mock mode simulates realistic EV charging data.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { TelemetryData, TelemetryPayload, WsMessage } from '../types';

const WS_RECONNECT_DELAY_MS = 3000;
const WS_MAX_RECONNECTS = 10;

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
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Map raw backend TelemetryPayload to UI TelemetryData.
   * Converts Wh to kWh and computes delivered energy delta.
   */
  const mapPayload = useCallback(
    (raw: TelemetryPayload): Partial<TelemetryData> => {
      const deliveredKwh = Math.max(0, (raw.meterWh - startMeterWh) / 1000);
      return {
        soc: raw.socPercent,
        power: raw.powerKw,
        voltage: raw.voltageV,
        current: raw.currentA,
        temperature: raw.temperatureC,
        energyDelivered: parseFloat(deliveredKwh.toFixed(2)),
      };
    },
    [startMeterWh]
  );

  const cleanup = useCallback(() => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.onclose = null; // Prevent reconnect loop on intentional close
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !sessionId) return;

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/telemetry';
    const chargerId = import.meta.env.VITE_CHARGER_ID || 'CHG-001-A';

    try {
      const ws = new WebSocket(`${wsUrl}/${chargerId}?sessionId=${sessionId}`);
      socketRef.current = ws;

      ws.onopen = () => {
        reconnectCountRef.current = 0;
        console.log('[WS] Connected to telemetry stream');
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string);
          if (msg.type === 'telemetry') {
            const mapped = mapPayload(msg.payload as TelemetryPayload);
            onTelemetry(mapped);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        console.warn('[WS] Connection error');
      };

      ws.onclose = () => {
        socketRef.current = null;
        if (enabled && reconnectCountRef.current < WS_MAX_RECONNECTS) {
          reconnectCountRef.current++;
          console.log(`[WS] Reconnecting (${reconnectCountRef.current}/${WS_MAX_RECONNECTS})...`);
          reconnectTimerRef.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
        }
      };
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
    }
  }, [enabled, sessionId, mapPayload, onTelemetry]);

  useEffect(() => {
    if (!enabled || !sessionId) {
      cleanup();
      return;
    }

    const isMock = import.meta.env.VITE_ENABLE_MOCK_DATA === 'true';

    if (isMock) {
      // ── Mock Mode: Simulate realistic EV charging telemetry ──
      let mockSoc = 98;
      let mockMeterWh = startMeterWh;
      let mockPower = 150;

      mockIntervalRef.current = setInterval(() => {
        // Simulate power fluctuation
        mockPower = Math.max(50, Math.min(200, mockPower + (Math.random() - 0.5) * 10));
        // Accumulate energy
        mockMeterWh += (mockPower / 3600) * 1000; // Wh per second
        // Increment SoC (roughly)
        mockSoc = Math.min(100, mockSoc + 0.02);

        const raw: TelemetryPayload = {
          sessionId: sessionId,
          socPercent: Math.round(mockSoc),
          powerKw: parseFloat(mockPower.toFixed(1)),
          meterWh: Math.round(mockMeterWh),
          voltageV: 395 + (Math.random() - 0.5) * 10,
          currentA: parseFloat((mockPower / 0.395).toFixed(1)), // P = V × I
          temperatureC: 32 + (Math.random() - 0.5) * 4,
          recordedAt: new Date().toISOString(),
        };

        onTelemetry(mapPayload(raw));
      }, 1000);

      return cleanup;
    }

    // Real WebSocket connection
    reconnectCountRef.current = 0;
    connect();

    return cleanup;
  }, [enabled, sessionId, startMeterWh, connect, cleanup, mapPayload, onTelemetry]);
};
