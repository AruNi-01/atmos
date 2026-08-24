"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  getWorkspaceCreateOriginKey,
  selectAutoOpenWorkspaceId,
  useWorkspaceCreationStore,
} from "@/features/workspace/store/workspace-creation-store";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import {
  getWorkspaceAutoEnterResumeGraceMs,
  getWorkspaceAutoEnterSeconds,
  WORKSPACE_AUTO_ENTER_DELAY_MS,
} from "./header-workspace-jobs";

export function useWorkspaceCreateAutoOpen(input: {
  grouped: boolean;
  hovering: boolean;
  onAutoEnter: (workspaceId: string) => void;
}): { workspaceId: string | null; remainingSeconds: number } {
  const { currentView, workspaceId, projectId } = useContextParams();
  const jobs = useWorkspaceCreationStore((state) => state.jobs);
  const latestJobId = useWorkspaceCreationStore((state) => state.latestJobId);
  const autoOpenedWorkspaceId = useWorkspaceCreationStore((state) => state.autoOpenedWorkspaceId);
  const setupProgress = useProjectStore((state) => state.setupProgress);
  const currentOriginKey = getWorkspaceCreateOriginKey({
    currentView,
    workspaceId,
    projectId,
  });
  const candidateId = useMemo(
    () =>
      selectAutoOpenWorkspaceId({
        jobs,
        latestJobId,
        autoOpenedWorkspaceId,
        currentOriginKey,
        currentWorkspaceId: workspaceId,
        isEnterable: (id) => !isWorkspaceSetupBlocking(setupProgress[id]),
      }),
    [
      autoOpenedWorkspaceId,
      currentOriginKey,
      jobs,
      latestJobId,
      setupProgress,
      workspaceId,
    ],
  );

  const onAutoEnterRef = useRef(input.onAutoEnter);
  useEffect(() => {
    onAutoEnterRef.current = input.onAutoEnter;
  }, [input.onAutoEnter]);

  const [shown, setShown] = useState<{ id: string | null; remainingMs: number }>({
    id: candidateId,
    remainingMs: candidateId ? WORKSPACE_AUTO_ENTER_DELAY_MS : 0,
  });
  if (shown.id !== candidateId) {
    setShown({
      id: candidateId,
      remainingMs: candidateId ? WORKSPACE_AUTO_ENTER_DELAY_MS : 0,
    });
  }

  const remainingRef = useRef(WORKSPACE_AUTO_ENTER_DELAY_MS);
  const deadlineRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const hoveredOnceRef = useRef(false);
  const enteringRef = useRef(false);
  const sessionIdRef = useRef(candidateId);

  useEffect(() => {
    const clearTick = () => {
      if (tickTimerRef.current != null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
    const captureRemaining = () => {
      if (deadlineRef.current == null) return;
      remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
      deadlineRef.current = null;
    };

    if (sessionIdRef.current !== candidateId) {
      sessionIdRef.current = candidateId;
      remainingRef.current = candidateId ? WORKSPACE_AUTO_ENTER_DELAY_MS : 0;
      hoveredOnceRef.current = false;
      enteringRef.current = false;
      deadlineRef.current = null;
    }

    if (!candidateId) {
      clearTick();
      return;
    }

    if (input.hovering) {
      hoveredOnceRef.current = true;
      captureRemaining();
      clearTick();
      return clearTick;
    }

    if (remainingRef.current <= 0) {
      if (!enteringRef.current) {
        enteringRef.current = true;
        onAutoEnterRef.current(candidateId);
      }
      return;
    }

    const startTicking = () => {
      if (sessionIdRef.current !== candidateId) return;
      deadlineRef.current = Date.now() + remainingRef.current;
      clearTick();
      tickTimerRef.current = window.setInterval(() => {
        const next = Math.max(0, (deadlineRef.current ?? 0) - Date.now());
        remainingRef.current = next;
        setShown({ id: candidateId, remainingMs: next });
        if (next > 0 || enteringRef.current) return;
        enteringRef.current = true;
        clearTick();
        onAutoEnterRef.current(candidateId);
      }, 100);
    };

    const graceMs = hoveredOnceRef.current
      ? getWorkspaceAutoEnterResumeGraceMs(input.grouped)
      : 0;

    if (graceMs <= 0) {
      startTicking();
      return () => {
        captureRemaining();
        clearTick();
      };
    }

    const graceTimer = window.setTimeout(startTicking, graceMs);
    return () => {
      window.clearTimeout(graceTimer);
      captureRemaining();
      clearTick();
    };
  }, [candidateId, input.grouped, input.hovering]);

  const remainingMs =
    shown.id === candidateId
      ? shown.remainingMs
      : candidateId
        ? WORKSPACE_AUTO_ENTER_DELAY_MS
        : 0;

  return {
    workspaceId: candidateId,
    remainingSeconds: candidateId ? getWorkspaceAutoEnterSeconds(remainingMs) : 0,
  };
}
