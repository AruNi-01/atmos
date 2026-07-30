"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Expand a toolbar on hover, but delay collapse on leave so the pointer can
 * travel to a portaled dropdown (e.g. split-agent menu) without the action
 * rail vanishing underneath.
 */
export function useToolbarHoverExpand(collapseDelayMs = 400) {
  const [hovered, setHovered] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current != null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const onToolbarMouseEnter = useCallback(() => {
    clearLeaveTimer();
    setHovered(true);
  }, [clearLeaveTimer]);

  const onToolbarMouseLeave = useCallback(() => {
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setHovered(false);
      leaveTimerRef.current = null;
    }, collapseDelayMs);
  }, [clearLeaveTimer, collapseDelayMs]);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  return { toolbarHovered: hovered, onToolbarMouseEnter, onToolbarMouseLeave };
}
