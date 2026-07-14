"use client";

import { useEffect } from "react";
import { focusManager, onlineManager } from "@tanstack/react-query";

/**
 * Wires TanStack focus/online managers to browser events.
 * Does NOT call WebSocket connect — WebSocketProvider owns reconnect.
 */
export function QueryFocusBridge() {
  useEffect(() => {
    const onVisibility = () => {
      focusManager.setFocused(document.visibilityState === "visible");
    };
    const onOnline = () => {
      onlineManager.setOnline(true);
    };
    const onOffline = () => {
      onlineManager.setOnline(false);
    };

    onVisibility();
    onlineManager.setOnline(typeof navigator === "undefined" ? true : navigator.onLine);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return null;
}
