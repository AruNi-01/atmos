"use client";

import { useEffect, useState } from "react";
import {
  hostSessionApi,
  type HostSessionGetResponse,
} from "@/api/ws/host-session-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { isCancelledError } from "@/shared/lib/is-cancelled-error";

export function useHostSessionPreview(key: string | null): {
  preview: HostSessionGetResponse | null;
  isLoading: boolean;
  error: string | null;
} {
  const connected = useWebSocketStore((state) => state.connectionState === "connected");
  const [preview, setPreview] = useState<HostSessionGetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !connected) {
      setPreview(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setPreview(null);
    void hostSessionApi
      .get(key)
      .then((response) => {
        if (cancelled) return;
        setPreview(response);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || isCancelledError(err)) return;
        setError(err instanceof Error ? err.message : "error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, key]);

  return { preview, isLoading, error };
}
