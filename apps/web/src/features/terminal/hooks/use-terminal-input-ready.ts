import { useCallback, useEffect, useRef } from "react";

const TERMINAL_INPUT_READY_DEBOUNCE_MS = 180;
const TERMINAL_INPUT_READY_FALLBACK_MS = 1200;

interface UseTerminalInputReadyArgs {
  onSessionReady?: (sessionId: string) => void;
  sessionId: string;
}

export function useTerminalInputReady({
  onSessionReady,
  sessionId,
}: UseTerminalInputReadyArgs) {
  const inputReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputReadyFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputReadyNotifiedRef = useRef(false);

  const clearInputReadyTimers = useCallback(() => {
    if (inputReadyTimerRef.current) {
      clearTimeout(inputReadyTimerRef.current);
      inputReadyTimerRef.current = null;
    }
    if (inputReadyFallbackTimerRef.current) {
      clearTimeout(inputReadyFallbackTimerRef.current);
      inputReadyFallbackTimerRef.current = null;
    }
  }, []);

  const resetInputReady = useCallback(() => {
    inputReadyNotifiedRef.current = false;
    clearInputReadyTimers();
  }, [clearInputReadyTimers]);

  const notifyInputReady = useCallback(() => {
    if (inputReadyNotifiedRef.current) return;
    inputReadyNotifiedRef.current = true;
    onSessionReady?.(sessionId);
  }, [onSessionReady, sessionId]);

  const scheduleInputReady = useCallback(() => {
    if (inputReadyNotifiedRef.current) return;
    if (inputReadyTimerRef.current) {
      clearTimeout(inputReadyTimerRef.current);
    }
    inputReadyTimerRef.current = setTimeout(() => {
      inputReadyTimerRef.current = null;
      notifyInputReady();
    }, TERMINAL_INPUT_READY_DEBOUNCE_MS);
  }, [notifyInputReady]);

  const scheduleInputReadyFallback = useCallback(() => {
    if (inputReadyNotifiedRef.current) return;
    if (inputReadyFallbackTimerRef.current) {
      clearTimeout(inputReadyFallbackTimerRef.current);
    }
    inputReadyFallbackTimerRef.current = setTimeout(() => {
      inputReadyFallbackTimerRef.current = null;
      notifyInputReady();
    }, TERMINAL_INPUT_READY_FALLBACK_MS);
  }, [notifyInputReady]);

  useEffect(() => clearInputReadyTimers, [clearInputReadyTimers]);

  return {
    clearInputReadyTimers,
    resetInputReady,
    scheduleInputReady,
    scheduleInputReadyFallback,
  };
}
