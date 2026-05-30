"use client";

import { Button, cn } from "@workspace/ui";
import { Check, Copy, ImageOff, Trash2 } from "lucide-react";

import { summarizeAppshotRecord } from "../lib/appshot-protocol";
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
  const summary = summarizeAppshotRecord(record);
  const disabled = deleting || copying;
  const previewLabel =
    summary.title && summary.title !== summary.appLabel
      ? `${summary.appLabel} - ${summary.title}`
      : summary.appLabel;
  const windowLabel =
    summary.title && summary.title !== summary.appLabel
      ? summary.title
      : "Untitled window";

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
            aria-label={`Preview screenshot for ${previewLabel}`}
            onClick={() => onPreview(record)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Appshot thumbnails are local Tauri data URLs, not remote optimized assets. */}
            <img
              src={record.snapshot_url}
              alt={`Screenshot preview for ${previewLabel}`}
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
              title={copied ? "Copied" : "Copy Appshot reference"}
              aria-label={copied ? "Copied Appshot reference" : "Copy Appshot reference"}
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
              title="Delete Appshot record"
              aria-label="Delete Appshot record"
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
