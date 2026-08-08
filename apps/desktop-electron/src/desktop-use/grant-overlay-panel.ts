/**
 * Grant overlay panel HTML, copy, and chip icons.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeImage } from "electron";
import { getResolvedAppIcons } from "../branding.js";

export type GrantOverlayPurpose = "accessibility" | "screen_recording";

export type GrantOverlayOptions = {
  hostAppPath: string;
  hostAppName?: string;
  /** BCP-47-ish language tag; used for in-panel copy. */
  locale?: string;
  /** Which Settings pane was opened (affects instruction copy). */
  purpose?: GrantOverlayPurpose;
  /**
   * Screen-point origin for the fly animation (typically the Grant button
   * center, converted from the host BrowserWindow content bounds).
   */
  sourceOrigin?: { x: number; y: number };
};

export type GrantState = {
  hostAppPath: string;
  hostAppName: string;
  instruction: string;
  chipLabel: string;
  /** data:image/... URL for the chip icon, or empty for CSS fallback. */
  iconDataUrl: string;
  /**
   * Pre-rendered full-chip PNG for startDrag ghost (set from renderer after paint).
   * Falls back to app icon only when missing.
   */
  dragPreviewDataUrl: string | null;
};

export function isZh(locale: string | undefined): boolean {
  return (locale ?? "").toLowerCase().startsWith("zh");
}

export function buildInstruction(
  hostAppName: string,
  purpose: GrantOverlayPurpose,
  locale?: string,
): string {
  if (isZh(locale)) {
    // Match macOS System Settings Chinese labels: 无障碍 / 屏幕录制.
    const goal =
      purpose === "screen_recording" ? "允许屏幕录制" : "允许无障碍";
    return `将「${hostAppName}」拖到上方列表以${goal}`;
  }
  const goal =
    purpose === "screen_recording"
      ? "to allow Screen Recording"
      : "to allow Accessibility";
  return `Drag ${hostAppName} to the list above ${goal}`;
}

function iconRoots(): string[] {
  const roots: string[] = [];
  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath : "";
  const here = dirname(fileURLToPath(import.meta.url));
  if (resourcesPath) {
    roots.push(join(resourcesPath, "icons"));
  }
  roots.push(join(here, "..", "resources", "icons"));
  roots.push(join(here, "..", "..", "resources", "icons"));
  return roots;
}

