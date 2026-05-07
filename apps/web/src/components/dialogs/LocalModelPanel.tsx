"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  type LocalModelEntry,
  type LocalModelHfResolveResponse,
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
  CircleDot,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  LoaderCircle,
  MemoryStick,
  Play,
  Plus,
  RotateCw,
  Square,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

const LOCAL_MODEL_REFRESH_EVENT = "atmos-local-model-refresh";

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
    case "downloading_runtime":
      return `Downloading runtime… ${(state.progress * 100).toFixed(1)}%`;
    case "downloading_model":
      return `Downloading model… ${(state.progress * 100).toFixed(1)}%`;
    case "installed_not_running":
      return "Model installed, not running";
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
    case "downloading_runtime":
    case "downloading_model":
    case "starting":
      return "text-warning";
    default:
      return "text-muted-foreground";
  }
}

function isTransitioning(state: LocalModelStatus): boolean {
  return (
    state.status === "downloading_runtime" ||
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

// ─── CustomModelDialog ───────────────────────────────────────────────────────

function CustomModelDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [url, setUrl] = useState("");
  const [resolved, setResolved] = useState<LocalModelHfResolveResponse | null>(null);
  const [lastChoices, setLastChoices] = useState<LocalModelHfResolveResponse | null>(null);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [ramFootprintMb, setRamFootprintMb] = useState("");
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedModel = resolved?.kind === "model" ? resolved.model : null;

  const reset = () => {
    setUrl("");
    setResolved(null);
    setLastChoices(null);
    setSelectedUrl("");
    setDisplayName("");
    setRamFootprintMb("");
    setResolving(false);
    setSaving(false);
    setError(null);
  };

  const handleResolve = async (nextUrl = url) => {
    const trimmed = nextUrl.trim();
    if (!trimmed) {
      setError("Paste a Hugging Face GGUF URL first.");
      return;
    }
    setResolving(true);
    setError(null);
    setLastChoices(null);
    setSelectedUrl("");
    try {
      const result = await localModelApi.resolveHfUrl(trimmed);
      setResolved(result);
      if (result.kind === "choices") {
        setLastChoices(result);
        setSelectedUrl("");
      }
      if (result.kind === "model") {
        setSelectedUrl(result.model.source_url ?? trimmed);
        setDisplayName(result.model.display_name);
        setRamFootprintMb(String(result.model.ram_footprint_mb));
      }
    } catch (e) {
      setResolved(null);
      setError(e instanceof Error ? e.message : "Failed to resolve Hugging Face URL");
    } finally {
      setResolving(false);
    }
  };

  const handleChooseChoice = async (choiceUrl: string) => {
    setResolving(true);
    setError(null);
    try {
      const result = await localModelApi.resolveHfUrl(choiceUrl);
      setResolved(result);
      if (result.kind === "model") {
        setSelectedUrl(result.model.source_url ?? choiceUrl);
        setDisplayName(result.model.display_name);
        setRamFootprintMb(String(result.model.ram_footprint_mb));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve GGUF file");
    } finally {
      setResolving(false);
    }
  };

  const handleChooseAnother = () => {
    if (!lastChoices) return;
    setResolved(lastChoices);
    setSelectedUrl("");
  };

  const handleSave = async () => {
    if (!resolvedModel) return;
    setSaving(true);
    setError(null);
    try {
      await localModelApi.addCustom({
        url: selectedUrl || resolvedModel.source_url || url,
        displayName: displayName.trim() || resolvedModel.display_name,
        ramFootprintMb: Number(ramFootprintMb) || resolvedModel.ram_footprint_mb,
      });
      onAdded();
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add custom model");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom Hugging Face model</DialogTitle>
          <DialogDescription>
            Paste a Hugging Face model page or GGUF file URL. If the model page
            has no GGUF files, Atmos will search public GGUF variants.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Hugging Face URL
            </label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://huggingface.co/Qwen/Qwen2.5-0.5B"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                disabled={resolving}
                onClick={() => void handleResolve()}
              >
                {resolving ? <Loader2 className="size-4 animate-spin" /> : "Resolve"}
              </Button>
            </div>
          </div>

          {resolved?.kind === "choices" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                Choose a GGUF file
              </p>
              {resolved.choices.some((choice) => choice.discovered) && (
                <p className="text-xs text-muted-foreground">
                  No GGUF file was found in the pasted repo, so these candidates
                  were discovered from Hugging Face search.
                </p>
              )}
              <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-border p-2">
                {resolved.choices.map((choice) => (
                  <div
                    key={choice.url}
                    className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-border"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => void handleChooseChoice(choice.url)}
                    >
                      <span className="block truncate font-medium text-foreground">
                        {choice.filename}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground">
                        {choice.repo_id}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {choice.size_bytes != null && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            Storage ~{formatBytes(choice.size_bytes)}
                          </span>
                        )}
                        {choice.ram_footprint_mb != null && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            Min memory ~
                            {formatBytes(choice.ram_footprint_mb * 1024 * 1024)}
                          </span>
                        )}
                      </span>
                    </button>
                    <a
                      href={choice.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={`Open ${choice.filename} in browser`}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolvedModel && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Selected GGUF file</p>
                  <p className="mt-0.5 break-all" title={selectedUrl}>
                    {selectedUrl}
                  </p>
                </div>
                {lastChoices && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-start text-xs sm:justify-self-end"
                    onClick={handleChooseAnother}
                  >
                    Choose another file
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Min memory (MB)
                  <input
                    value={ramFootprintMb}
                    onChange={(event) => setRamFootprintMb(event.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Storage ~{formatBytes(resolvedModel.size_bytes)}</span>
                <span>SHA256 {resolvedModel.sha256.slice(0, 12)}…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!resolvedModel || saving} onClick={handleSave}>
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Add model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RuntimeControl ──────────────────────────────────────────────────────────

export function LocalModelRuntimeControl() {
  const [data, setData] = useState<LocalModelListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEvent = useWebSocketStore((s) => s.onEvent);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await localModelApi.list();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to inspect runtime");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = onEvent("local_model_state_changed", (raw) => {
      const payload = raw as { state: LocalModelStatus };
      setData((prev) => (prev ? { ...prev, state: payload.state } : prev));
      if (payload.state.status !== "downloading_runtime") {
        void load();
      }
    });
    return unsub;
  }, [load, onEvent]);

  useEffect(() => {
    const downloading = data?.state.status === "downloading_runtime";
    if (downloading && !pollRef.current) {
      pollRef.current = setInterval(() => void load(), 2000);
    } else if (!downloading && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data?.state.status, load]);

  const handleDownload = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
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
      setError(e instanceof Error ? e.message : "Runtime download failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setRefreshing(true);
    try {
      await load();
      window.dispatchEvent(new Event(LOCAL_MODEL_REFRESH_EVENT));
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-9 w-36 rounded-md" />;
  }

  const state = data?.state;
  const installed = data?.runtime.installed ?? false;
  const downloading = state?.status === "downloading_runtime";
  const progress =
    state?.status === "downloading_runtime" ? state.progress * 100 : null;

  if (installed) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          disabled={refreshing}
          onClick={handleRefresh}
          title="Refresh local model status"
          aria-label="Refresh local model status"
        >
          {refreshing ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RotateCw className="size-3.5" />
          )}
        </Button>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-medium text-success">
          <CheckCircle2 className="size-3.5" />
          Runtime installed
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        disabled={refreshing}
        onClick={handleRefresh}
        title="Refresh local model status"
        aria-label="Refresh local model status"
      >
        {refreshing ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <RotateCw className="size-3.5" />
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || downloading}
        onClick={handleDownload}
      >
        {busy || downloading ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Download className="mr-1.5 size-3.5" />
        )}
        {downloading && progress !== null
          ? `Runtime ${progress.toFixed(0)}%`
          : "Download Runtime"}
      </Button>
      {error && (
        <span className="max-w-48 truncate text-xs text-destructive" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── ModelCard ──────────────────────────────────────────────────────────────

interface ModelCardProps {
  model: LocalModelEntry;
  state: LocalModelStatus;
  runtimeInstalled: boolean;
  onDownload: (id: string) => void;
  onStart: (id: string) => void;
  onStop: () => void;
  onDelete: (id: string) => void;
  onCustomDelete: (id: string) => void;
  busy: boolean;
}

function ModelCard({
  model,
  state,
  runtimeInstalled,
  onDownload,
  onStart,
  onStop,
  onDelete,
  onCustomDelete,
  busy,
}: ModelCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRunning =
    state.status === "running" && state.model_id === model.id;
  const isDownloading =
    state.status === "downloading_model" &&
    state.model_id === model.id;
  const isInstalled =
    model.installed ||
    ((state.status === "installed_not_running" ||
      state.status === "starting" ||
      state.status === "running") &&
      state.model_id === model.id);

  const downloadProgress =
    state.status === "downloading_model"
      ? state.progress * 100
      : null;
  const canRemove =
    model.custom && !isRunning && state.status !== "starting";
  const canDeleteFiles =
    isInstalled && !isRunning && state.status !== "starting";

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-border p-4 transition-colors",
          isRunning && "border-green-500/30",
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
              {model.custom && (
                <Badge variant="outline" className="text-xs">
                  Custom
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {model.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <HardDrive className="size-3" />
                Storage ~{formatBytes(model.size_bytes)}
              </span>
              <span className="flex items-center gap-1">
                <MemoryStick className="size-3" />
                Min memory ~{formatBytes(model.ram_footprint_mb * 1024 * 1024)}
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
                  Downloading model weights
                  {state.status === "downloading_model" &&
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
                  Download model to ~/.atmos/local-model-runtime/models/
                </TooltipContent>
              </Tooltip>
            )}

            {isInstalled &&
              !isRunning &&
              state.status !== "starting" && (
                runtimeInstalled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onStart(model.id)}
                  >
                    <Play className="mr-1.5 size-3.5" />
                    Start
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button size="sm" variant="outline" disabled>
                          <Play className="mr-1.5 size-3.5" />
                          Start
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Download Runtime first</TooltipContent>
                  </Tooltip>
                )
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

            {(canDeleteFiles || canRemove) && (
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
                  <TooltipContent>
                    {model.custom ? "Remove custom model" : "Delete model files"}
                  </TooltipContent>
                </Tooltip>
              )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {model.custom ? "Remove custom model?" : "Delete model files?"}
            </DialogTitle>
            <DialogDescription>
              {model.custom ? (
                <>
                  This will remove <strong>{model.display_name}</strong> from
                  your custom models and delete its downloaded files if present.
                </>
              ) : (
                <>
                  This will permanently delete the downloaded model files for{" "}
                  <strong>{model.display_name}</strong>. You can re-download it
                  later.
                </>
              )}
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
                if (model.custom) {
                  onCustomDelete(model.id);
                } else {
                  onDelete(model.id);
                }
              }}
            >
              {model.custom ? "Remove" : "Delete"}
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
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const onEvent = useWebSocketStore((s) => s.onEvent);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await localModelApi.list();
      setData(res);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load models";
      // If the error mentions manifest fetch failure, show a more helpful message
      if (msg.includes("manifest") || msg.includes("HTTP error")) {
        setError("Using bundled local model catalog. Remote catalog unavailable.");
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

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(LOCAL_MODEL_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(LOCAL_MODEL_REFRESH_EVENT, refresh);
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
                status: "downloading_model",
                model_id: modelId,
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
        prev ? { ...prev, state: { status: "starting", model_id: modelId } } : prev,
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

  const handleCustomDelete = async (modelId: string) => {
    setBusy(true);
    try {
      await localModelApi.deleteCustom(modelId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove custom model");
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
      <div className="flex items-center">
        <div className="flex items-center gap-2">
          {data && <StatusBadge state={data.state} />}
        </div>
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
          No models available in the manifest. Check your network connection or
          try again later.
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
        Add custom model
      </Button>

      <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Local models are compact (≤ 4 B parameters) and optimised for simple
          tasks like git commit messages. Download Runtime before starting a
          model. Output quality may be lower than cloud-hosted models — choose
          carefully when binding features. Model files are stored in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            ~/.atmos/local-model-runtime/
          </code>
          .
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
