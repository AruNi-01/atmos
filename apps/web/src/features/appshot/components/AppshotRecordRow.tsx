"use client";

import { useTranslations } from "next-intl";
import { Button, cn } from "@workspace/ui";
import { Check, Copy, ImageOff, Trash2 } from "lucide-react";

import {
  formatQualityLabel,
  summarizeAppshotRecord,
} from "../lib/appshot-protocol";
import type { AppshotRecordDetail } from "../types";

type AppshotRecordRowProps = {
  record: AppshotRecordDetail;
  copied: boolean;
  deleting: boolean;
  copying: boolean;
  onCopy: (timestamp: string) => void;
  onDelete: (timestamp: string) => void;
  onPreview: (record: AppshotRecordDetail) => void;
};

export function AppshotRecordRow({
  record,
  copied,
  deleting,
  copying,
  onCopy,
  onDelete,
  onPreview,
}: AppshotRecordRowProps) {
  const t = useTranslations("appshot.components");
  const summary = summarizeAppshotRecord(record);
  const disabled = deleting || copying;
  // Prefer real window title only — do not fall back to inventing "Untitled window"
  // when metadata has no distinct title (common for host list_windows empty titles).
  const distinctTitle = record.metadata.window_title?.trim() || "";
  const hasDistinctTitle =
    Boolean(distinctTitle) && distinctTitle !== summary.appLabel;
  const previewLabel = hasDistinctTitle
    ? `${summary.appLabel} - ${distinctTitle}`
    : summary.appLabel;
  const windowLabel = hasDistinctTitle
    ? distinctTitle
    : formatQualityLabel(record.metadata.quality);

  return (
    <div
      className={cn(
        "grid h-[72px] grid-cols-[96px_minmax(0,1fr)] overflow-hidden rounded-md border border-border bg-muted/20",
        deleting && "opacity-60",
      )}
    >
      <div className="h-full w-24 overflow-hidden border-r border-border bg-background">
        {record.snapshot_url ? (
          <button
            type="button"
            className="block h-full w-full cursor-zoom-in overflow-hidden"
            aria-label={t("history.recordRow.previewScreenshotAriaLabel", { label: previewLabel })}
            onClick={() => onPreview(record)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Appshot thumbnails are local Tauri data URLs, not remote optimized assets. */}
            <img
              src={record.snapshot_url}
              alt={t("history.recordRow.previewScreenshotAlt", { label: previewLabel })}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-4" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-1 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-popover-foreground">
            {summary.appLabel}
          </p>
          <span className="shrink-0 text-[10px] leading-4 text-muted-foreground">
            {summary.capturedAtLabel}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[11px] leading-4 text-muted-foreground">
            {windowLabel}
          </p>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              title={copied ? t("history.recordRow.copiedTitle") : t("history.recordRow.copyTitle")}
              aria-label={copied ? t("history.recordRow.copiedAriaLabel") : t("history.recordRow.copyAriaLabel")}
              onClick={() => onCopy(record.timestamp)}
              className="cursor-pointer"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              title={t("history.recordRow.deleteTitle")}
              aria-label={t("history.recordRow.deleteAriaLabel")}
              onClick={() => onDelete(record.timestamp)}
              className="cursor-pointer text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
