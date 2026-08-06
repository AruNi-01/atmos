"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ScrollArea, Skeleton, cn } from "@workspace/ui";
import {
  AlertCircle,
  Camera,
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
  watchAppshotStatusAfterPermissionOpen,
} from "../lib/appshot-client";
import { useOpenDesktopUseSettings } from "../lib/open-desktop-use-settings";
import { sanitizeRecordDetailPayloads } from "../lib/appshot-payload";
import { desktopInvoke, isDesktopRuntime } from "@/shared/lib/desktop-bridge";
import type {
  AppshotPermissionState,
  AppshotRecordDetail,
  AppshotRecordListItem,
  AppshotStatus,
} from "../types";
import { AppshotRecordRow } from "./AppshotRecordRow";

type AppshotsHistoryPopoverProps = {
  open: boolean;
  /** Close the header popover (e.g. before opening Settings). */
  onClose?: () => void;
};

const PAGE_SIZE = 10;
const DETAIL_BATCH_SIZE = 3;
const APPSHOT_CAPTURE_SHORTCUT_KEYS = ["Left ⇧", "Right ⇧"];
/** Prefetch the next page slightly before the sentinel enters the viewport. */
const LOAD_MORE_ROOT_MARGIN = "120px 0px";

export function AppshotsHistoryPopover({
  open,
  onClose,
}: AppshotsHistoryPopoverProps) {
  const t = useTranslations("appshot.components");
  const openDesktopUseSettings = useOpenDesktopUseSettings();
  const [status, setStatus] = React.useState<AppshotStatus | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [records, setRecords] = React.useState<AppshotRecordListItem[]>([]);
  const [details, setDetails] = React.useState<Record<string, AppshotRecordDetail>>({});
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  // Start true so the first paint after open is skeleton, not empty-state flash.
  const [historyLoading, setHistoryLoading] = React.useState(true);
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
  const loadMoreSentinelRef = React.useRef<HTMLDivElement | null>(null);
  const recordsLengthRef = React.useRef(0);

  const refreshStatus = React.useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      // Prefer Desktop Use host doctor when control engine is installed —
      // AppShot no longer has a separate permission product.
      if (isDesktopRuntime()) {
        try {
          const doctor = (await desktopInvoke("desktop_use_doctor")) as {
            engine_installed?: boolean;
            accessibility?: boolean | null;
            screen_recording?: boolean | null;
          };
          if (doctor?.engine_installed) {
            setStatus(statusFromDesktopUseDoctor(doctor));
            return;
          }
        } catch {
          /* fall through */
        }
      }
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
      const sorted = [...nextRecords].sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp),
      );
      setRecords(sorted);
      setVisibleCount(PAGE_SIZE);
      // Keep detail cache for timestamps that still exist so refresh does not
      // flash every row back to skeleton.
      setDetails((current) => {
        const next: Record<string, AppshotRecordDetail> = {};
        for (const item of sorted) {
          const existing = current[item.timestamp];
          if (existing) {
            next[item.timestamp] = existing;
          }
        }
        return next;
      });
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : String(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Keep latest onClose without re-running the open effect (parent may pass a
  // new inline callback each render).
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    void refreshStatus();
    void refreshHistory();
    // Background readiness gate — does not block popover open / history load.
    // On block: close this popover first; the modal opens deferred so Radix
    // does not treat Popover dismiss as Dialog outside-click (modal never stays open).
    void import("@/features/desktop-use/lib/readiness-modal-bus").then(
      ({ gateDesktopUseFeature }) => {
        gateDesktopUseFeature("appshot", {
          onBlocked: () => onCloseRef.current?.(),
        });
      },
    );
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
  recordsLengthRef.current = records.length;
  // Full skeleton on first load (no rows yet), or after list arrives but before any
  // visible detail resolves. Keep existing rows visible during soft refresh.
  const showHistorySkeleton =
    (historyLoading && records.length === 0) ||
    (records.length > 0 &&
      visibleRecords.every((item) => details[item.timestamp] == null));
  // Sentinel only mounts once rows render; include this so the observer attaches
  // after the first paint of real content (not while the skeleton is up).
  const listReady = !showHistorySkeleton && records.length > 0;

  const loadMore = React.useCallback(() => {
    setVisibleCount((current) => {
      const total = recordsLengthRef.current;
      if (current >= total) {
        return current;
      }
      return Math.min(current + PAGE_SIZE, total);
    });
  }, []);

  // Infinite scroll: when the bottom sentinel enters the scroll viewport, reveal
  // the next page. No separate "More" button.
  React.useEffect(() => {
    if (!open || !hasMore || !listReady) {
      return;
    }
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }

    const scrollRoot =
      (sentinel.closest(
        '[data-slot="scroll-area-viewport"]',
      ) as Element | null) ?? null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      {
        root: scrollRoot,
        rootMargin: LOAD_MORE_ROOT_MARGIN,
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, listReady, loadMore, open, visibleCount]);

  const handleOpenPermission = React.useCallback(() => {
    // Header Appshots → authorize: open Settings → Desktop Use (only path).
    onClose?.();
    openDesktopUseSettings();
    permissionWatcherRef.current?.();
    permissionWatcherRef.current = watchAppshotStatusAfterPermissionOpen(refreshStatus);
  }, [onClose, openDesktopUseSettings, refreshStatus]);

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
    const alt = t("history.previewAlt", { appName: record.metadata.app_name });
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
  }, [t]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Camera className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-popover-foreground">{t("history.title")}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title={t("history.refreshTitle")}
            aria-label={t("history.refreshAriaLabel")}
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
          {t("history.description.beforeShortcut")}{" "}
          <ShortcutKeySequence
            keys={APPSHOT_CAPTURE_SHORTCUT_KEYS}
            className="mx-1 align-middle"
            keyClassName="h-4 min-w-4 rounded px-1 text-[9px]"
          />
          {t("history.description.afterShortcut")}
        </p>
      </div>

      {statusError ? <InlineError message={statusError} /> : null}
      {historyError ? <InlineError message={historyError} /> : null}

      {status && !status.supported ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {status.reason || t("history.unsupportedInThisRuntime")}
        </div>
      ) : null}

      {/* When permissions are denied, the CTA below already covers recovery — skip
          trigger.last_error so users do not see two near-identical warning blocks. */}
      {status?.trigger.last_error && deniedPermissions.length === 0 ? (
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
                {t("history.permissionsRequiredTitle")}
              </div>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {t("history.permissionsRequiredDescription")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void handleOpenPermission()}
              className="shrink-0 cursor-pointer"
            >
              {t("history.enable")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="border-t border-border" />

      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-popover-foreground">{t("history.recentRecords")}</p>
          {records.length > 0 ? (
            <Badge variant="outline" className="rounded-md text-[10px] font-normal">
              {records.length}
            </Badge>
          ) : null}
        </div>

        <ScrollArea
          aria-label={t("history.recentRecordsAriaLabel")}
          className="h-[min(42vh,360px)] min-h-[160px] pr-1"
          scrollbarGutter
        >
          <div className="space-y-2" aria-busy={showHistorySkeleton || detailLoading}>
            {showHistorySkeleton ? (
              <HistorySkeleton
                count={
                  records.length > 0
                    ? Math.min(visibleRecords.length, PAGE_SIZE)
                    : 3
                }
              />
            ) : records.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                {t("history.noAppshotsYet")}
              </div>
            ) : (
              <>
                {visibleRecords.map((item) => {
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
                })}
                {hasMore ? (
                  <div
                    ref={loadMoreSentinelRef}
                    data-testid="appshot-history-load-more"
                    aria-hidden
                    className="h-px w-full shrink-0"
                  />
                ) : null}
              </>
            )}
          </div>
        </ScrollArea>
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
  const t = useTranslations("appshot.components");
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-label={t("history.errorIconAriaLabel")} />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

/** Map Desktop Use doctor → AppshotStatus shape for denied-permission UI. */
function statusFromDesktopUseDoctor(doctor: {
  accessibility?: boolean | null;
  screen_recording?: boolean | null;
}): AppshotStatus {
  const ax = doctor.accessibility === true;
  const screen = doctor.screen_recording === true;
  const mk = (
    name: "accessibility" | "screen_recording",
    granted: boolean,
  ): AppshotPermissionState => ({
    name,
    display_name: name === "accessibility" ? "Accessibility" : "Screen Recording",
    granted,
    required_for:
      name === "accessibility"
        ? ["accessibility_tree", "control"]
        : ["capture", "control"],
    recovery_action: granted
      ? null
      : {
          label: "Open Desktop Use settings",
          target: name,
          manual_steps: [],
        },
  });
  return {
    supported: true,
    platform: "macos",
    reason: null,
    trigger: {
      mode: "macos_modifier_gesture",
      enabled: ax,
      required_modifiers: [],
      last_error: null,
      permissions: [mk("accessibility", ax)],
    },
    permissions: [mk("accessibility", ax), mk("screen_recording", screen)],
  };
}

function HistorySkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <HistorySkeletonRow key={index} />
      ))}
    </>
  );
}

function HistorySkeletonRow() {
  // Mirror AppshotRecordRow layout to avoid layout shift when details resolve.
  return (
    <div className="grid h-[72px] grid-cols-[96px_minmax(0,1fr)] overflow-hidden rounded-md border border-border bg-muted/20">
      <Skeleton className="h-full w-24 rounded-none border-r border-border" />
      <div className="flex min-w-0 flex-col justify-center gap-1 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-3 w-24 shrink-0" />
          <Skeleton className="ml-auto h-3 w-12 shrink-0" />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-3 min-w-0 flex-1" />
          <div className="flex shrink-0 gap-1">
            <Skeleton className="size-6 rounded-md" />
            <Skeleton className="size-6 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
