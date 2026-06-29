"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_PEEK_CLOSE_DELAY_MS = 160;

const SIDEBAR_PEEK_KEEP_OPEN_SELECTOR = [
  "[data-workspace-popover-surface='true']:hover",
  "[data-radix-popper-content-wrapper]:hover",
  "[data-slot='popover-content']:hover",
  "[data-slot='hover-card-content']:hover",
  "[data-slot='tooltip-content']:hover",
  "[data-slot='dropdown-menu-content']:hover",
  "[data-slot='dropdown-menu-sub-content']:hover",
].join(", ");

const SIDEBAR_PEEK_KEEP_OPEN_TARGET_SELECTOR = [
  "[data-workspace-popover-surface='true']",
  "[data-radix-popper-content-wrapper]",
  "[data-slot='popover-content']",
  "[data-slot='hover-card-content']",
  "[data-slot='tooltip-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-sub-content']",
].join(", ");

export function useSidebarPeekVisibility() {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const showPeek = useCallback(() => {
    clearCloseTimer();
    setIsVisible(true);
  }, [clearCloseTimer]);

  const scheduleHide = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      if (
        triggerRef.current?.matches(":hover") ||
        panelRef.current?.matches(":hover") ||
        document.querySelector(SIDEBAR_PEEK_KEEP_OPEN_SELECTOR)
      ) {
        closeTimerRef.current = null;
        return;
      }

      setIsVisible(false);
      closeTimerRef.current = null;
    }, SIDEBAR_PEEK_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const handlePointerLeave = useCallback(
    (relatedTarget: EventTarget | null) => {
      if (isSidebarPeekKeepOpenTarget(relatedTarget)) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    },
    [clearCloseTimer, scheduleHide],
  );

  const handleFocusLeave = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
      if (isSidebarPeekKeepOpenTarget(nextTarget)) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    },
    [clearCloseTimer, scheduleHide],
  );

  useEffect(() => {
    if (!isVisible) return;

    const handlePointerOver = (event: PointerEvent) => {
      const target = event.target;
      if (
        isNodeInsideRef(target, triggerRef) ||
        isNodeInsideRef(target, panelRef) ||
        isSidebarPeekKeepOpenTarget(target)
      ) {
        clearCloseTimer();
        return;
      }
      scheduleHide();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
    };
  }, [clearCloseTimer, isVisible, scheduleHide]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  return {
    handleFocusLeave,
    handlePointerLeave,
    isVisible,
    panelRef,
    showPeek,
    triggerRef,
  };
}

function isNodeInsideRef(
  target: EventTarget | null,
  ref: React.RefObject<HTMLElement | null>,
) {
  return target instanceof Node && ref.current?.contains(target);
}

function isSidebarPeekKeepOpenTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest(SIDEBAR_PEEK_KEEP_OPEN_TARGET_SELECTOR))
  );
}
