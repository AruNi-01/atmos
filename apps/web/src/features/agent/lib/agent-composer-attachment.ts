import {
  isBrowserPreviewableImageFilename,
  isBrowserPreviewableImageMediaType,
} from "@/shared/lib/composer-image";

export type ComposerAttachmentFile = {
  id: string;
  filename?: string;
  mediaType?: string;
  url?: string;
};

export function isImageComposerAttachment(
  file: ComposerAttachmentFile,
): file is ComposerAttachmentFile & { url: string } {
  if (!file.url) return false;
  if (file.mediaType) {
    return isBrowserPreviewableImageMediaType(file.mediaType);
  }
  return isBrowserPreviewableImageFilename(file.filename);
}

export function composerAttachmentLabel(
  file: ComposerAttachmentFile,
  fallback: string,
): string {
  const name = file.filename?.trim();
  return name || fallback;
}

const EXT_MEDIA_TYPE: Record<string, string> = {
  apng: "image/apng",
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export function queuedPromptEditText(item: {
  displayPrompt?: string;
  prompt: string;
}): string {
  return item.displayPrompt ?? item.prompt;
}

export function attachmentFilename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : path;
}

export function mediaTypeFromFilename(filename: string): string | undefined {
  const match = filename.trim().match(/\.([a-z0-9]+)$/i);
  if (!match) return undefined;
  return EXT_MEDIA_TYPE[match[1]!.toLowerCase()];
}

export function composerFileUrlFromPath(
  path: string,
  apiBase: string,
  token?: string | null,
): string {
  const params = new URLSearchParams({ path });
  if (token) params.set("token", token);
  return `${apiBase.replace(/\/$/, "")}/api/system/file?${params.toString()}`;
}

export function composerFilesFromAttachmentParts(
  parts: ReadonlyArray<{ type: string; path?: string; name?: string | null }>,
  fileUrlForPath?: (path: string) => string,
): ComposerAttachmentFile[] {
  const files: ComposerAttachmentFile[] = [];
  for (const part of parts) {
    if (part.type !== "attachment" || !part.path) continue;
    const filename = part.name?.trim() || attachmentFilename(part.path);
    files.push({
      id: part.path,
      filename,
      mediaType: mediaTypeFromFilename(filename),
      url: fileUrlForPath?.(part.path),
    });
  }
  return files;
}

export async function filesFromComposerParts(
  parts: Array<{ url?: string; filename?: string; mediaType?: string }>,
): Promise<File[]> {
  const files: File[] = [];
  for (const part of parts) {
    const filename = part.filename?.trim() || "attachment";
    const type = part.mediaType || mediaTypeFromFilename(filename) || "";
    if (!part.url) {
      files.push(new File([], filename, { type }));
      continue;
    }
    try {
      const response = await fetch(part.url);
      if (!response.ok) {
        files.push(new File([], filename, { type }));
        continue;
      }
      const blob = await response.blob();
      files.push(new File([blob], filename, { type: blob.type || type }));
    } catch {
      files.push(new File([], filename, { type }));
    }
  }
  return files;
}

export async function filesFromQueuedPrompt(
  item: {
    files?: Array<{ url?: string; filename?: string; mediaType?: string }>;
    attachmentPaths?: string[];
  },
  fileUrlForPath?: (path: string) => string,
): Promise<File[]> {
  if (item.files && item.files.length > 0) {
    return filesFromComposerParts(item.files);
  }
  const paths = item.attachmentPaths ?? [];
  return filesFromComposerParts(
    paths.map((path) => {
      const filename = attachmentFilename(path);
      return {
        filename,
        mediaType: mediaTypeFromFilename(filename),
        url: fileUrlForPath?.(path),
      };
    }),
  );
}
