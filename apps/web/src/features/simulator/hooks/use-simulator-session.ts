"use client";

import React from "react";
import {
  listenSimulatorDownload,
  simulatorApi,
} from "@/api/ws/simulator-api";
import {
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

  const start = React.useCallback(async () => {
    if (!workspaceId) return;
    const off = listenSimulatorDownload((progress) => {
      if (progress.workspace_id && progress.workspace_id !== workspaceId) return;
      setState((prev) => ({ ...prev, phase: "downloading", progress }));
    });
    try {
      setState((prev) => ({ ...prev, phase: "starting", error: null }));
      const result = await simulatorApi.start(workspaceId);
      if (!result.ready) {
        setState({
          phase: result.reason === "ok" || result.reason === "helper_missing" ? "idle" : "setup",
          reason: result.reason ?? "start_failed",
          url: null,
          udid: null,
          progress: null,
          error: null,
        });
        return;
      }
      readyForRef.current = workspaceId;
      setState({
        phase: "ready",
        reason: "ok",
        url: result.url ?? null,
        udid: result.udid ?? null,
        progress: null,
        error: null,
      });
    } catch (err) {
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
  }, [workspaceId]);

  React.useEffect(() => {
    if (!active || !workspaceId) return;
    if (readyForRef.current === workspaceId) return;
    let cancelled = false;
    setState((prev) =>
      prev.phase === "ready" ? prev : { ...INITIAL, phase: "probing" },
    );
    void (async () => {
      try {
        const [probe, claim] = await Promise.all([
          simulatorApi.probe(),
          simulatorApi.status(workspaceId),
        ]);
        if (cancelled) return;
        if (claim?.url) {
          readyForRef.current = workspaceId;
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
        const reason = probe.reason;
        const canStart = reason === "ok" || reason === "helper_missing";
        setState({
          phase: canStart ? "idle" : "setup",
          reason,
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
  }, [active, workspaceId]);

  const disconnect = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      await simulatorApi.stop(workspaceId);
    } catch {
      /* ignore */
    }
    readyForRef.current = null;
    setState((prev) => ({ ...prev, phase: "idle", reason: "ok", url: null, udid: null }));
  }, [workspaceId]);

  return {
    ...state,
    action: setupActionForReason(state.reason),
    start,
    retry: start,
    disconnect,
  };
}
