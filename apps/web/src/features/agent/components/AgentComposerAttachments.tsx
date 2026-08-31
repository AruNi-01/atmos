"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { File as FileIcon, X } from "lucide-react";
import { cn, usePromptInputAttachments } from "@workspace/ui";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";
import {
  composerAttachmentLabel,
  isImageComposerAttachment,
  type ComposerAttachmentFile,
} from "@/features/agent/lib/agent-composer-attachment";

export function AgentComposerAttachments() {
  const attachments = usePromptInputAttachments();
  return (
    <AgentComposerAttachmentList
      files={attachments.files}
      onRemove={attachments.remove}
    />
  );
}

export function AgentComposerAttachmentList({
  files,
  onRemove,
  density = "composer",
  className,
}: {
  files: ComposerAttachmentFile[];
  onRemove?: (id: string) => void;
  density?: "composer" | "compact";
  className?: string;
}) {
  const t = useTranslations("Agent.components.composer.attachments");
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);

  const handleRemove = useCallback(
    (file: ComposerAttachmentFile) => {
      if (!onRemove) return;
      if (preview && file.url === preview.src) {
        setPreview(null);
      }
      onRemove(file.id);
    },
    [onRemove, preview],
  );

  if (files.length === 0) return null;

  return (
    <div
      data-agent-composer-attachments=""
      data-density={density}
      className={cn(
        "flex flex-wrap items-start gap-2",
        density === "composer" ? "px-2 pt-1.5" : "gap-1.5",
        className,
      )}
    >
      {files.map((file) => {
        const image = isImageComposerAttachment(file);
        const label = composerAttachmentLabel(
          file,
          t(image ? "imageFallback" : "fileFallback"),
        );
        return image ? (
          <ComposerImageTile
            key={file.id}
            file={file}
            density={density}
            label={label}
            previewLabel={t("preview", { filename: label })}
            removeLabel={onRemove ? t("removeNamed", { filename: label }) : undefined}
            onPreview={() => setPreview({ src: file.url, alt: label })}
            onRemove={onRemove ? () => handleRemove(file) : undefined}
          />
        ) : (
          <ComposerFilePill
            key={file.id}
            file={file}
            density={density}
            label={label}
            removeLabel={onRemove ? t("removeNamed", { filename: label }) : undefined}
            onRemove={onRemove ? () => handleRemove(file) : undefined}
          />
        );
      })}
      {preview ? (
        <ImagePreviewOverlay
          src={preview.src}
          alt={preview.alt}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

function ComposerImageTile({
  file,
  density,
  label,
  previewLabel,
  removeLabel,
  onPreview,
  onRemove,
}: {
  file: ComposerAttachmentFile;
  density: "composer" | "compact";
  label: string;
  previewLabel: string;
  removeLabel?: string;
  onPreview: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      data-agent-composer-attachment="image"
      data-attachment-id={file.id}
      className="group relative shrink-0"
    >
      <button
        type="button"
        aria-label={previewLabel}
        title={previewLabel}
        onClick={onPreview}
        className={cn(
          "block cursor-zoom-in overflow-hidden",
          "bg-muted/40 ring-1 ring-border/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          density === "compact"
            ? "h-14 w-32 rounded-xl"
            : "h-20 w-44 rounded-2xl",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- composer previews use local object/data URLs. */}
        <img
          src={file.url}
          alt={label}
          draggable={false}
          className="size-full object-cover"
        />
      </button>
      {onRemove && removeLabel ? (
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className={cn(
            "absolute top-1 right-1 z-10 flex size-6 items-center justify-center rounded-full",
            "bg-black/70 text-white shadow-sm",
            "opacity-0 transition-opacity",
            "hover:bg-black/85",
            "group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

function ComposerFilePill({
  file,
  density,
  label,
  removeLabel,
  onRemove,
}: {
  file: ComposerAttachmentFile;
  density: "composer" | "compact";
  label: string;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  return (
    <div
      data-agent-composer-attachment="file"
      data-attachment-id={file.id}
      title={label}
      className={cn(
        "inline-flex max-w-[min(16rem,100%)] min-w-0 shrink-0 items-center gap-1.5 rounded-full",
        "border border-border/70 bg-muted/40 py-0 pl-2.5",
        "select-none text-foreground/90",
        density === "compact" ? "h-7 text-xs" : "h-8 text-[13px]",
        onRemove ? "pr-1.5" : "pr-2.5",
      )}
    >
      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
      {onRemove && removeLabel ? (
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full",
            "text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
