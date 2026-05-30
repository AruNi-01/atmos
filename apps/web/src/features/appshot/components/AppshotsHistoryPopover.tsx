"use client";

import React from "react";
import { Badge, Button, ScrollArea, Skeleton, cn } from "@workspace/ui";
import {
  AlertCircle,
  Camera,
  ChevronDown,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";
import { ShortcutKeySequence } from "@/shared/components/shortcut-key-sequence";

import {
  copyAppshotRecord,
  deleteAppshotRecord,
  getAppshotStatus,
  getDeniedAppshotPermissions,
  listAppshotRecords,
  readAppshotRecords,
  readAppshotSnapshot,
  showAppshotPermissionsWindow,
  watchAppshotStatusAfterPermissionOpen,
} from "../lib/appshot-client";
import { sanitizeRecordDetailPayloads } from "../lib/appshot-payload";
import type {
  AppshotRecordDetail,
  AppshotRecordListItem,
  AppshotStatus,
} from "../types";
import { AppshotRecordRow } from "./AppshotRecordRow";

type AppshotsHistoryPopoverProps = {
  open: boolean;
};

const PAGE_SIZE = 10;
const DETAIL_BATCH_SIZE = 3;
const APPSHOT_CAPTURE_SHORTCUT_KEYS = ["Left ⇧", "Right ⇧"];

export function AppshotsHistoryPopover({ open }: AppshotsHistoryPopoverProps) {
  const [status, setStatus] = React.useState<AppshotStatus | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [records, setRecords] = React.useState<AppshotRecordListItem[]>([]);
  const [details, setDetails] = React.useState<Record<string, AppshotRecordDetail>>({});
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [copyingTimestamp, setCopyingTimestamp] = React.useState<string | null>(null);
  const [copiedTimestamp, setCopiedTimestamp] = React.useState<string | null>(null);
  const [deletingTimestamp, setDeletingTimestamp] = React.useState<string | null>(null);
  const [previewImage, setPreviewImage] = React.useState<{
    timestamp: string;
    src: string;
    alt: string;
  } | null>(null);
  const permissionWatcherRef = React.useRef<(() => void) | null>(null);
  const copyResetTimerRef = React.useRef<number | null>(null);
  const previewRequestRef = React.useRef(0);

  const refreshStatus = React.useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const nextStatus = await getAppshotStatus();
      setStatus(nextStatus);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const refreshHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const nextRecords = await listAppshotRecords();
      setRecords([...nextRecords].sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      setVisibleCount(PAGE_SIZE);
      setDetails({});
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    void refreshStatus();
    void refreshHistory();
  }, [open, refreshHistory, refreshStatus]);

  React.useEffect(() => {
    if (!open || records.length === 0) {
      return;
    }

    const visibleTimestamps = records.slice(0, visibleCount).map((item) => item.timestamp);
    const missingTimestamps = visibleTimestamps.filter((timestamp) => !details[timestamp]);
    if (missingTimestamps.length === 0) {
      return;
    }

    const batchTimestamps = missingTimestamps.slice(0, DETAIL_BATCH_SIZE);
    let cancelled = false;
    setDetailLoading(true);
    setHistoryError(null);
    void readAppshotRecords(batchTimestamps)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        const sanitizedRows = sanitizeRecordDetailPayloads(rows);
        setDetails((current) => {
          const next = { ...current };
          for (const row of sanitizedRows) {
            next[row.timestamp] = row;
          }
          return next;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setHistoryError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [details, open, records, visibleCount]);

  const clearCopyResetTimer = React.useCallback(() => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      permissionWatcherRef.current?.();
      clearCopyResetTimer();
      previewRequestRef.current += 1;
    };
  }, [clearCopyResetTimer]);

  const deniedPermissions = getDeniedAppshotPermissions(status);
  const visibleRecords = records.slice(0, visibleCount);
  const hasMore = visibleCount < records.length;

  const handleOpenPermission = React.useCallback(
    async () => {
      try {
        await showAppshotPermissionsWindow();
        permissionWatcherRef.current?.();
        permissionWatcherRef.current = watchAppshotStatusAfterPermissionOpen(refreshStatus);
      } catch (err) {
        setStatusError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshStatus],
  );

  const handleCopy = React.useCallback(async (timestamp: string) => {
    setCopyingTimestamp(timestamp);
    setCopiedTimestamp(null);
    clearCopyResetTimer();
    try {
      await copyAppshotRecord(timestamp);
      setCopiedTimestamp(timestamp);
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopiedTimestamp((current) => (current === timestamp ? null : current));
      }, 1_500);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopyingTimestamp(null);
    }
  }, [clearCopyResetTimer]);

  const handleDelete = React.useCallback(async (timestamp: string) => {
    setDeletingTimestamp(timestamp);
    try {
      await deleteAppshotRecord(timestamp);
      setRecords((current) => current.filter((item) => item.timestamp !== timestamp));
      setDetails((current) => {
        const next = { ...current };
        delete next[timestamp];
        return next;
      });
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingTimestamp(null);
    }
  }, []);

  const closePreviewImage = React.useCallback(() => {
    previewRequestRef.current += 1;
    setPreviewImage(null);
  }, []);

  const handlePreview = React.useCallback(async (record: AppshotRecordDetail) => {
    if (!record.snapshot_url) {
      return;
    }
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    const alt = `Screenshot preview for ${record.metadata.app_name}`;
    setPreviewImage({
      timestamp: record.timestamp,
      src: record.snapshot_url,
      alt,
    });
    try {
      const fullSnapshot = await readAppshotSnapshot(record.timestamp);
      if (previewRequestRef.current === requestId) {
        setPreviewImage({
          timestamp: record.timestamp,
          src: fullSnapshot.snapshot_url,
          alt,
        });
      }
    } catch (err) {
      if (previewRequestRef.current === requestId) {
        setHistoryError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Camera className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-popover-foreground">Appshots</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title="Refresh Appshots"
            aria-label="Refresh Appshots"
            onClick={() => {
              void refreshStatus();
              void refreshHistory();
            }}
            className="cursor-pointer"
          >
            <RefreshCw className={cn("size-3", (statusLoading || historyLoading) && "animate-spin")} />
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Capture another app with{" "}
          <ShortcutKeySequence
            keys={APPSHOT_CAPTURE_SHORTCUT_KEYS}
            className="mx-1 align-middle"
            keyClassName="h-4 min-w-4 rounded px-1 text-[9px]"
          />
          , review the preview, then copy a local Appshot reference for agents
          to read from disk.
        </p>
      </div>

      {statusError ? <InlineError message={statusError} /> : null}
      {historyError ? <InlineError message={historyError} /> : null}

      {status && !status.supported ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {status.reason || "Appshots are not supported in this runtime."}
        </div>
      ) : null}

      {status?.trigger.last_error ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {status.trigger.last_error}
        </div>
      ) : null}

      {deniedPermissions.length > 0 ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-popover-foreground">
                <ShieldAlert className="size-3.5 text-warning" />
                Permissions required
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Open the Atmos Appshots window to grant Accessibility and
                Screen Recording permissions.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void handleOpenPermission()}
              className="shrink-0 cursor-pointer"
            >
              Enable
            </Button>
          </div>
        </div>
      ) : null}

      <div className="border-t border-border" />

      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-popover-foreground">Recent records</p>
          {records.length > 0 ? (
            <Badge variant="outline" className="rounded-md text-[10px] font-normal">
              {records.length}
            </Badge>
          ) : null}
        </div>

        <ScrollArea
          aria-label="Recent Appshot records"
          className="h-[min(42vh,360px)] min-h-[160px] pr-1"
          scrollbarGutter
        >
          <div className="space-y-2">
            {historyLoading ? (
              <HistorySkeleton />
            ) : records.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                No Appshots yet.
              </div>
            ) : (
              visibleRecords.map((item) => {
                const detail = details[item.timestamp];
                if (!detail) {
                  return <HistorySkeletonRow key={item.timestamp} />;
                }
                return (
                  <AppshotRecordRow
                    key={item.timestamp}
                    record={detail}
                    copied={copiedTimestamp === item.timestamp}
                    copying={copyingTimestamp === item.timestamp}
                    deleting={deletingTimestamp === item.timestamp}
                    onCopy={handleCopy}
                    onDelete={handleDelete}
                    onPreview={handlePreview}
                  />
                );
              })
            )}
          </div>
        </ScrollArea>

        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={detailLoading}
            onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
            className="w-full cursor-pointer"
          >
            <ChevronDown className="size-4" />
            More
          </Button>
        ) : null}
      </div>
      {previewImage ? (
        <ImagePreviewOverlay
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={closePreviewImage}
        />
      ) : null}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <>
      <HistorySkeletonRow />
      <HistorySkeletonRow />
      <HistorySkeletonRow />
    </>
  );
}

function HistorySkeletonRow() {
  return (
    <div className="grid h-[72px] grid-cols-[96px_minmax(0,1fr)_auto] overflow-hidden rounded-md border border-border bg-muted/20">
      <Skeleton className="h-full w-24 rounded-none" />
      <div className="space-y-2 px-3 py-2">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-3 w-full" />
      </div>
      <div className="flex gap-1 px-2 py-2">
        <Skeleton className="size-6 rounded-md" />
        <Skeleton className="size-6 rounded-md" />
      </div>
    </div>
  );
}
