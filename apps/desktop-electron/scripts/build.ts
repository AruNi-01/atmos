/**
 * Bundle main + preload with esbuild (TypeScript → dist/).
 * Also syncs Atmos icons from the Tauri icon pack for branding.
 */
import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });

// Keep local resources/icons in sync with production Tauri assets.
const sync = spawnSync(process.execPath, [join(root, "scripts/sync-icons.ts")], {
  cwd: root,
  stdio: "inherit",
});
if (sync.status !== 0) {
  console.warn("[build] sync-icons exited non-zero; continuing with fallback paths");
}

const shared: esbuild.BuildOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
};

// Sequential builds: parallel esbuild services can flake under bun's process model.
await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/main.ts")],
  outfile: join(dist, "main.js"),
});
// First-party app preload as CommonJS (.cjs): Electron's preload loader does not
// treat ESM via package.json "type":"module"; .cjs avoids the .mjs requirement
// and matches the proven sandboxed preview-preload approach.
await esbuild.build({
  ...shared,
  format: "cjs",
  entryPoints: [join(root, "src/preload.ts")],
  outfile: join(dist, "preload.cjs"),
});
// Untrusted preview surfaces use sandbox:true — sandboxed preloads require
// CommonJS (`require("electron")`), not ESM import.
await esbuild.build({
  ...shared,
  format: "cjs",
  entryPoints: [join(root, "src/preview/preview-preload.ts")],
  outfile: join(dist, "preview-preload.cjs"),
});

console.log(
  "[build] dist/main.js, dist/preload.cjs, dist/preview-preload.cjs",
);
