"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import type { GitBlobLocator, GitFileDiffResponse } from "@/api/ws-api-types";
import {
  formatByteSize,
  type BinaryDiffPanel,
} from "@/features/diff/lib/diff-content-kind";
import { resolveBlobUrl } from "@/features/diff/lib/resolve-blob-url";
import { ImagePreviewOverlay } from "@/shared/components/image-preview-overlay";
import { cn } from "@/shared/lib/utils";
import { getFileIconProps } from "@workspace/ui";

interface BinaryDiffCardProps {
  diff: GitFileDiffResponse;
  /** Absolute or project repo root used for worktree / git-blob URLs. */
  repoPath: string;
  /** Compact layout for multi-file CodeView annotations. */
  compact?: boolean;
  /**
   * When true, omit the file-path header (pierre CodeView already shows it)
   * and use a body suited for line annotations inside a diff item.
   */
  embedded?: boolean;
  /**
   * Which panel to render. Split layout uses separate annotations so Previous
   * sits on the left (deletions) and Current on the right (additions).
   * Default `both` for standalone DiffViewer.
   */
  panel?: BinaryDiffPanel | "both";
  className?: string;
}

function statusLabel(
  status: string,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (status) {
    case "A":
    case "?":
      return t("status.added");
    case "D":
      return t("status.deleted");
    case "R":
      return t("status.renamed");
    case "C":
      return t("status.copied");
    default:
      return t("status.modified");
  }
}

function SideImage({
  label,
  sizeLabel,
  url,
  emptyLabel,
  onPreview,
}: {
  label: string;
  sizeLabel: string | null;
  url: string | null;
  emptyLabel: string;
  onPreview?: (src: string, alt: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-baseline gap-1.5 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground/80">{label}</span>
        {sizeLabel ? (
          <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
            {sizeLabel}
          </span>
        ) : null}
      </div>
      {url ? (
        <button
          type="button"
          onClick={() => onPreview?.(url, label)}
          className="flex min-h-[120px] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-border/50 bg-[image:repeating-conic-gradient(#80808018_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2 hover:border-border focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="max-h-[320px] max-w-full object-contain"
          />
        </button>
      ) : (
        <div className="flex min-h-[120px] flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-6 text-center">
          <ImageIcon className="size-5 text-muted-foreground/50" />
          <span className="text-[11px] text-muted-foreground">{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}

export function BinaryDiffCard({
  diff,
  repoPath,
  compact = false,
  embedded = false,
  panel = "both",
  className,
}: BinaryDiffCardProps) {
  const t = useTranslations("diff.binary");
  const [oldUrl, setOldUrl] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(
    null,
  );

  const baseName = diff.file_path.split("/").pop() || diff.file_path;
  const iconProps = getFileIconProps({
    name: baseName,
    isDir: false,
    className: "size-4 shrink-0",
  });
  const oldSizeLabel =
    diff.old_size != null ? formatByteSize(diff.old_size) : null;
  const newSizeLabel =
    diff.new_size != null ? formatByteSize(diff.new_size) : null;
  const identical =
    Boolean(diff.old_sha256) &&
    Boolean(diff.new_sha256) &&
    diff.old_sha256 === diff.new_sha256;
  const showImagePreview =
    diff.preview_kind === "image" && !loadError && !identical;

  const showPrevious =
    (panel === "both" || panel === "previous") &&
    diff.status !== "A" &&
    diff.status !== "?";
  const showCurrent =
    (panel === "both" || panel === "current") && diff.status !== "D";

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setOldUrl(null);
    setNewUrl(null);

    if (diff.preview_kind !== "image") return;

    const load = async (
      locator: GitBlobLocator | null,
      setter: (u: string | null) => void,
    ) => {
      try {
        const url = await resolveBlobUrl(locator, repoPath);
        if (!cancelled) setter(url);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };

    if (showPrevious) void load(diff.old_blob, setOldUrl);
    if (showCurrent) void load(diff.new_blob, setNewUrl);

    return () => {
      cancelled = true;
    };
  }, [
    diff.old_blob,
    diff.new_blob,
    diff.preview_kind,
    repoPath,
    showPrevious,
    showCurrent,
  ]);

  return (
    <div
      className={cn(
        "overflow-hidden bg-background",
        embedded
          ? "my-0 w-full min-w-0 rounded-md border border-border/40"
          : "my-1 rounded-lg border border-border/50",
        !embedded && compact && "mx-2",
        !embedded && !compact && "mx-0",
        className,
      )}
      data-binary-diff-card=""
      data-binary-embedded={embedded ? "true" : undefined}
      data-binary-panel={panel}
    >
      {!embedded ? (
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconProps.src} alt="" className={iconProps.className} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {diff.file_path}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {statusLabel(diff.status, t)}
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-col gap-3 p-3",
          (compact || embedded) && "p-2.5",
        )}
      >
        {showImagePreview ? (
          <div
            className={cn(
              "flex gap-3",
              panel === "both" ? "flex-col sm:flex-row" : "flex-col",
            )}
          >
            {showPrevious ? (
              <SideImage
                label={t("previous")}
                sizeLabel={oldSizeLabel}
                url={oldUrl}
                emptyLabel={t("previewUnavailable")}
                onPreview={(src, alt) => setPreview({ src, alt })}
              />
            ) : null}
            {showCurrent ? (
              <SideImage
                label={t("current")}
                sizeLabel={newSizeLabel}
                url={newUrl}
                emptyLabel={t("previewUnavailable")}
                onPreview={(src, alt) => setPreview({ src, alt })}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {showPrevious ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-medium text-foreground/80">
                  {t("previous")}
                </span>
                {oldSizeLabel ? (
                  <span className="font-mono tabular-nums text-[11px]">
                    {oldSizeLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
            {showCurrent ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="font-medium text-foreground/80">
                  {t("current")}
                </span>
                {newSizeLabel ? (
                  <span className="font-mono tabular-nums text-[11px]">
                    {newSizeLabel}
                  </span>
                ) : null}
              </span>
            ) : null}
            {identical ? (
              <span className="text-[11px]">{t("identicalContent")}</span>
            ) : null}
            {diff.kind === "too_large" ? (
              <span className="text-[11px]">{t("tooLarge")}</span>
            ) : null}
          </div>
        )}
      </div>

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
