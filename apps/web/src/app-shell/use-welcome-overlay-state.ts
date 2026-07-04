"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryState } from "nuqs";

import { useAppRouter } from "@/shared/hooks/use-app-router";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";

type WelcomeOverlayAnimationState = "idle" | "entering" | "visible";

export function useWelcomeOverlayState() {
  const [newWorkspace, setNewWorkspace] = useQueryState(
    "newWorkspace",
    centerStageParams.newWorkspace,
  );
  const [isClosing, setIsClosing] = useState(false);
  const [animationState, setAnimationState] =
    useState<WelcomeOverlayAnimationState>("idle");
  const prevNewWorkspaceRef = useRef(false);
  const previousFocusRef = useRef<Element | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const setCreateProjectOpen = useDialogStore((s) => s.setCreateProjectOpen);
  const router = useAppRouter();
  const isVisible = Boolean(newWorkspace || isClosing);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  useEffect(() => {
    if (isVisible && !isClosing) {
      previousFocusRef.current = document.activeElement;
    }
  }, [isVisible, isClosing]);

  const close = useCallback(() => {
    if (isClosing) return;
    clearCloseTimer();
    setIsClosing(true);
    const savedEl = previousFocusRef.current;
    void setNewWorkspace(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsClosing(false);
      setAnimationState("idle");
      if (savedEl instanceof HTMLElement && savedEl.isConnected) {
        savedEl.focus();
      }
      previousFocusRef.current = null;
    }, 420);
  }, [clearCloseTimer, isClosing, setNewWorkspace]);

  const openCreateProject = useCallback(() => {
    setCreateProjectOpen(true);
  }, [setCreateProjectOpen]);

  const connectAgent = useCallback(() => {
    clearCloseTimer();
    setIsClosing(false);
    setAnimationState("idle");
    void setNewWorkspace(false);
    router.push("/agents");
  }, [clearCloseTimer, router, setNewWorkspace]);

  useEffect(() => {
    if (!newWorkspace) {
      prevNewWorkspaceRef.current = false;
      return;
    }
    if (isClosing) {
      clearCloseTimer();
      prevNewWorkspaceRef.current = true;
      const raf = requestAnimationFrame(() => {
        setIsClosing(false);
        setAnimationState("visible");
      });
      return () => cancelAnimationFrame(raf);
    }
    if (prevNewWorkspaceRef.current) {
      return;
    }

    clearCloseTimer();
    const raf = requestAnimationFrame(() => {
      prevNewWorkspaceRef.current = true;
      setAnimationState("entering");
    });
    return () => cancelAnimationFrame(raf);
  }, [clearCloseTimer, isClosing, newWorkspace]);

  useEffect(() => {
    if (animationState !== "entering") return;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimationState("visible");
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [animationState]);

  return {
    animationState,
    close,
    connectAgent,
    isClosing,
    isVisible,
    openCreateProject,
  };
}
