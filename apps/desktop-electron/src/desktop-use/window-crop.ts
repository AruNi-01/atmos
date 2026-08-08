/**
 * Crop a full-display PNG to a window rectangle (logical points → pixels).
 * Used when host engine only returns a full-desktop screenshot.
 */

import { execFile } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LogicalBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DisplayMetrics = {
  /** Global origin of this display in logical points. */
  x: number;
  y: number;
  /** Logical size in points. */
  width: number;
  height: number;
  scaleFactor: number;
};

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Map window bounds (global logical points) onto a full-display PNG.
 * Returns null when the window is off this display or the crop would be tiny.
 */
export function computeWindowCropPixels(
  window: LogicalBounds,
  pngWidth: number,
  pngHeight: number,
  display: DisplayMetrics,
): PixelRect | null {
  if (
    !Number.isFinite(window.x) ||
    !Number.isFinite(window.y) ||
    !Number.isFinite(window.width) ||
    !Number.isFinite(window.height) ||
    window.width < 32 ||
    window.height < 32 ||
    pngWidth < 32 ||
    pngHeight < 32
  ) {
    return null;
  }

  // Prefer scale inferred from PNG vs display logical size (handles Retina).
  const scaleX = pngWidth / display.width;
  const scaleY = pngHeight / display.height;
  // If ratios diverge a lot, PNG is not this display alone — refuse crop.
  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX <= 0 ||
    scaleY <= 0 ||
    Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) > 0.08
  ) {
    // Fall back to reported scaleFactor when display metrics match roughly.
    const s = display.scaleFactor > 0 ? display.scaleFactor : 1;
    const expectedW = Math.round(display.width * s);
    const expectedH = Math.round(display.height * s);
    if (
      Math.abs(expectedW - pngWidth) > 8 ||
      Math.abs(expectedH - pngHeight) > 8
    ) {
      return null;
    }
  }

  const scale =
    Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) <= 0.08
      ? (scaleX + scaleY) / 2
      : display.scaleFactor > 0
        ? display.scaleFactor
        : 1;

  // Window relative to display origin (global points → display-local points).
  const localX = window.x - display.x;
  const localY = window.y - display.y;

  // Intersect with display.
  const x0 = Math.max(0, localX);
  const y0 = Math.max(0, localY);
  const x1 = Math.min(display.width, localX + window.width);
  const y1 = Math.min(display.height, localY + window.height);
  if (x1 - x0 < 32 || y1 - y0 < 32) return null;

  let px = Math.round(x0 * scale);
  let py = Math.round(y0 * scale);
  let pw = Math.round((x1 - x0) * scale);
  let ph = Math.round((y1 - y0) * scale);

  // Clamp into PNG.
  px = Math.max(0, Math.min(px, pngWidth - 1));
  py = Math.max(0, Math.min(py, pngHeight - 1));
  pw = Math.max(1, Math.min(pw, pngWidth - px));
  ph = Math.max(1, Math.min(ph, pngHeight - py));

  // If crop is still almost the full display, skip (not a "window" capture).
  const coverage = (pw * ph) / (pngWidth * pngHeight);
  if (coverage > 0.92) return null;

  if (pw < 64 || ph < 64) return null;
  return { x: px, y: py, width: pw, height: ph };
}

/**
 * Crop PNG bytes to a pixel rect via `sips` (macOS). Returns null on failure.
 */
export async function cropPngBytesToRect(
  png: Buffer,
  rect: PixelRect,
): Promise<Buffer | null> {
  if (process.platform !== "darwin" || !png.length) return null;
  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "atmos-appshot-crop-"));
    const input = join(dir, "in.png");
    const output = join(dir, "out.png");
    writeFileSync(input, png);
    // sips: --cropOffset is top-left Y,X in some versions; use cropToHeightWidth + offset.
    // Apple sips: -c height width  and --cropOffset y x (pixels from top-left).
    await execFileAsync(
      "sips",
      [
        "-c",
        String(rect.height),
        String(rect.width),
        "--cropOffset",
        String(rect.y),
        String(rect.x),
        input,
        "--out",
        output,
      ],
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

/**
 * Resolve Electron display metrics for a global point (testable without electron
 * when display is injected).
 */
export function displayMetricsFromElectronScreen(
  point: { x: number; y: number },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screenApi: { getDisplayNearestPoint: (p: { x: number; y: number }) => any },
): DisplayMetrics | null {
  try {
    const d = screenApi.getDisplayNearestPoint(point);
    const b = d?.bounds;
    const scale = typeof d?.scaleFactor === "number" ? d.scaleFactor : 1;
    if (
      !b ||
      typeof b.x !== "number" ||
      typeof b.y !== "number" ||
      typeof b.width !== "number" ||
      typeof b.height !== "number" ||
      b.width < 32 ||
      b.height < 32
    ) {
      return null;
    }
    return {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      scaleFactor: scale > 0 ? scale : 1,
    };
  } catch {
    return null;
  }
}
