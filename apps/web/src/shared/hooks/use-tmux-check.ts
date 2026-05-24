"use client";

import { useState, useEffect, useCallback } from "react";
import { systemApi } from "@/api/rest-api";

export interface TmuxCheckState {
  isLoading: boolean;
  isInstalled: boolean | null;
  version: string | null;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseTmuxCheckOptions {
  enabled?: boolean;
}

/**
 * Hook to check tmux installation status
 * Call this at app startup to verify tmux is available
 */
export function useTmuxCheck(options: UseTmuxCheckOptions = {}): TmuxCheckState {
  const { enabled = true } = options;
  const [isLoading, setIsLoading] = useState(enabled);
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkTmux = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      setIsInstalled(null);
      setVersion(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const status = await systemApi.getTmuxStatus();
      setIsInstalled(status.installed);
      setVersion(status.version);
    } catch (err) {
      // Only show the install prompt when the backend explicitly reports tmux missing.
      setError(err instanceof Error ? err.message : "Failed to check tmux status");
      setIsInstalled(null);
      setVersion(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void checkTmux();
  }, [checkTmux]);

  return {
    isLoading,
    isInstalled,
    version,
    error,
    refetch: checkTmux,
  };
}
