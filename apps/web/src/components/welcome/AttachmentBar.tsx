"use client";

import React from "react";
import { ImageIcon, X } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from "@workspace/ui";

export interface ComposerAttachment {
  id: string; // 'img-1' etc.
  number: number;
  ext: string;
  filename: string; // 'img-1.png'
  blob: Blob;
  objectUrl: string;
}

interface AttachmentBarProps {
  attachments: ComposerAttachment[];
  onRemove: (id: string) => void;
  onPreview?: (att: ComposerAttachment) => void;
  className?: string;
}

export function AttachmentBar({ attachments, onRemove, onPreview, className }: AttachmentBarProps) {
  if (attachments.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {attachments.map((att) => (
        <Tooltip key={att.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onPreview?.(att)}
              className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border/70 bg-muted/40 transition-colors hover:border-border"
              aria-label={att.filename}
            >
              {att.blob.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.objectUrl}
                  alt={att.filename}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="m-auto size-5 text-muted-foreground" />
              )}
              <span className="pointer-events-none absolute bottom-0 left-0 right-0 truncate bg-background/80 px-1 py-0.5 text-[10px] leading-tight text-foreground">
                {att.id}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute -right-1 -top-1 size-4 rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(att.id);
                }}
                title="Remove"
              >
                <X className="size-3" />
              </Button>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{att.filename}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
