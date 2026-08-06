/**
 * Resolve guest browser-runtime.js for inject (APP-053).
 * Pure path helpers — no Electron imports (unit-testable).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Packaged app: `dist/browser-runtime.js` next to main (copied at build).
 * Dev monorepo: fall back to `packages/shared/browser/browser-runtime.js`.
 */
export function resolveBrowserRuntimeScriptPath(
  moduleDir: string,
  repoRoot: string,
): string {
  const shipped = join(moduleDir, "browser-runtime.js");
  if (existsSync(shipped)) return shipped;
  return join(repoRoot, "packages/shared/browser/browser-runtime.js");
}
