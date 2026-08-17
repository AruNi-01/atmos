"use client";

import React from "react";
import {
  useRegisteredAppNavigationGuard,
  type AppNavigationTarget,
} from "@/shared/hooks/app-navigation-intercept";
import { useAppRouter } from "@/shared/hooks/use-app-router";

type LeaveActions = {
  discard: () => void;
  afterSave?: () => void;
};

/**
 * Dirty-form leave protection for automation setup:
 * baseline snapshot, in-app nav guard, beforeunload, and popstate confirm.
 */
export function useAutomationSetupLeaveGuard({
  ready,
  mode,
  agentId,
  setupSnapshot,
}: {
  ready: boolean;
  mode: "create" | "edit";
  agentId: string;
  setupSnapshot: string;
}) {
  const router = useAppRouter();
  const baselineRef = React.useRef<string | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const pendingLeaveRef = React.useRef<{
    discard: () => void;
    afterSave: () => void;
  } | null>(null);
  const bypassNavRef = React.useRef(false);
  const isDirtyRef = React.useRef(false);
  const allowPopStateLeaveRef = React.useRef(false);

  React.useEffect(() => {
    if (!ready) return;
    if (mode === "create" && !agentId) return;
    if (baselineRef.current === null) {
      baselineRef.current = setupSnapshot;
    }
  }, [agentId, mode, ready, setupSnapshot]);

  const isDirty =
    baselineRef.current !== null && baselineRef.current !== setupSnapshot;
  isDirtyRef.current = isDirty;

  const requestLeave = React.useCallback((actions: LeaveActions) => {
    if (!isDirtyRef.current) {
      actions.discard();
      return;
    }
    pendingLeaveRef.current = {
      discard: actions.discard,
      afterSave: actions.afterSave ?? (() => undefined),
    };
    setLeaveDialogOpen(true);
  }, []);

  const resumeNavigation = React.useCallback(
    (target: AppNavigationTarget) => {
      bypassNavRef.current = true;
      if (target.kind === "replace") {
        router.replace(target.path);
      } else {
        router.push(target.path);
      }
      bypassNavRef.current = false;
    },
    [router],
  );

  const navigationGuard = React.useCallback(
    (target: AppNavigationTarget) => {
      if (bypassNavRef.current || !isDirtyRef.current) {
        return false;
      }
      requestLeave({
        discard: () => resumeNavigation(target),
        afterSave: () => resumeNavigation(target),
      });
      return true;
    },
    [requestLeave, resumeNavigation],
  );
  useRegisteredAppNavigationGuard(navigationGuard);

  React.useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  React.useEffect(() => {
    if (!isDirty) return;
    window.history.pushState({ automationSetupGuard: true }, "", window.location.href);
    const handlePopState = () => {
      if (allowPopStateLeaveRef.current || !isDirtyRef.current) {
        return;
      }
      window.history.pushState({ automationSetupGuard: true }, "", window.location.href);
      requestLeave({
        discard: () => {
          allowPopStateLeaveRef.current = true;
          window.history.back();
        },
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty, requestLeave]);

  const clearDirtyBaseline = React.useCallback(() => {
    baselineRef.current = null;
    isDirtyRef.current = false;
  }, []);

  const handleStay = React.useCallback(() => {
    setLeaveDialogOpen(false);
    pendingLeaveRef.current = null;
  }, []);

  const handleDiscard = React.useCallback(() => {
    const pending = pendingLeaveRef.current;
    isDirtyRef.current = false;
    baselineRef.current = setupSnapshot;
    setLeaveDialogOpen(false);
    pendingLeaveRef.current = null;
    pending?.discard();
  }, [setupSnapshot]);

  const handleSaveAndLeave = React.useCallback(
    async (save: () => Promise<boolean>) => {
      const pending = pendingLeaveRef.current;
      const saved = await save();
      if (!saved) {
        setLeaveDialogOpen(false);
        pendingLeaveRef.current = null;
        return;
      }
      setLeaveDialogOpen(false);
      pendingLeaveRef.current = null;
      pending?.afterSave();
    },
    [],
  );

  return {
    isDirty,
    leaveDialogOpen,
    requestLeave,
    clearDirtyBaseline,
    handleStay,
    handleDiscard,
    handleSaveAndLeave,
  };
}
