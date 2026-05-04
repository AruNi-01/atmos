"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  type LocalModelEntry,
  type LocalModelListResponse,
  type LocalModelStatus,
  localModelApi,
} from "@/api/ws-api";
import { useWebSocketStore } from "@/hooks/use-websocket";
import { Button } from "@workspace/ui/components/ui/button";
import { Badge } from "@workspace/ui/components/ui/badge";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import {
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  Play,
  Square,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function statusLabel(state: LocalModelStatus): string {
  switch (state.status) {
    case "not_installed":
      return "Not installed";
    case "downloading_binary":
      return `Downloading runtime… ${(state.progress * 100).toFixed(1)}%`;
    case "downloading_model":
      return `Downloading model… ${(state.progress * 100).toFixed(1)}%`;
    case "installed_not_running":
      return "Installed, not running";
    case "starting":
      return "Starting…";
    case "running":
      return "Running";
    case "failed":
      return `Failed: ${state.error}`;
  }
}

function statusColor(state: LocalModelStatus): string {
  switch (state.status) {
    case "running":
      return "text-success";
    case "failed":
      return "text-destructive";
    case "downloading_binary":
    case "downloading_model":
    case "starting":
      return "text-warning";
    default:
      return "text-muted-foreground";
  }
}

function isTransitioning(state: LocalModelStatus): boolean {
  return (
    state.status === "downloading_binary" ||
    state.status === "downloading_model" ||
    state.status === "starting"
  );
}

// ─── ProgressBar ────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ state }: { state: LocalModelStatus }) {
  const busy = isTransitioning(state);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        statusColor(state),
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : state.status === "running" ? (
        <CheckCircle2 className="size-3.5" />
      ) : state.status === "failed" ? (
        <TriangleAlert className="size-3.5" />
      ) : (
        <CircleDot className="size-3.5" />
      )}
      {statusLabel(state)}
    </div>
  );
}

// ─── ModelCard ──────────────────────────────────────────────────────────────

interface ModelCardProps {
  model: LocalModelEntry;
  state: LocalModelStatus;
  onDownload: (id: string) => void;
  onStart: (id: string) => void;
  onStop: () => void;
  onDelete: (id: string) => void;
  busy: boolean;
}

function ModelCard({
  model,
  state,
  onDownload,
  onStart,
  onStop,
  onDelete,
  busy,
}: ModelCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRunning =
    state.status === "running" && state.model_id === model.id;
  const isDownloading =
    (state.status === "downloading_binary" ||
      state.status === "downloading_model") &&
    (!state.model_id || state.model_id === model.id);
  const isInstalled =
    (state.status === "installed_not_running" ||
      state.status === "starting" ||
      state.status === "running") &&
    (!state.model_id || state.model_id === model.id);

  const downloadProgress =
    state.status === "downloading_binary" ||
    state.status === "downloading_model"
      ? state.progress * 100
      : null;

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-4 transition-colors",
          isRunning && "border-green-500/30 bg-green-500/5",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Left: info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {model.display_name}
              </span>
              {model.recommended && (
                <Badge variant="secondary" className="text-xs">
                  Recommended
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {model.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <HardDrive className="size-3" />
                {formatBytes(model.size_bytes)}
              </span>
              {model.license_url &&
              (model.license_url.startsWith('http://') ||
                model.license_url.startsWith('https://')) ? (
                <a
                  href={model.license_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-foreground hover:underline"
                >
                  <Tag className="size-3" />
                  {model.license}
                  <ExternalLink className="size-2.5" />
                </a>
              ) : (
                <span className="flex items-center gap-1">
                  <Tag className="size-3" />
                  {model.license}
                </span>
              )}
              {model.tags.map((tag) => (
                <span key={tag} className="rounded bg-muted px-1.5 py-0.5">
                  {tag}
                </span>
              ))}
            </div>

            {/* Download progress bar */}
            {isDownloading && downloadProgress !== null && (
              <div className="mt-3 space-y-1">
                <ProgressBar value={downloadProgress} />
                <p className="text-xs text-muted-foreground">
                  {state.status === "downloading_binary"
                    ? "Downloading runtime binary"
                    : "Downloading model weights"}
                  {(state.status === "downloading_binary" ||
                    state.status === "downloading_model") &&
                  state.eta_seconds != null
                    ? ` — ~${state.eta_seconds}s remaining`
                    : ""}
                </p>
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 items-center gap-2">
            {!isInstalled && !isDownloading && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onDownload(model.id)}
                  >
                    <Download className="mr-1.5 size-3.5" />
                    Download
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Download model to ~/.atmos/local-model/models/
                </TooltipContent>
              </Tooltip>
            )}

            {isInstalled &&
              !isRunning &&
              state.status !== "starting" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onStart(model.id)}
                >
                  <Play className="mr-1.5 size-3.5" />
                  Start
                </Button>
              )}

            {(isRunning || state.status === "starting") && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || state.status === "starting"}
                onClick={onStop}
              >
                <Square className="mr-1.5 size-3.5" />
                Stop
              </Button>
            )}

            {isInstalled &&
              !isRunning &&
              state.status !== "starting" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete model files</TooltipContent>
                </Tooltip>
              )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete model files?</DialogTitle>
            <DialogDescription>
              This will permanently delete the downloaded model files for{" "}
              <strong>{model.display_name}</strong>. You can re-download it
              later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                onDelete(model.id);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── LocalModelPanel ─────────────────────────────────────────────────────────

export function LocalModelPanel() {
  const [data, setData] = useState<LocalModelListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onEvent = useWebSocketStore((s) => s.onEvent);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await localModelApi.list();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void load();
  }, [load]);

  // Subscribe to server-push state changes
  useEffect(() => {
    const unsub = onEvent("local_model_state_changed", (raw) => {
      const payload = raw as { state: LocalModelStatus };
      setData((prev) => (prev ? { ...prev, state: payload.state } : prev));
    });
    return unsub;
  }, [onEvent]);

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
                status: "downloading_binary",
                progress: 0,
              },
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async (modelId: string) => {
    setBusy(true);
    try {
      setData((prev) =>
        prev ? { ...prev, state: { status: "starting" } } : prev,
      );
      await localModelApi.start(modelId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start model");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await localModelApi.stop();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop model");
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
      setError(e instanceof Error ? e.message : "Failed to delete model");
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

  return (
    <div className="space-y-3">
      {/* Header row: global status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {data && <StatusBadge state={data.state} />}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Notice: small models are less capable */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Local models are compact (≤ 4 B parameters) and optimised for simple
          tasks like git commit messages. Output quality may be lower than
          cloud-hosted models — choose carefully when binding features.
        </span>
      </div>

      {/* Model list */}
      {data && data.models.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          No models available in the manifest. Check your network connection or
          try again later.
        </div>
      ) : (
        <div className="space-y-2">
          {data?.models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              state={data.state}
              onDownload={handleDownload}
              onStart={handleStart}
              onStop={handleStop}
              onDelete={handleDelete}
              busy={busy}
            />
          ))}
        </div>
      )}

      {/* Docs link */}
      <div className="pt-1 text-xs text-muted-foreground">
        Model files are stored in{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
          ~/.atmos/local-model/
        </code>
        .{" "}
        <a
          href="https://github.com/AruNi-01/atmos/issues/88"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
        >
          Learn more
          <ChevronRight className="size-3" />
        </a>
      </div>
    </div>
  );
}
