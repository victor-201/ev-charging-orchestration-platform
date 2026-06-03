'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export type TelemetrySocketPayload = {
  sessionId: string;
  chargerId: string;
  powerKw: number | null;
  meterWh: number | null;
  socPercent: number | null;
  recordedAt: Date;
};

export type TelemetryReading = {
  id: string;
  recordedAt: string;
  powerKw: number | null;
  meterWh: number | null;
  voltageV: number | null;
  currentA: number | null;
  socPercent: number | null;
  temperatureC: number | null;
  errorCode: string | null;
};

interface UseTelemetrySocketOptions {
  sessionId: string | null;
  enabled: boolean;
  onTelemetry: (data: TelemetryReading) => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:8000/socket.io/charging';

export const useTelemetrySocket = ({
  sessionId,
  enabled,
  onTelemetry,
}: UseTelemetrySocketOptions) => {
  const socketRef = useRef<Socket | null>(null);

  const mapPayload = useCallback(
    (raw: TelemetrySocketPayload): TelemetryReading => {
      const currentPower = raw.powerKw ?? 0;
      const computedVoltage = 380 + (Math.random() - 0.5) * 4;
      const computedCurrent = currentPower > 0
        ? parseFloat((currentPower / 0.380).toFixed(1))
        : 0;
      const computedTemp = currentPower > 0
        ? parseFloat((32 + (currentPower / 350) * 15 + (Math.random() - 0.5) * 2).toFixed(1))
        : 25;

      return {
        id: `${raw.sessionId}-${Date.now()}`,
        recordedAt: typeof raw.recordedAt === 'string' ? raw.recordedAt : new Date(raw.recordedAt).toISOString(),
        powerKw: raw.powerKw,
        meterWh: raw.meterWh,
        voltageV: computedVoltage,
        currentA: computedCurrent,
        socPercent: raw.socPercent,
        temperatureC: computedTemp,
        errorCode: null,
      };
    },
    []
  );

  useEffect(() => {
    if (!enabled || !sessionId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    let connectionUrl = WS_URL;
    let socketPath = '/socket.io/charging';

    try {
      const parsed = new URL(WS_URL);
      connectionUrl = `${parsed.origin}/charging`;
      socketPath = parsed.pathname.includes('/socket.io/charging')
        ? '/socket.io/charging'
        : parsed.pathname;
    } catch {
      if (WS_URL.includes('/socket.io/charging')) {
        const origin = WS_URL.split('/socket.io/charging')[0];
        connectionUrl = `${origin}/charging`;
        socketPath = '/socket.io/charging';
      }
    }

    const socket: Socket = io(connectionUrl, {
      path: socketPath,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', { sessionId });
    });

    socket.on('joined', () => {
      // successfully joined room
    });

    socket.on('charging_updated', (payload: TelemetrySocketPayload) => {
      onTelemetry(mapPayload(payload));
    });

    socket.on('connect_error', () => {
      // connection error
    });

    socket.on('disconnect', () => {
      // disconnected
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, sessionId, mapPayload, onTelemetry]);
};
