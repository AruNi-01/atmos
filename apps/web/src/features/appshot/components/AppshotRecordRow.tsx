"use client";

import { Badge, Button, cn } from "@workspace/ui";
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
  const headline =
    summary.title && summary.title !== summary.appLabel
      ? `${summary.appLabel} - ${summary.title}`
      : summary.appLabel;

  return (
    <div
      className={cn(
        "grid h-[72px] grid-cols-[96px_minmax(0,1fr)_auto] overflow-hidden rounded-md border border-border bg-muted/20",
        deleting && "opacity-60",
      )}
    >
      <div className="h-full w-24 overflow-hidden border-r border-border bg-background">
        {record.snapshot_url ? (
          <button
            type="button"
            className="block h-full w-full cursor-zoom-in overflow-hidden"
            aria-label={`Preview screenshot for ${headline}`}
            onClick={() => onPreview(record)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Appshot thumbnails are local Tauri data URLs, not remote optimized assets. */}
            <img
              src={record.snapshot_url}
              alt={`Screenshot preview for ${headline}`}
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

      <div className="min-w-0 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-xs font-medium text-popover-foreground">
            {headline}
          </p>
          <Badge
            variant="outline"
            className="h-5 shrink-0 rounded-md px-1.5 text-[10px] font-normal text-muted-foreground"
          >
            {summary.capturedAtLabel}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground">
          {record.context_preview || "No text context was captured."}
        </p>
      </div>

      <div className="flex items-start gap-1 px-2 py-2">
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
  );
}
