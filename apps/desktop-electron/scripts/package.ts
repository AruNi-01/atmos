/**
 * Full package: sync icons → esbuild → stage runtime → electron-builder.
 *
 * Env:
 *   ATMOS_ELECTRON_BUILDER_ARGS — extra args for electron-builder (space-separated)
 *   ATMOS_ELECTRON_SKIP_RUNTIME_STAGE=1 — skip prepare-package (CI may stage earlier)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appRoot, "package.json"));

function run(cmd: string, args: string[], opts: { cwd?: string } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? appRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

function main() {
  run(process.execPath, [join(appRoot, "scripts/sync-icons.ts")]);
  run(process.execPath, [join(appRoot, "scripts/build.ts")]);

  if (process.env.ATMOS_ELECTRON_SKIP_RUNTIME_STAGE !== "1") {
    run(process.execPath, [join(appRoot, "scripts/prepare-package.ts")]);
  }

  const runtimeWeb = join(appRoot, "resources/runtime/current/web/index.html");
  if (!existsSync(runtimeWeb)) {
    console.error(
      `[package] missing ${runtimeWeb} — stage runtime before packaging`,
    );
    process.exit(1);
  }

  let builderBin: string;
  try {
    builderBin = require.resolve("electron-builder/cli.js");
  } catch {
    console.error(
      "[package] electron-builder not installed. Run bun install from repo root.",
    );
    process.exit(1);
  }

  const extra =
    process.env.ATMOS_ELECTRON_BUILDER_ARGS?.trim().split(/\s+/).filter(Boolean) ??
    [];
  // Publish never — CI attaches artifacts to the desktop-electron-* GitHub Release.
  run(process.execPath, [builderBin, "--config", "electron-builder.yml", ...extra]);
  console.log("[package] artifacts under apps/desktop-electron/release/");
}

main();
