"use client";

import { useState, useEffect, useCallback } from "react";
import { systemApi, TmuxStatusResponse } from "@/api/rest-api";

export interface TmuxCheckState {
  isLoading: boolean;
  isInstalled: boolean;
  version: string | null;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to check tmux installation status
 * Call this at app startup to verify tmux is available
 */
export function useTmuxCheck(): TmuxCheckState {
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkTmux = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const status = await systemApi.getTmuxStatus();
      setIsInstalled(status.installed);
      setVersion(status.version);
    } catch (err) {
      // If API fails, assume tmux check failed (backend may not be running)
      setError(err instanceof Error ? err.message : "Failed to check tmux status");
      setIsInstalled(false);
      setVersion(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkTmux();
  }, [checkTmux]);

  return {
    isLoading,
    isInstalled,
    version,
    error,
    refetch: checkTmux,
  };
}
