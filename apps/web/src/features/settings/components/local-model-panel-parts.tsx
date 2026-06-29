"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  type LocalModelEntry,
  type LocalModelHfResolveResponse,
  type LocalModelStatus,
  localModelApi,
} from "@/api/ws-api";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
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
import { cn } from "@workspace/ui/lib/utils";
import {
  CheckCircle2,
  CircleDot,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  MemoryStick,
  Play,
  Square,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTimeRemaining(
  seconds: number,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return t("time.minutesSeconds", {
      minutes,
      seconds: remainingSeconds,
    });
  }
  return t("time.seconds", { seconds: Math.round(seconds) });
}

function statusLabel(
  state: LocalModelStatus,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  switch (state.status) {
    case "not_installed":
      return t("status.notInstalled");
    case "downloading_runtime":
      return t("status.downloadingRuntime", { progress: (state.progress * 100).toFixed(1) });
    case "downloading_model":
      return t("status.downloadingModel", { progress: (state.progress * 100).toFixed(1) });
    case "installed_not_running":
      return t("status.installedNotRunning");
    case "starting":
      if (state.stage === "launching_process") return t("status.launchingProcess");
      if (state.stage === "waiting_for_ready") return t("status.waitingForReady");
      return t("status.starting");
    case "running":
      return t("status.running");
    case "failed":
      return t("status.failed", { error: state.error });
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

export function isTransitioning(state: LocalModelStatus): boolean {
  return (
    state.status === "downloading_runtime" ||
    state.status === "downloading_model" ||
    state.status === "starting"
  );
}

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

export function StatusBadge({ state }: { state: LocalModelStatus }) {
  const t = useTranslations("Settings.localModel");
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
      {statusLabel(state, t)}
    </div>
  );
}

export function CustomModelDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const t = useTranslations("Settings.localModel");
  const [url, setUrl] = useState("");
  const [resolved, setResolved] =
    useState<LocalModelHfResolveResponse | null>(null);
  const [lastChoices, setLastChoices] =
    useState<LocalModelHfResolveResponse | null>(null);
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
      setError(t("custom.errors.pasteUrlFirst"));
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
      setError(
        e instanceof Error ? e.message : t("custom.errors.resolveUrl"),
      );
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
      setError(e instanceof Error ? e.message : t("custom.errors.resolveFile"));
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
      setError(e instanceof Error ? e.message : t("custom.errors.addModel"));
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
          <DialogTitle>{t("custom.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("custom.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              {t("custom.urlLabel")}
            </label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={t("custom.urlPlaceholder")}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                disabled={resolving}
                onClick={() => void handleResolve()}
              >
                {resolving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  t("custom.resolve")
                )}
              </Button>
            </div>
          </div>

          {resolved?.kind === "choices" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                {t("custom.chooseFileTitle")}
              </p>
              {resolved.choices.some((choice) => choice.discovered) && (
                <p className="text-xs text-muted-foreground">
                  {t("custom.discoveredChoicesDescription")}
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
                            {t("custom.storageApprox", { size: formatBytes(choice.size_bytes) })}
                          </span>
                        )}
                        {choice.ram_footprint_mb != null && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {t("custom.minMemoryApprox", {
                              size: formatBytes(choice.ram_footprint_mb * 1024 * 1024),
                            })}
                          </span>
                        )}
                      </span>
                    </button>
                    <a
                      href={choice.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={t("custom.openInBrowserAria", { filename: choice.filename })}
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
                  <p className="font-medium text-foreground">
                    {t("custom.selectedFileTitle")}
                  </p>
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
                    {t("custom.chooseAnother")}
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-foreground">
                  {t("custom.displayNameLabel")}
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-foreground">
                  {t("custom.minMemoryLabel")}
                  <input
                    value={ramFootprintMb}
                    onChange={(event) => setRamFootprintMb(event.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{t("custom.storageApprox", { size: formatBytes(resolvedModel.size_bytes) })}</span>
                <span>{t("custom.sha256Prefix", { hash: resolvedModel.sha256.slice(0, 12) })}</span>
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
            {t("common.cancel")}
          </Button>
          <Button disabled={!resolvedModel || saving} onClick={handleSave}>
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {t("custom.addModel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

export function ModelCard({
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
  const t = useTranslations("Settings.localModel");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRunning = state.status === "running" && state.model_id === model.id;
  const isDownloading =
    state.status === "downloading_model" && state.model_id === model.id;
  const isInstalled =
    model.installed ||
    ((state.status === "installed_not_running" ||
      state.status === "starting" ||
      state.status === "running") &&
      state.model_id === model.id);

  const downloadProgress =
    state.status === "downloading_model" ? state.progress * 100 : null;
  const canRemove = model.custom && !isRunning && state.status !== "starting";
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
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {model.display_name}
              </span>
              {model.recommended && (
                <Badge variant="secondary" className="text-xs">
                  {t("badges.recommended")}
                </Badge>
              )}
              {model.custom && (
                <Badge variant="outline" className="text-xs">
                  {t("badges.custom")}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {model.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <HardDrive className="size-3" />
                {t("model.storageApprox", { size: formatBytes(model.size_bytes) })}
              </span>
              <span className="flex items-center gap-1">
                <MemoryStick className="size-3" />
                {t("model.minMemoryApprox", { size: formatBytes(model.ram_footprint_mb * 1024 * 1024) })}
              </span>
              {model.license_url &&
              (model.license_url.startsWith("http://") ||
                model.license_url.startsWith("https://")) ? (
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

            {isDownloading && downloadProgress !== null && (
              <div className="mt-3 space-y-1">
                <ProgressBar value={downloadProgress} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t("model.downloadingWeights")}
                    {state.status === "downloading_model" &&
                    state.eta_seconds != null
                      ? ` ${t("model.remainingEta", { eta: formatTimeRemaining(state.eta_seconds, t) })}`
                      : ""}
                  </span>
                  <span>{downloadProgress.toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>

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
                    {t("common.download")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("model.downloadTooltip")}
                </TooltipContent>
              </Tooltip>
            )}

            {isInstalled &&
              !isRunning &&
              state.status !== "starting" &&
              (runtimeInstalled ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onStart(model.id)}
                  >
                    <Play className="mr-1.5 size-3.5" />
                    {t("common.start")}
                  </Button>
                  {(canDeleteFiles || canRemove) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-muted-foreground hover:text-destructive hover:border-destructive/50"
                          disabled={busy}
                          onClick={() => setConfirmDelete(true)}
                        >
                          <Trash2 className="mr-1.5 size-3.5" />
                          {t("common.delete")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {model.custom
                          ? t("model.removeCustomTooltip")
                          : t("model.deleteFilesTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button size="sm" variant="outline" disabled>
                        <Play className="mr-1.5 size-3.5" />
                        {t("common.start")}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("model.downloadRuntimeFirst")}</TooltipContent>
                </Tooltip>
              ))}

            {(isRunning || state.status === "starting") && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || state.status === "starting"}
                onClick={onStop}
              >
                <Square className="mr-1.5 size-3.5" />
                {t("common.stop")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {model.custom ? t("deleteDialog.removeCustomTitle") : t("deleteDialog.deleteFilesTitle")}
            </DialogTitle>
            <DialogDescription>
              {model.custom ? (
                t("deleteDialog.removeCustomDescription", { name: model.display_name })
              ) : (
                t("deleteDialog.deleteFilesDescription", { name: model.display_name })
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
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
              {model.custom ? t("common.remove") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
