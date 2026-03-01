"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type MatchClientEvent, type MatchServerEvent, isMatchServerEvent } from "@/lib/api/contracts";
import { createMatchSocketUrl } from "@/lib/api/ws";

export type MatchSocketStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface UseMatchSocketOptions {
  matchId?: string;
  playerId?: string;
  sessionId?: string;
  reconnectToken?: string;
  enabled?: boolean;
  reconnect?: boolean;
  reconnectDelayMs?: number;
  onEvent?: (event: MatchServerEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: Event) => void;
}

export interface UseMatchSocketResult {
  status: MatchSocketStatus;
  sendEvent: (event: MatchClientEvent) => boolean;
  disconnect: () => void;
}

export function useMatchSocket(options: UseMatchSocketOptions): UseMatchSocketResult {
  const {
    matchId,
    playerId,
    sessionId,
    reconnectToken,
    enabled = true,
    reconnect = true,
    reconnectDelayMs = 2000,
    onEvent,
    onOpen,
    onClose,
    onError
  } = options;

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(reconnect);
  const onEventRef = useRef(onEvent);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<MatchSocketStatus>("idle");
  const canConnect = Boolean(enabled && matchId && playerId && sessionId);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    socketRef.current?.close(1000, "manual_disconnect");
    socketRef.current = null;
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = reconnect;
  }, [reconnect]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!canConnect || !matchId || !playerId || !sessionId) {
      setStatus("idle");
      return;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) return;

      setStatus("connecting");
      const wsUrl = createMatchSocketUrl({ matchId, playerId, sessionId, reconnectToken });
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        setStatus("open");
        onOpenRef.current?.();
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as unknown;
          if (isMatchServerEvent(payload)) onEventRef.current?.(payload);
        } catch {
          // Ignore invalid payloads and keep the socket alive.
        }
      };

      socket.onerror = (event) => {
        if (disposed) return;
        setStatus("error");
        onErrorRef.current?.(event);
      };

      socket.onclose = () => {
        if (disposed) return;
        setStatus("closed");
        onCloseRef.current?.();

        if (shouldReconnectRef.current && reconnect) {
          reconnectTimerRef.current = setTimeout(connect, reconnectDelayMs);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close(1000, "component_unmount");
      socketRef.current = null;
    };
  }, [
    canConnect,
    matchId,
    playerId,
    sessionId,
    reconnectToken,
    reconnect,
    reconnectDelayMs
  ]);

  const sendEvent = useCallback((event: MatchClientEvent) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;

    socket.send(JSON.stringify(event));
    return true;
  }, []);

  return { status, sendEvent, disconnect };
}
