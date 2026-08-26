"use client";

import { useEffect, useRef, useState } from "react";
import { getWorkspaceAutoEnterSeconds } from "./header-workspace-jobs";

export function usePausedDeadlineCountdown(input: {
  sessionKey: string | null;
  durationMs: number;
  paused: boolean;
  onComplete: () => void;
}): { remainingMs: number; remainingSeconds: number } {
  const [shown, setShown] = useState({
    key: input.sessionKey,
    remainingMs: input.sessionKey ? input.durationMs : 0,
  });
  if (shown.key !== input.sessionKey) {
    setShown({
      key: input.sessionKey,
      remainingMs: input.sessionKey ? input.durationMs : 0,
    });
  }

  const remainingMs =
    shown.key === input.sessionKey
      ? shown.remainingMs
      : input.sessionKey
        ? input.durationMs
        : 0;

  const onCompleteRef = useRef(input.onComplete);
  const leftoverRef = useRef(remainingMs);
  const sessionRef = useRef(input.sessionKey);
  const completedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = input.onComplete;
  });

  useEffect(() => {
    if (sessionRef.current !== input.sessionKey) {
      sessionRef.current = input.sessionKey;
      leftoverRef.current = input.sessionKey ? input.durationMs : 0;
      completedRef.current = false;
    }

    const key = input.sessionKey;
    let deadline: number | null = null;
    let timer: number | null = null;

    const captureRemaining = () => {
      if (deadline == null) return;
      leftoverRef.current = Math.max(0, deadline - Date.now());
      deadline = null;
      setShown({ key, remainingMs: leftoverRef.current });
    };

    if (!key) {
      return;
    }

    if (input.paused) {
      return;
    }

    if (leftoverRef.current <= 0) {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
      }
      return;
    }

    deadline = Date.now() + leftoverRef.current;
    timer = window.setInterval(() => {
      const next = Math.max(0, (deadline ?? 0) - Date.now());
      leftoverRef.current = next;
      setShown({ key, remainingMs: next });
      if (next > 0 || completedRef.current) return;
      completedRef.current = true;
      deadline = null;
      if (timer != null) window.clearInterval(timer);
      onCompleteRef.current();
    }, 100);

    return () => {
      captureRemaining();
      if (timer != null) window.clearInterval(timer);
    };
  }, [input.durationMs, input.paused, input.sessionKey]);

  return {
    remainingMs,
    remainingSeconds: getWorkspaceAutoEnterSeconds(remainingMs),
  };
}
