"use client";

import React from "react";
import {
  listenSimulatorDownload,
  simulatorApi,
} from "@/api/ws/simulator-api";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { useSimulatorRuntimeStore } from "../store/use-simulator-runtime-store";
import {
  displayReasonFromProbe,
  displayReasonFromStart,
  probeCanStart,
  setupActionForReason,
  simulatorHelperReachable,
  type SimulatorDevicePlatform,
  type SimulatorDownloadProgress,
  type SimulatorProbe,
  type SimulatorReason,
} from "../types";

export type SimulatorSessionState = {
  phase: "probing" | "idle" | "setup" | "downloading" | "starting" | "ready" | "error";
  reason: SimulatorReason;
  url: string | null;
  udid: string | null;
  probe: SimulatorProbe | null;
  progress: SimulatorDownloadProgress | null;
  error: string | null;
};

const INITIAL: SimulatorSessionState = {
  phase: "probing",
  reason: "ok",
  url: null,
  udid: null,
  probe: null,
  progress: null,
  error: null,
};

const RELAY_UNREACHABLE: SimulatorSessionState = {
  phase: "setup",
  reason: "not_desktop",
  url: null,
  udid: null,
  probe: null,
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
  const previewUrlRef = React.useRef<string | null>(null);
  const lastPlatformRef = React.useRef<SimulatorDevicePlatform | undefined>(undefined);
  previewUrlRef.current = state.url;
  const connectionMode = useAtmosComputerStore((store) => store.connectionMode);
  const setRunning = useSimulatorRuntimeStore((store) => store.setRunning);
  const setPlatform = useSimulatorRuntimeStore((store) => store.setPlatform);
  const running = useSimulatorRuntimeStore((store) =>
    Boolean(workspaceId && store.runningByWorkspace[workspaceId]),
  );

  const start = React.useCallback(async (opts?: {
    udid?: string;
    platform?: SimulatorDevicePlatform;
  }) => {
    if (!workspaceId) return;
    if (!simulatorHelperReachable(connectionMode)) {
      setState(RELAY_UNREACHABLE);
      return;
    }
    if (opts?.platform) {
      lastPlatformRef.current = opts.platform;
      setPlatform(workspaceId, opts.platform);
    }
    const off = listenSimulatorDownload((progress) => {
      if (progress.workspace_id && progress.workspace_id !== workspaceId) return;
      setState((prev) => ({ ...prev, phase: "downloading", progress }));
    });
    try {
      setState((prev) => ({ ...prev, phase: "starting", error: null }));
      const result = await simulatorApi.start(workspaceId, opts);
      if (!result.ready) {
        if (opts?.udid && previewUrlRef.current) {
          setState((prev) => ({
            ...prev,
            phase: "ready",
            reason: "ok",
            progress: null,
            error: null,
          }));
          return;
        }
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
          probe: result.probe ?? null,
          progress: null,
          error: null,
        });
        return;
      }
      readyForRef.current = workspaceId;
      const platform = result.platform ?? opts?.platform ?? null;
      if (platform) setPlatform(workspaceId, platform);
      setRunning(workspaceId, true);
      setState({
        phase: "ready",
        reason: "ok",
        url: result.url ?? null,
        udid: result.udid ?? null,
        probe: result.probe ?? null,
        progress: null,
        error: null,
      });
    } catch (err) {
      if (opts?.udid && previewUrlRef.current) {
        setState((prev) => ({
          ...prev,
          phase: "ready",
          reason: "ok",
          progress: null,
          error: null,
        }));
        return;
      }
      setRunning(workspaceId, false);
      setState({
        phase: "error",
        reason: "start_failed",
        url: null,
        udid: null,
        probe: null,
        progress: null,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      off();
    }
  }, [connectionMode, setPlatform, setRunning, workspaceId]);

  React.useEffect(() => {
    if (!active || !workspaceId) return;
    if (readyForRef.current === workspaceId) return;
    let cancelled = false;
    setState((prev) =>
      prev.phase === "ready" ? prev : { ...INITIAL, phase: "probing" },
    );
    void (async () => {
      try {
        if (!simulatorHelperReachable(connectionMode)) {
          if (cancelled) return;
          setRunning(workspaceId, false);
          setState(RELAY_UNREACHABLE);
          return;
        }
        const [probe, claim] = await Promise.all([
          simulatorApi.probe(),
          simulatorApi.status(workspaceId),
        ]);
        if (cancelled) return;
        if (claim?.url) {
          readyForRef.current = workspaceId;
          lastPlatformRef.current = claim.platform;
          setPlatform(workspaceId, claim.platform);
          setRunning(workspaceId, true);
          setState({
            phase: "ready",
            reason: "ok",
            url: claim.url,
            udid: claim.udid ?? null,
            probe,
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
          probe,
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
          probe: null,
          progress: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, connectionMode, setPlatform, setRunning, workspaceId]);

  React.useEffect(() => {
    if (!workspaceId || running || state.phase !== "ready") return;
    readyForRef.current = null;
    setState((prev) => ({
      phase: "idle",
      reason: "ok",
      url: null,
      udid: null,
      probe: prev.probe,
      progress: null,
      error: null,
    }));
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
    setState((prev) => ({
      ...prev,
      phase: "idle",
      reason: "ok",
      url: null,
      udid: null,
    }));
  }, [setRunning, workspaceId]);

  const retry = React.useCallback(() => {
    void start(
      lastPlatformRef.current ? { platform: lastPlatformRef.current } : undefined,
    );
  }, [start]);

  return {
    ...state,
    action: setupActionForReason(state.reason),
    start,
    retry,
    disconnect,
  };
}
