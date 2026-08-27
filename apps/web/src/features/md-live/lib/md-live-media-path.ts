import { classifyMdLiveMedia, type MdLiveMediaKind } from "@atmos/md-live/ui";
import { isUntitledMarkdownPath } from "./md-live-paths";

export function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function posixBasename(path: string): string {
  const normalized = normalizeFsPath(path);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function posixDirname(path: string): string {
  const normalized = normalizeFsPath(path).replace(/\/$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized.startsWith("/") ? "/" : ".";
  return normalized.slice(0, index) || "/";
}

export function isPathInsideRoot(root: string, target: string): boolean {
  const prefix = normalizeFsPath(root).replace(/\/$/, "");
  const value = normalizeFsPath(target);
  return value === prefix || value.startsWith(`${prefix}/`);
}

export function posixRelative(fromDir: string, toFile: string): string {
  const fromParts = normalizeFsPath(fromDir).replace(/\/$/, "").split("/").filter(Boolean);
  const toParts = normalizeFsPath(toFile).split("/").filter(Boolean);
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  const ups = fromParts.length - shared;
  const down = toParts.slice(shared);
  const rel = [...Array.from({ length: ups }, () => ".."), ...down].join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

export function documentDirectory(documentPath: string, workspaceRoot: string | null): string | null {
  if (!workspaceRoot) return isUntitledMarkdownPath(documentPath) ? null : posixDirname(documentPath);
  if (isUntitledMarkdownPath(documentPath)) return workspaceRoot;
  return posixDirname(documentPath);
}

export function mediaLibraryDir(workspaceRoot: string, kind: MdLiveMediaKind): string {
  return `${normalizeFsPath(workspaceRoot).replace(/\/$/, "")}/.atmos/references/media/${kind}`;
}

export function nextAvailableName(existing: Set<string>, fileName: string): string {
  if (!existing.has(fileName)) return fileName;
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  let n = 1;
  while (existing.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
}

export function classifyPickedMedia(path: string, requested?: MdLiveMediaKind): MdLiveMediaKind {
  const actual = classifyMdLiveMedia(path);
  if (!requested || requested === "file") return actual;
  return requested;
}

export function mediaKindFromOpen(kind: "image" | "video" | "audio" | "file"): MdLiveMediaKind {
  if (kind === "image") return "img";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  return "file";
}
