"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  type LocalModelListResponse,
  type LocalModelStatus,
  localModelApi,
} from "@/api/ws-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { Button } from "@workspace/ui/components/ui/button";
import { Skeleton } from "@workspace/ui/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  Download,
  Loader2,
  LoaderCircle,
  Plus,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  CustomModelDialog,
  isTransitioning,
  ModelCard,
  StatusBadge,
} from "@/features/settings/components/local-model-panel-parts";

const LOCAL_MODEL_REFRESH_EVENT = "atmos-local-model-refresh";

// ─── RuntimeControl ──────────────────────────────────────────────────────────

export function LocalModelRuntimeControl() {
  const t = useTranslations("Settings.localModel");
  const inspectRuntimeErrorRef = useRef(t("errors.inspectRuntime"));
  const [data, setData] = useState<LocalModelListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [confirmDeleteRuntime, setConfirmDeleteRuntime] = useState(false);

  useEffect(() => {
    inspectRuntimeErrorRef.current = t("errors.inspectRuntime");
  }, [t]);

  const load = useCallback(async () => {
    try {
      const res = await localModelApi.list();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : inspectRuntimeErrorRef.current);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = useWebSocketStore.getState().onEvent("local_model_state_changed", (raw) => {
      const payload = raw as { state: LocalModelStatus };
      setData((prev) => (prev ? { ...prev, state: payload.state } : prev));
    });
    return unsub;
  }, []);

  const handleDownloadRuntime = async () => {
    setBusy(true);
    try {
      await localModelApi.downloadRuntime();
      setData((prev) =>
        prev
          ? {
              ...prev,
              state: {
                status: "downloading_runtime",
                progress: 0,
              },
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.runtimeDownloadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRuntime = async () => {
    setBusy(true);
    try {
      await localModelApi.deleteRuntime();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.deleteRuntime"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-8 w-24 rounded-md" />;
  }

  const state = data?.state;
  const installed = data?.runtime.installed ?? false;
  const downloading = state?.status === "downloading_runtime";
  const progress =
    state?.status === "downloading_runtime" ? state.progress * 100 : null;

  return (
    <>
      <div className="flex items-center gap-2">
        {installed ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:text-destructive hover:border-destructive/50"
              disabled={busy}
              onClick={() => setConfirmDeleteRuntime(true)}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {t("common.delete")}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || downloading}
            onClick={handleDownloadRuntime}
          >
            {busy || downloading ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 size-3.5" />
            )}
            {downloading && progress !== null
              ? `${Math.round(progress as number)}%`
              : t("common.download")}
          </Button>
        )}
      </div>

      {/* Delete runtime confirmation dialog */}
      <Dialog open={confirmDeleteRuntime} onOpenChange={setConfirmDeleteRuntime}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("runtime.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("runtime.deleteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteRuntime(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDeleteRuntime(false);
                void handleDeleteRuntime();
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── LocalModelPanel ─────────────────────────────────────────────────────────

interface LocalModelPanelProps {
  onDownloadComplete?: () => void;
}

export function LocalModelPanel({ onDownloadComplete }: LocalModelPanelProps) {
  const t = useTranslations("Settings.localModel");
  const loadModelsErrorRef = useRef({
    loadModels: t("errors.loadModels"),
    remoteCatalogUnavailable: t("errors.remoteCatalogUnavailable"),
  });
  const [data, setData] = useState<LocalModelListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousStateRef = useRef<LocalModelStatus | null>(null);
  const hasCheckedCompletedRef = useRef(false);

  useEffect(() => {
    loadModelsErrorRef.current = {
      loadModels: t("errors.loadModels"),
      remoteCatalogUnavailable: t("errors.remoteCatalogUnavailable"),
    };
  }, [t]);

  const load = useCallback(async () => {
    try {
      const res = await localModelApi.list();
      setData(res);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : loadModelsErrorRef.current.loadModels;
      // If the error mentions manifest fetch failure, show a more helpful message
      if (msg.includes("manifest") || msg.includes("HTTP error")) {
        setError(loadModelsErrorRef.current.remoteCatalogUnavailable);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void load();
  }, [load]);

  // Check if download was completed while modal was closed
  useEffect(() => {
    if (!data || !onDownloadComplete || hasCheckedCompletedRef.current) return;

    // If current state is installed_not_running on initial load, trigger the callback
    // This handles the case where download completed while modal was closed
    if (data.state.status === "installed_not_running") {
      onDownloadComplete();
      hasCheckedCompletedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.state.status]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(LOCAL_MODEL_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_MODEL_REFRESH_EVENT, refresh);
  }, [load]);

  // Subscribe to server-push state changes
  useEffect(() => {
    const unsub = useWebSocketStore.getState().onEvent("local_model_state_changed", (raw) => {
      const payload = raw as { state: LocalModelStatus };
      const previousState = previousStateRef.current;
      previousStateRef.current = payload.state;

      setData((prev) => (prev ? { ...prev, state: payload.state } : prev));

      // Reset the check flag when entering downloading state
      if (payload.state.status === "downloading_model" || payload.state.status === "downloading_runtime") {
        hasCheckedCompletedRef.current = false;
      }

      // Trigger callback when download completes (downloading_model -> installed_not_running)
      if (
        onDownloadComplete &&
        previousState?.status === "downloading_model" &&
        payload.state.status === "installed_not_running"
      ) {
        onDownloadComplete();
      }
    });
    return unsub;
  }, [onDownloadComplete]);

  // Poll while transitioning (Downloading / Starting)
  useEffect(() => {
    const state = data?.state;
    const transitioning = state ? isTransitioning(state) : false;

    if (transitioning && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 2000);
    } else if (!transitioning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data?.state, load]);

  const handleDownload = async (modelId: string) => {
    setBusy(true);
    try {
      await localModelApi.download(modelId);
      setData((prev) =>
        prev
          ? {
              ...prev,
              state: {
                status: "downloading_model",
                model_id: modelId,
                progress: 0,
              },
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.downloadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async (modelId: string) => {
    setBusy(true);
    try {
      setData((prev) =>
        prev ? { ...prev, state: { status: "starting", model_id: modelId, stage: "launching_process" } } : prev,
      );
      await localModelApi.start(modelId);
      // Don't immediately load - let WebSocket events and polling handle state updates
      // This prevents overwriting the "starting" state before backend updates it
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.startModel"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await localModelApi.stop();
      // Don't immediately load - let WebSocket events and polling handle state updates
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.stopModel"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (modelId: string) => {
    setBusy(true);
    try {
      await localModelApi.delete(modelId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.deleteModel"));
    } finally {
      setBusy(false);
    }
  };

  const handleCustomDelete = async (modelId: string) => {
    setBusy(true);
    try {
      await localModelApi.deleteCustom(modelId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.removeCustomModel"));
    } finally {
      setBusy(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  const sortedModels = data
    ? data.models
        .map((model, index) => {
          const installed =
            model.installed ||
            ((data.state.status === "installed_not_running" ||
              data.state.status === "starting" ||
              data.state.status === "running") &&
              data.state.model_id === model.id);
          return { model, index, installed };
        })
        .sort((a, b) => Number(b.installed) - Number(a.installed) || a.index - b.index)
        .map((entry) => entry.model)
    : [];

  return (
    <div className="space-y-3">
      {/* Header row: global status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {data && <StatusBadge state={data.state} />}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-muted-foreground"
          onClick={async () => {
            setRefreshing(true);
            try {
              const res = await localModelApi.refresh();
              setData(res);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : t("errors.refreshManifest"));
            } finally {
              setRefreshing(false);
            }
          }}
          disabled={refreshing || busy}
        >
          {refreshing ? (
            <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RotateCw className="mr-1.5 size-3.5" />
          )}
          {t("common.refresh")}
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Model list */}
      {data && data.models.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t("emptyState.noModels")}
        </div>
      ) : data ? (
        <div className="space-y-2">
          {sortedModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              state={data.state}
              runtimeInstalled={data.runtime.installed}
              onDownload={handleDownload}
              onStart={handleStart}
              onStop={handleStop}
              onDelete={handleDelete}
              onCustomDelete={handleCustomDelete}
              busy={busy || isTransitioning(data.state)}
            />
          ))}
        </div>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-center"
        onClick={() => setCustomDialogOpen(true)}
      >
        <Plus className="mr-1.5 size-3.5" />
        {t("custom.addModelButton")}
      </Button>

      <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          {t("infoBanner.prefix")}{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            ~/.atmos/local-model-runtime/
          </code>
          {t("infoBanner.suffix")}
        </span>
      </div>

      <CustomModelDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        onAdded={() => void load()}
      />
    </div>
  );
}
