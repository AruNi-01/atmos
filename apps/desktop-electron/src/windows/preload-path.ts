/**
 * Shared first-party app preload resolver for main + secondary windows.
 * Keeps candidate lists identical so secondary windows never miss a path
 * the main window would find.
 *
 * Prefer CommonJS `.cjs` (Electron preload loader) over legacy `.js` ESM output.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolveAppPreloadPath(): string {
  const candidates = [
    join(__dirname, "preload.cjs"),
    join(__dirname, "preload.js"),
    resolve(process.cwd(), "dist/preload.cjs"),
    resolve(process.cwd(), "dist/preload.js"),
    resolve(process.cwd(), "apps/desktop-electron/dist/preload.cjs"),
    resolve(process.cwd(), "apps/desktop-electron/dist/preload.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]!;
}
