/**
 * Resize AppShot PNGs for inline IPC / UI previews (Tauri APP-021 parity).
 * macOS uses `sips -Z <maxEdge>`; other platforms return null (caller falls back).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/** Pending preview / history thumbnails (fits React state + IPC). */
export const THUMBNAIL_MAX_EDGE = 480;
/** Stored snapshot soft max (optional write-path resize). */
export const SNAPSHOT_MAX_EDGE = 1600;

/** Match web `MAX_INLINE_APPSHOT_IMAGE_CHARS` budget for full data URLs. */
export const MAX_INLINE_DATA_URL_CHARS = 512 * 1024;
export const DATA_URL_PREFIX = "data:image/png;base64,";

export function pngDataUrlCharLength(byteLen: number): number {
  return DATA_URL_PREFIX.length + Math.ceil(byteLen / 3) * 4;
}

export function fitsInlinePngDataUrl(byteLen: number): boolean {
  return pngDataUrlCharLength(byteLen) <= MAX_INLINE_DATA_URL_CHARS;
}

/**
 * Downscale PNG with sips so max width/height is `maxEdge`.
 * Returns null when resize is unavailable or fails.
 */
export async function resizePngBytes(
  bytes: Buffer,
  maxEdge: number = THUMBNAIL_MAX_EDGE,
): Promise<Buffer | null> {
  if (!bytes.length) return null;
  if (process.platform !== "darwin") {
    // Without a resizer, only return original if it already fits.
    return fitsInlinePngDataUrl(bytes.length) ? bytes : null;
  }

  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "atmos-appshot-thumb-"));
    const input = join(dir, "in.png");
    const output = join(dir, "out.png");
    writeFileSync(input, bytes);
    await execFileAsync(
      "sips",
      ["-Z", String(maxEdge), input, "--out", output],
      { timeout: 8_000 },
    );
    if (!existsSync(output)) return null;
    const out = readFileSync(output);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export async function thumbnailPngFromBytes(
  bytes: Buffer,
): Promise<Buffer | null> {
  return resizePngBytes(bytes, THUMBNAIL_MAX_EDGE);
}

export async function thumbnailPngFromPath(
  path: string,
): Promise<Buffer | null> {
  if (!existsSync(path)) return null;
  try {
    return thumbnailPngFromBytes(readFileSync(path));
  } catch {
    return null;
  }
}

/**
 * Base64 (no data: prefix) for pending preview events.
 * Prefer original when small; otherwise thumbnail via sips.
 */
export async function buildScreenshotPreviewBase64(
  png: Buffer | null,
): Promise<string | null> {
  if (!png || png.length === 0) return null;
  if (fitsInlinePngDataUrl(png.length)) {
    return png.toString("base64");
  }
  const thumb = await thumbnailPngFromBytes(png);
  if (thumb && fitsInlinePngDataUrl(thumb.length)) {
    return thumb.toString("base64");
  }
  return null;
}

/**
 * Inline data URL for history rows / list payloads.
 */
export async function buildInlineSnapshotDataUrl(
  pngPath: string,
): Promise<string | null> {
  if (!existsSync(pngPath)) return null;
  let bytes: Buffer;
  try {
    bytes = readFileSync(pngPath);
  } catch {
    return null;
  }
  if (fitsInlinePngDataUrl(bytes.length)) {
    return `${DATA_URL_PREFIX}${bytes.toString("base64")}`;
  }
  const thumb = await thumbnailPngFromBytes(bytes);
  if (thumb && fitsInlinePngDataUrl(thumb.length)) {
    return `${DATA_URL_PREFIX}${thumb.toString("base64")}`;
  }
  return null;
}
