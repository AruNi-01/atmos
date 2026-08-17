"use client";

import React from "react";
import {
  DEFAULT_LIVE_PORT,
  defaultLiveWsUrl,
  isLiveEvent,
  normalizeLiveEvent,
  type LiveEvent,
} from "../live/protocol";

export function useLiveEvents(liveUrl: string | undefined, onEvent: (event: LiveEvent) => void) {
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;

  React.useEffect(() => {
    if (liveUrl === "") return;
    const wsUrl = liveUrl ?? (typeof window === "undefined" ? defaultLiveWsUrl() : defaultBrowserLiveWs());
    if (!wsUrl) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }
      ws.onmessage = (ev) => {
        try {
          const parsed: unknown = JSON.parse(String(ev.data));
          if (isLiveEvent(parsed)) onEventRef.current(normalizeLiveEvent(parsed));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [liveUrl]);
}

function defaultBrowserLiveWs(): string | null {
  if (typeof window === "undefined") return defaultLiveWsUrl();
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (window.location.protocol === "https:" && !local) return null;
  return `ws://127.0.0.1:${DEFAULT_LIVE_PORT}/ws`;
}
