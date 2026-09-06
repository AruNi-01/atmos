"use client";

import React from "react";
import {
  listenSimulatorDownload,
  simulatorApi,
} from "@/api/ws/simulator-api";
import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";
import { useSimulatorRuntimeStore } from "../store/use-simulator-runtime-store";
import {
  displayReasonFromProbe,
  displayReasonFromStart,
  probeCanStart,
  setupActionForReason,
  type SimulatorDownloadProgress,
  type SimulatorReason,
} from "../types";

export type SimulatorSessionState = {
  phase: "probing" | "idle" | "setup" | "downloading" | "starting" | "ready" | "error";
  reason: SimulatorReason;
  url: string | null;
  udid: string | null;
  progress: SimulatorDownloadProgress | null;
  error: string | null;
};

const INITIAL: SimulatorSessionState = {
  phase: "probing",
  reason: "ok",
  url: null,
  udid: null,
  progress: null,
  error: null,
};

export function useSimulatorSession(input: {
  workspaceId: string | null;
  active: boolean;
}) {
  const { workspaceId, active } = input;
  const [state, setState] = React.useState<SimulatorSessionState>(INITIAL);
  const readyForRef = React.useRef<string | null>(null);
  const setRunning = useSimulatorRuntimeStore((store) => store.setRunning);
  const running = useSimulatorRuntimeStore((store) =>
    Boolean(workspaceId && store.runningByWorkspace[workspaceId]),
  );

  const start = React.useCallback(async () => {
    if (!workspaceId) return;
    if (isHostedAtmosOrigin()) {
      setState({
        phase: "setup",
        reason: "not_desktop",
        url: null,
        udid: null,
        progress: null,
        error: null,
      });
      return;
    }
    const off = listenSimulatorDownload((progress) => {
      if (progress.workspace_id && progress.workspace_id !== workspaceId) return;
      setState((prev) => ({ ...prev, phase: "downloading", progress }));
    });
    try {
      setState((prev) => ({ ...prev, phase: "starting", error: null }));
      const result = await simulatorApi.start(workspaceId);
      if (!result.ready) {
        setRunning(workspaceId, false);
        const reason = displayReasonFromStart(
          result.reason ?? "start_failed",
          result.probe,
        );
        setState({
          phase: reason === "ok" || reason === "helper_missing" ? "idle" : "setup",
          reason,
          url: null,
          udid: null,
          progress: null,
          error: null,
        });
        return;
      }
      readyForRef.current = workspaceId;
      setRunning(workspaceId, true);
      setState({
        phase: "ready",
        reason: "ok",
        url: result.url ?? null,
        udid: result.udid ?? null,
        progress: null,
        error: null,
      });
    } catch (err) {
      setRunning(workspaceId, false);
      setState({
        phase: "error",
        reason: "start_failed",
        url: null,
        udid: null,
        progress: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      off();
    }
  }, [setRunning, workspaceId]);

  React.useEffect(() => {
    if (!active || !workspaceId) return;
    if (readyForRef.current === workspaceId) return;
    let cancelled = false;
    setState((prev) =>
      prev.phase === "ready" ? prev : { ...INITIAL, phase: "probing" },
    );
    void (async () => {
      try {
        if (isHostedAtmosOrigin()) {
          if (cancelled) return;
          setRunning(workspaceId, false);
          setState({
            phase: "setup",
            reason: "not_desktop",
            url: null,
            udid: null,
            progress: null,
            error: null,
          });
          return;
        }
        const [probe, claim] = await Promise.all([
          simulatorApi.probe(),
          simulatorApi.status(workspaceId),
        ]);
        if (cancelled) return;
        if (claim?.url) {
          readyForRef.current = workspaceId;
          setRunning(workspaceId, true);
          setState({
            phase: "ready",
            reason: "ok",
            url: claim.url,
            udid: claim.udid ?? null,
            progress: null,
            error: null,
          });
          return;
        }
        setRunning(workspaceId, false);
        const canStart = probeCanStart(probe);
        setState({
          phase: canStart ? "idle" : "setup",
          reason: canStart ? (probe.ready ? "ok" : "helper_missing") : displayReasonFromProbe(probe),
          url: null,
          udid: null,
          progress: null,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          reason: "start_failed",
          url: null,
          udid: null,
          progress: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, setRunning, workspaceId]);

  React.useEffect(() => {
    if (!workspaceId || running || state.phase !== "ready") return;
    readyForRef.current = null;
    setState({
      phase: "idle",
      reason: "ok",
      url: null,
      udid: null,
      progress: null,
      error: null,
    });
  }, [running, state.phase, workspaceId]);

  const disconnect = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      await simulatorApi.stop(workspaceId);
    } catch {
      /* ignore */
    }
    readyForRef.current = null;
    setRunning(workspaceId, false);
    setState((prev) => ({ ...prev, phase: "idle", reason: "ok", url: null, udid: null }));
  }, [setRunning, workspaceId]);

  return {
    ...state,
    action: setupActionForReason(state.reason),
    start,
    retry: start,
    disconnect,
  };
}
