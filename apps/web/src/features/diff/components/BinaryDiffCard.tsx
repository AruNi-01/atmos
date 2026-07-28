"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileWarning, ImageIcon } from "lucide-react";
import type { GitBlobLocator, GitFileDiffResponse } from "@/api/ws-api-types";
import {
  formatSizeTransition,
} from "@/features/diff/lib/diff-content-kind";
import { resolveBlobUrl } from "@/features/diff/lib/resolve-blob-url";
import { cn } from "@/shared/lib/utils";
import { getFileIconProps } from "@workspace/ui";

interface BinaryDiffCardProps {
  diff: GitFileDiffResponse;
  /** Absolute or project repo root used for worktree / git-blob URLs. */
  repoPath: string;
  /** Compact layout for multi-file CodeView annotations. */
  compact?: boolean;
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
  url,
  emptyLabel,
}: {
  label: string;
  url: string | null;
  emptyLabel: string;
}) {
  if (!url) {
    return (
      <div className="flex min-h-[120px] flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-6 text-center">
        <ImageIcon className="size-5 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex min-h-[120px] items-center justify-center overflow-hidden rounded-md border border-border/50 bg-[image:repeating-conic-gradient(#80808018_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="max-h-[320px] max-w-full object-contain"
        />
      </div>
    </div>
  );
}

export function BinaryDiffCard({
  diff,
  repoPath,
  compact = false,
  className,
}: BinaryDiffCardProps) {
  const t = useTranslations("diff.binary");
  const [oldUrl, setOldUrl] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const baseName = diff.file_path.split("/").pop() || diff.file_path;
  const iconProps = getFileIconProps({
    name: baseName,
    isDir: false,
    className: "size-4 shrink-0",
  });
  const sizeLabel = formatSizeTransition(diff.old_size, diff.new_size);
  const identical =
    Boolean(diff.old_sha256) &&
    Boolean(diff.new_sha256) &&
    diff.old_sha256 === diff.new_sha256;
  const showImagePreview =
    diff.preview_kind === "image" && !loadError && !identical;

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setOldUrl(null);
    setNewUrl(null);

    if (diff.preview_kind !== "image") return;

    const load = async (locator: GitBlobLocator | null, setter: (u: string | null) => void) => {
      try {
        const url = await resolveBlobUrl(locator, repoPath);
        if (!cancelled) setter(url);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };

    void load(diff.old_blob, setOldUrl);
    void load(diff.new_blob, setNewUrl);

    return () => {
      cancelled = true;
    };
  }, [diff.old_blob, diff.new_blob, diff.preview_kind, repoPath]);

  const title =
    diff.kind === "too_large"
      ? t("tooLarge")
      : diff.status === "A" || diff.status === "?"
        ? t("binaryAdded")
        : diff.status === "D"
          ? t("binaryDeleted")
          : t("binaryChanged");

  return (
    <div
      className={cn(
        "my-1 overflow-hidden rounded-lg border border-border/50 bg-background",
        compact ? "mx-2" : "mx-0",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconProps.src} alt="" className={iconProps.className} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {diff.file_path}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {statusLabel(diff.status, t)}
        </span>
      </div>

      <div className={cn("flex flex-col gap-3 p-3", compact && "p-2.5")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
            <FileWarning className="size-3.5 text-muted-foreground" />
            {title}
          </span>
          {sizeLabel ? (
            <span className="font-mono tabular-nums text-[11px]">{sizeLabel}</span>
          ) : null}
          {identical ? (
            <span className="text-[11px] text-muted-foreground">{t("identicalContent")}</span>
          ) : null}
        </div>

        {showImagePreview ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            {diff.status !== "A" && diff.status !== "?" ? (
              <SideImage
                label={t("previous")}
                url={oldUrl}
                emptyLabel={t("previewUnavailable")}
              />
            ) : null}
            {diff.status !== "D" ? (
              <SideImage
                label={t("current")}
                url={newUrl}
                emptyLabel={t("previewUnavailable")}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
