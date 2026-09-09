/**
 * Pure helpers for Atmos.app path + grant overlay placement (no Electron).
 */

import { dirname } from "node:path";

export type ViewportAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function resolveAtmosAppBundlePath(
  execPath: string,
  platform: NodeJS.Platform,
): string | null {
  if (platform !== "darwin") return null;
  let dir = dirname(execPath);
  for (let i = 0; i < 8; i++) {
    if (dir.endsWith(".app")) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function parseViewportAnchor(raw: unknown): ViewportAnchor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  const x = typeof a.x === "number" ? a.x : Number(a.x);
  const y = typeof a.y === "number" ? a.y : Number(a.y);
  const width = typeof a.width === "number" ? a.width : Number(a.width);
  const height = typeof a.height === "number" ? a.height : Number(a.height);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

export function grantOverlaySourceOriginFromAnchor(
  contentBounds: { x: number; y: number },
  anchor: ViewportAnchor,
  panelW: number,
  panelH: number,
): { x: number; y: number } {
  return {
    x: Math.round(contentBounds.x + anchor.x + anchor.width / 2 - panelW / 2),
    y: Math.round(contentBounds.y + anchor.y + anchor.height / 2 - panelH / 2),
  };
}

/** Sit the grant card over Atmos's left sidebar list before flying to Settings. */
export const LEFT_SIDEBAR_GRANT_INSET_X = 16;
export const LEFT_SIDEBAR_GRANT_INSET_Y = 88;

export function leftSidebarGrantOrigin(
  contentBounds: { x: number; y: number; width: number; height: number },
  panelH: number,
): { x: number; y: number } {
  const x = Math.round(contentBounds.x + LEFT_SIDEBAR_GRANT_INSET_X);
  const minY = contentBounds.y + 12;
  const maxY = contentBounds.y + contentBounds.height - panelH - 12;
  const preferred = contentBounds.y + LEFT_SIDEBAR_GRANT_INSET_Y;
  const y = Math.round(
    maxY >= minY ? Math.min(Math.max(preferred, minY), maxY) : minY,
  );
  return { x, y };
}
