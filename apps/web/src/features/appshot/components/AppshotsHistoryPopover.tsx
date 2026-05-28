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

import {
  copyAppshotRecord,
  deleteAppshotRecord,
  getAppshotStatus,
  getDeniedAppshotPermissions,
  listAppshotRecords,
  openAppshotPermissionTarget,
  readAppshotRecords,
  watchAppshotStatusAfterPermissionOpen,
} from "../lib/appshot-client";
import { sanitizeRecordDetailPayloads } from "../lib/appshot-payload";
import type {
  AppshotPermissionState,
  AppshotRecordDetail,
  AppshotRecordListItem,
  AppshotSettingsTarget,
  AppshotStatus,
} from "../types";
import { AppshotRecordRow } from "./AppshotRecordRow";

type AppshotsHistoryPopoverProps = {
  open: boolean;
};

const PAGE_SIZE = 10;
const DETAIL_BATCH_SIZE = 3;

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
  const permissionWatcherRef = React.useRef<(() => void) | null>(null);

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

  React.useEffect(() => {
    return () => {
      permissionWatcherRef.current?.();
    };
  }, []);

  const deniedPermissions = getDeniedAppshotPermissions(status);
  const visibleRecords = records.slice(0, visibleCount);
  const hasMore = visibleCount < records.length;

  const handleOpenPermission = React.useCallback(
    async (target: AppshotSettingsTarget) => {
      try {
        await openAppshotPermissionTarget(target);
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
    try {
      await copyAppshotRecord(timestamp);
      setCopiedTimestamp(timestamp);
      window.setTimeout(() => {
        setCopiedTimestamp((current) => (current === timestamp ? null : current));
      }, 1_500);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopyingTimestamp(null);
    }
  }, []);

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

  return (
    <div className="space-y-3">
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
          Capture another app with Fn + Option + Command, review the preview,
          then copy a local Appshot reference for agents to read from disk.
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
        <div className="space-y-2 rounded-md border border-warning/30 bg-warning/10 p-2">
          <div className="flex items-center gap-2 text-xs font-medium text-popover-foreground">
            <ShieldAlert className="size-3.5 text-warning" />
            Permissions required
          </div>
          <div className="space-y-2">
            {deniedPermissions.map((permission) => (
              <PermissionRecovery
                key={permission.name}
                permission={permission}
                onOpenPermission={handleOpenPermission}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-t border-border" />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-popover-foreground">Recent records</p>
          {records.length > 0 ? (
            <Badge variant="outline" className="rounded-md text-[10px] font-normal">
              {records.length}
            </Badge>
          ) : null}
        </div>

        <ScrollArea className="h-[min(54vh,480px)] pr-1" scrollbarGutter>
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
    </div>
  );
}

function PermissionRecovery({
  permission,
  onOpenPermission,
}: {
  permission: AppshotPermissionState;
  onOpenPermission: (target: AppshotSettingsTarget) => Promise<void>;
}) {
  const action = permission.recovery_action;

  return (
    <div className="rounded-md border border-border bg-popover/70 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-popover-foreground">
            {permission.display_name}
          </p>
          <p className="text-[11px] leading-5 text-muted-foreground">
            {permission.required_for.join("; ")}
          </p>
        </div>
        {action ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void onOpenPermission(action.target)}
            className="shrink-0 cursor-pointer"
          >
            {action.label || "Open Settings"}
          </Button>
        ) : null}
      </div>
      {action?.manual_steps.length ? (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          {action.manual_steps.join(" ")}
        </p>
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
    <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-muted/20 p-2">
      <Skeleton className="h-14 w-[72px] rounded" />
      <div className="space-y-2 py-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-3 w-full" />
      </div>
      <div className="flex gap-1">
        <Skeleton className="size-6 rounded-md" />
        <Skeleton className="size-6 rounded-md" />
      </div>
    </div>
  );
}
