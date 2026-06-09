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
  const setCreateProjectOpen = useDialogStore((s) => s.setCreateProjectOpen);
  const router = useAppRouter();
  const isVisible = Boolean(newWorkspace || isClosing);

  useEffect(() => {
    if (isVisible && !isClosing) {
      previousFocusRef.current = document.activeElement;
    }
  }, [isVisible, isClosing]);

  const close = useCallback(() => {
    setIsClosing(true);
    const savedEl = previousFocusRef.current;
    setTimeout(() => {
      setIsClosing(false);
      setAnimationState("idle");
      void setNewWorkspace(false);
      if (savedEl instanceof HTMLElement && savedEl.isConnected) {
        savedEl.focus();
      }
      previousFocusRef.current = null;
    }, 350);
  }, [setNewWorkspace]);

  const openCreateProject = useCallback(() => {
    setCreateProjectOpen(true);
  }, [setCreateProjectOpen]);

  const connectAgent = useCallback(() => {
    void setNewWorkspace(false);
    router.push("/agents");
  }, [router, setNewWorkspace]);

  useEffect(() => {
    if (!newWorkspace) {
      prevNewWorkspaceRef.current = false;
      return;
    }
    if (prevNewWorkspaceRef.current) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      prevNewWorkspaceRef.current = true;
      setAnimationState("entering");
    });
    return () => cancelAnimationFrame(raf);
  }, [newWorkspace]);

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