function firstExistingIcon(names: string[]): string | null {
  for (const root of iconRoots()) {
    for (const name of names) {
      const p = join(root, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Prefer PNG for nativeImage — .icns via createFromPath is flaky on some
 * Electron builds (empty / wrong size), which makes startDrag fail on macOS
 * (icon must be non-empty).
 */
function resolveBrandPngPath(): string | null {
  const icons = getResolvedAppIcons();
  return (
    firstExistingIcon(["128x128.png", "32x32.png", "icon.png"]) ??
    icons.pngPath ??
    null
  );
}

function loadNativeIcon(path: string, size: number): Electron.NativeImage | null {
  try {
    const img = nativeImage.createFromPath(path);
    if (img.isEmpty()) return null;
    const resized = img.resize({ width: size, height: size });
    return resized.isEmpty() ? null : resized;
  } catch {
    return null;
  }
}

export function resolveAppIconOnly(hostAppPath: string): Electron.NativeImage {
  const brandPng = resolveBrandPngPath();
  if (brandPng) {
    const img = loadNativeIcon(brandPng, 64);
    if (img) return img;
  }

  for (const p of [
    join(hostAppPath, "Contents", "Resources", "AppIcon.icns"),
    join(hostAppPath, "Contents", "Resources", "icon.icns"),
  ]) {
    if (!existsSync(p)) continue;
    const img = loadNativeIcon(p, 64);
    if (img) return img;
  }

  // Minimal non-empty 32×32 blue PNG (required on macOS startDrag).
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaElEQVRYR+2WMQ4AIAgD7f8f" +
      "zcbBxMHB2kBJuAZSWigAZgYz8z0zO+8dERExM7M+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOY" +
      "D2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD2A+gPkA5gOYD/gA1dYBvQ1vS5QAAAAASUVO" +
      "RK5CYII=",
    "base64",
  );
  const fallback = nativeImage.createFromBuffer(png);
  return fallback.isEmpty() ? nativeImage.createEmpty() : fallback;
}

export function nativeImageFromDataUrl(dataUrl: string): Electron.NativeImage | null {
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    return img.isEmpty() ? null : img;
  } catch {
    return null;
  }
}

/** Chip UI icon as data URL (CSP allows img-src data:). */
export function resolveChipIconDataUrl(hostAppPath: string): string {
  const brandPng = resolveBrandPngPath();
  if (brandPng) {
    try {
      const buf = readFileSync(brandPng);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* fall through */
    }
    const img = loadNativeIcon(brandPng, 56);
    if (img) {
      try {
        return img.toDataURL();
      } catch {
        /* fall through */
      }
    }
  }

  for (const p of [
    join(hostAppPath, "Contents", "Resources", "AppIcon.icns"),
    join(hostAppPath, "Contents", "Resources", "icon.icns"),
  ]) {
    if (!existsSync(p)) continue;
    const img = loadNativeIcon(p, 56);
    if (!img) continue;
    try {
      return img.toDataURL();
    } catch {
      /* continue */
    }
  }
  return "";
}

export function panelHtml(state: GrantState, locale?: string): string {
  const instruction = escapeHtml(state.instruction);
  const chip = escapeHtml(state.chipLabel);
  const closeLabel = isZh(locale) ? "关闭" : "Close";
  const iconHtml = state.iconDataUrl
    ? `<img class="icon" src="${state.iconDataUrl}" width="28" height="28" alt="" draggable="false" />`
    : `<div class="icon icon-fallback" aria-hidden="true"></div>`;
  return `<!DOCTYPE html>
<html lang="${isZh(locale) ? "zh" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:" />
  <title>Desktop Use permissions</title>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      user-select: none; -webkit-user-select: none;
    }
    .shell {
      box-sizing: border-box;
      margin: 6px;
      height: calc(100% - 12px);
      padding: 14px 16px 14px 16px;
      border-radius: 14px;
      background: rgba(40, 40, 42, 0.94);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 10px 36px rgba(0,0,0,0.42);
      color: #f2f2f2;
      display: flex;
      flex-direction: column;
      gap: 12px;
      justify-content: center;
      /* Whole-shell window drag breaks file drag — only non-chip chrome may drag. */
      -webkit-app-region: no-drag;
      /* Local entrance while the BrowserWindow flies across the desktop. */
      animation: grant-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes grant-enter {
      from {
        opacity: 0;
        transform: scale(0.9) translateY(10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 24px;
      -webkit-app-region: drag;
    }
    .arrow {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      color: #2f7cff;
      -webkit-app-region: no-drag;
    }
    .instruction {
      flex: 1;
      font-size: 13px;
      line-height: 1.35;
      font-weight: 500;
      color: rgba(255,255,255,0.92);
      letter-spacing: -0.01em;
    }
    .close {
      -webkit-app-region: no-drag;
      border: 0; background: transparent;
      color: rgba(255,255,255,0.4);
      font-size: 13px; cursor: pointer;
      width: 22px; height: 22px; border-radius: 6px; line-height: 1;
      flex-shrink: 0;
      padding: 0;
    }
    .close:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .chip {
      -webkit-app-region: no-drag;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 46px;
      padding: 0 14px;
      border-radius: 11px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      cursor: grab;
    }
    .chip:active { cursor: grabbing; background: rgba(255,255,255,0.10); }
    .icon {
      width: 28px; height: 28px; border-radius: 7px;
      flex-shrink: 0;
      object-fit: cover;
      pointer-events: none;
    }
    .icon-fallback {
      background: linear-gradient(145deg, #3b82f6, #1d4ed8);
    }
    .name {
      font-size: 14px; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      pointer-events: none;
      color: rgba(255,255,255,0.95);
    }
  </style>
</head>
<body>
  <div class="shell" id="shell">
    <div class="header">
      <svg class="arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3.2 5.6 9.6a1.1 1.1 0 0 0 1.55 1.56L11 7.3V19.5a1.1 1.1 0 0 0 2.2 0V7.3l3.85 3.86a1.1 1.1 0 1 0 1.55-1.56L12 3.2Z"/>
      </svg>
      <div class="instruction">${instruction}</div>
      <button class="close" type="button" title="${closeLabel}" id="close" aria-label="${closeLabel}">✕</button>
    </div>
    <div class="chip" id="chip" draggable="true" title="${chip}">
      ${iconHtml}
      <div class="name">${chip}</div>
    </div>
  </div>
  <script>
    const chip = document.getElementById('chip');
    const close = document.getElementById('close');

    function roundedRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    /**
     * Paint icon+label chip into a PNG for startDrag ghost.
     * IMPORTANT: Electron startDrag on macOS draws the bitmap at 1 device
     * pixel ≈ 1 screen point. Do NOT multiply by devicePixelRatio or the
     * ghost is 2× (or larger) than the on-screen chip.
     */
    function buildDragPreview() {
      try {
        const rect = chip.getBoundingClientRect();
        // Logical CSS size only — matches the chip the user is grabbing.
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match .chip styles so the ghost looks like the row itself.
        ctx.fillStyle = 'rgba(55, 55, 58, 0.96)';
        roundedRect(ctx, 0.5, 0.5, w - 1, h - 1, 11);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        roundedRect(ctx, 0.5, 0.5, w - 1, h - 1, 11);
        ctx.stroke();

        const padX = 14;
        const iconSize = 28;
        const gap = 10;
        const iconY = (h - iconSize) / 2;
        const img = chip.querySelector('img.icon');
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          roundedRect(ctx, padX, iconY, iconSize, iconSize, 7);
          ctx.clip();
          ctx.drawImage(img, padX, iconY, iconSize, iconSize);
          ctx.restore();
        } else {
          ctx.fillStyle = '#2563eb';
          roundedRect(ctx, padX, iconY, iconSize, iconSize, 7);
          ctx.fill();
        }

        const nameEl = chip.querySelector('.name');
        const label = (nameEl && nameEl.textContent) || '';
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
        ctx.textBaseline = 'middle';
        const textX = padX + iconSize + gap;
        const maxTextW = w - textX - 14;
        let draw = label;
        if (ctx.measureText(draw).width > maxTextW) {
          while (draw.length > 1 && ctx.measureText(draw + '…').width > maxTextW) {
            draw = draw.slice(0, -1);
          }
          draw = draw + '…';
        }
        ctx.fillText(draw, textX, h / 2);

        const dataUrl = canvas.toDataURL('image/png');
        window.atmosGrant?.setDragPreview(dataUrl);
      } catch (err) {
        console.warn('[grant] buildDragPreview failed', err);
      }
    }

    // Build after layout + icon decode so the ghost includes the real mark.
    const icon = chip.querySelector('img.icon');
    if (icon && !icon.complete) {
      icon.addEventListener('load', () => buildDragPreview(), { once: true });
      icon.addEventListener('error', () => buildDragPreview(), { once: true });
    }
    requestAnimationFrame(() => requestAnimationFrame(buildDragPreview));

    // Electron file drag: must use dragstart and call startDrag before return.
    chip.addEventListener('dragstart', (e) => {
      e.preventDefault();
      try {
        const result = window.atmosGrant?.startDrag();
        if (result && result.ok === false) {
          console.warn('[grant] startDrag failed', result.error);
        }
      } catch (err) {
        console.warn('[grant] startDrag threw', err);
      }
    });
    chip.addEventListener('drag', (e) => { e.preventDefault(); });
    close.addEventListener('click', () => window.atmosGrant?.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.atmosGrant?.close();
    });
  </script>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

