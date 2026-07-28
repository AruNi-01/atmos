import type {
  DiffContentKind,
  DiffPreviewKind,
  GitBlobLocator,
  GitFileDiffResponse,
} from "@/api/ws-api-types";

export function isTextDiff(diff: Pick<GitFileDiffResponse, "kind">): boolean {
  return diff.kind === "text";
}

export function isNonTextDiff(diff: Pick<GitFileDiffResponse, "kind">): boolean {
  return diff.kind !== "text";
}

/** Which binary panel an annotation renders (maps to pierre deletion/addition columns). */
export type BinaryDiffPanel = "previous" | "current";

/**
 * Placeholder sides for @pierre/diffs so binary files stay in CodeView.
 * Sides must differ (non-empty change) or pierre treats the file as empty and
 * disables expand + drops line annotations.
 *
 * For modified files we emit **two** annotations so split layout places
 * Previous on the left (deletions) and Current on the right (additions).
 */
export function binaryDiffPlaceholders(status: string): {
  oldText: string;
  newText: string;
  annotations: Array<{
    side: "additions" | "deletions";
    lineNumber: number;
    panel: BinaryDiffPanel;
  }>;
} {
  // NBSP keeps a visible-but-minimal change line for the annotation to attach to.
  if (status === "A" || status === "?") {
    return {
      oldText: "",
      newText: "\u00a0\n",
      annotations: [{ side: "additions", lineNumber: 1, panel: "current" }],
    };
  }
  if (status === "D") {
    return {
      oldText: "\u00a0\n",
      newText: "",
      annotations: [{ side: "deletions", lineNumber: 1, panel: "previous" }],
    };
  }
  return {
    oldText: ".\n",
    newText: "\u00a0\n",
    annotations: [
      { side: "deletions", lineNumber: 1, panel: "previous" },
      { side: "additions", lineNumber: 1, panel: "current" },
    ],
  };
}

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "tiff",
  "tif",
]);

const MEDIA_EXTS = new Set(["mp4", "webm", "ogg", "mov", "mp3", "wav"]);

const BINARY_EXTS = new Set([
  ...IMAGE_EXTS,
  ...MEDIA_EXTS,
  "pdf",
  "zip",
  "tar",
  "gz",
  "7z",
  "rar",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

export function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return "";
  return base.slice(idx + 1).toLowerCase();
}

export function previewKindFromPath(path: string): DiffPreviewKind {
  const ext = extensionOf(path);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (MEDIA_EXTS.has(ext)) return "media";
  return "none";
}

export function isLikelyBinaryPath(path: string): boolean {
  return BINARY_EXTS.has(extensionOf(path));
}

export function formatByteSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(2) : Math.round(mb)} MB`;
}

export function formatSizeTransition(
  oldSize: number | null | undefined,
  newSize: number | null | undefined,
): string {
  if (oldSize == null && newSize == null) return "";
  if (oldSize == null) return formatByteSize(newSize);
  if (newSize == null) return formatByteSize(oldSize);
  if (oldSize === newSize) return formatByteSize(newSize);
  return `${formatByteSize(oldSize)} → ${formatByteSize(newSize)}`;
}

/** Build a safe absolute worktree path for /api/system/file. */
export function resolveWorktreeAbsolutePath(
  repoPath: string,
  relativePath: string,
): string {
  const repo = repoPath.replace(/\/+$/, "");
  const rel = relativePath.replace(/^\/+/, "");
  if (!repo) return rel;
  return `${repo}/${rel}`;
}

export function gitShowSpec(locator: Extract<GitBlobLocator, { type: "git" }>): string {
  // Index / stage form already embeds the path (`:path` or `:0:path`).
  if (locator.rev.startsWith(":")) return locator.rev;
  return `${locator.rev}:${locator.path}`;
}

export type PrFileKindResult = {
  kind: DiffContentKind;
  preview_kind: DiffPreviewKind;
};

/**
 * Classify a GitHub PR file when the API omits `patch` (binary or too large).
 */
export function classifyPrFileWithoutPatch(filename: string): PrFileKindResult {
  const preview = previewKindFromPath(filename);
  if (preview === "image" || isLikelyBinaryPath(filename)) {
    return { kind: "binary", preview_kind: preview };
  }
  return { kind: "too_large", preview_kind: "none" };
}
