/**
 * Bundle main + preload with esbuild (TypeScript → dist/).
 * Also syncs Atmos icons from the Tauri icon pack for branding.
 */
import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "../..");
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
  // Native modules stay external so Electron loads platform binaries from node_modules.
  external: ["electron", "koffi"],
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
// and matches the proven sandboxed browser-preload approach.
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
  entryPoints: [join(root, "src/browser/browser-preload.ts")],
  outfile: join(dist, "browser-preload.cjs"),
});
// Dual-shift helper: spawned as ELECTRON_RUN_AS_NODE child (global keys).
await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/appshot/shift-helper-main.ts")],
  outfile: join(dist, "shift-helper-main.js"),
});
// Desktop Use Accessibility grant panel (drag host .app into System Settings).
await esbuild.build({
  ...shared,
  format: "cjs",
  entryPoints: [join(root, "src/desktop-use/grant-preload.ts")],
  outfile: join(dist, "grant-preload.cjs"),
});

// Guest element-select runtime is read at runtime via executeJavaScript inject.
// Ship next to main.js so packaged apps resolve dist/browser-runtime.js (not monorepo).
const browserRuntimeSrc = join(
  repoRoot,
  "packages/shared/browser/browser-runtime.js",
);
const browserRuntimeDest = join(dist, "browser-runtime.js");
if (!existsSync(browserRuntimeSrc)) {
  throw new Error(
    `[build] missing browser runtime source: ${browserRuntimeSrc}`,
  );
}
copyFileSync(browserRuntimeSrc, browserRuntimeDest);

if (process.platform === "darwin") {
  const native = spawnSync(
    process.execPath,
    [join(root, "scripts/build-appshot-shift-native.ts")],
    { cwd: root, stdio: "inherit" },
  );
  if (native.status !== 0) {
    throw new Error(
      `[build] native helpers failed status=${native.status ?? "null"}`,
    );
  }
}

console.log(
  "[build] dist/main.js, dist/preload.cjs, dist/browser-preload.cjs, dist/browser-runtime.js, dist/shift-helper-main.js, dist/grant-preload.cjs",
);
