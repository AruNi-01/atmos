"use client";

import React from "react";
import { ImageIcon, X } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from "@workspace/ui";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("Welcome.components.attachmentBar");

  if (attachments.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {attachments.map((att) => (
        <div key={att.id} className="group relative shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onPreview?.(att)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPreview?.(att);
                  }
                }}
                className="relative h-12 w-12 cursor-zoom-in overflow-hidden rounded-md border border-border/70 bg-muted/40 hover:border-border focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">{att.filename}</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            className="absolute -right-1 -top-1 z-10 size-4 min-h-0 min-w-0 rounded-full border border-border/70 bg-background p-0 text-muted-foreground shadow-sm opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 [&>svg]:size-2.5"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove(att.id);
            }}
            title={t("remove")}
            aria-label={t("remove")}
          >
            <X strokeWidth={2.5} />
          </Button>
        </div>
      ))}
    </div>
  );
}
