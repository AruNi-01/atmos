export type MdLiveMediaKind = "img" | "video" | "audio" | "file";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico", "tif", "tiff"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
const AUDIO_EXT = new Set(["mp3", "wav", "flac", "aac", "m4a", "ogg", "oga"]);

export function extensionOfPath(path: string): string {
  const trimmed = path.split("?")[0]?.split("#")[0] ?? path;
  const base = trimmed.split("/").pop() ?? trimmed;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function classifyMdLiveMedia(path: string): MdLiveMediaKind {
  const ext = extensionOfPath(path);
  if (IMAGE_EXT.has(ext)) return "img";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  return "file";
}

export function mdLiveMediaMarkdown(_kind: MdLiveMediaKind, name: string, href: string): string {
  return `![${name}](${href})`;
}
