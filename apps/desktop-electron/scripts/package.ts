/**
 * Full package: sync icons → esbuild → stage runtime → electron-builder.
 *
 * Env:
 *   ATMOS_ELECTRON_BUILDER_ARGS — extra args for electron-builder (space-separated)
 *   ATMOS_ELECTRON_SKIP_RUNTIME_STAGE=1 — skip prepare-package (CI may stage earlier)
 *   ATMOS_ELECTRON_ICON_LEGACY=1 — skip Liquid Glass Assets.car (icns only)
 *   ATMOS_ELECTRON_REQUIRE_LIQUID_GLASS=1 — fail if Assets.car not embedded
 *     (default on CI when packaging macOS)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkActool26,
  hasIconComposerPackage,
  ICON_COMPOSER_REL,
  verifyPackagedMacIcon,
} from "./macos-icon.ts";
import { STAGED_CLI_REQUIREMENT_REL } from "./prepare-package.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appRoot, "package.json"));
const requireScript = createRequire(import.meta.url);
const { verifySlimPackagedApp } = requireScript(
  "./slim-electron-runtime.cjs",
) as {
  verifySlimPackagedApp: (
    appOutDir: string,
    platform: string,
  ) => { ok: boolean; problems: string[] };
};

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

function builderArgsIncludeMac(extra: string[]): boolean {
  if (extra.length === 0) return process.platform === "darwin";
  if (extra.some((a) => a === "--mac" || a.startsWith("--mac="))) return true;
  const hasOther = extra.some(
    (a) =>
      a === "--win" ||
      a === "--linux" ||
      a.startsWith("--win") ||
      a.startsWith("--linux"),
  );
  const hasMac = extra.some((a) => a === "--mac" || a.startsWith("--mac"));
  if (hasOther && !hasMac) return false;
  return process.platform === "darwin" || hasMac;
}

function builderArgsIncludeWin(extra: string[]): boolean {
  if (extra.some((a) => a === "--win" || a.startsWith("--win"))) return true;
  if (extra.length === 0) return process.platform === "win32";
  return false;
}

function builderArgsIncludeLinux(extra: string[]): boolean {
  if (extra.some((a) => a === "--linux" || a.startsWith("--linux"))) return true;
  if (extra.length === 0) return process.platform === "linux";
  return false;
}

function assertSlimOk(appOutDir: string, platform: string, label: string): void {
  const slim = verifySlimPackagedApp(appOutDir, platform);
  if (!slim.ok) {
    console.error(
      `[package] Electron runtime slim check failed for ${label}: ${slim.problems.join("; ")}`,
    );
    process.exit(1);
  }
  console.log(
    `[package] Chromium locales en/zh_CN/zh_TW + SwiftShader stripped OK (${label})`,
  );
}

function requireLiquidGlass(): boolean {
  return (
    process.env.ATMOS_ELECTRON_REQUIRE_LIQUID_GLASS === "1" ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true"
  );
}

/** Preflight: warn or fail before electron-builder when Liquid Glass is required. */
function preflightMacIcons(extra: string[]): void {
  if (!builderArgsIncludeMac(extra)) return;
  if (process.env.ATMOS_ELECTRON_ICON_LEGACY === "1") {
    console.warn(
      "[package] ATMOS_ELECTRON_ICON_LEGACY=1 — icns only (no Assets.car)",
    );
    return;
  }
  if (!hasIconComposerPackage(appRoot)) {
    const msg = `[package] missing ${ICON_COMPOSER_REL}`;
    if (requireLiquidGlass()) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`${msg} — Dock may look small on macOS 26`);
    return;
  }
  const actool = checkActool26();
  if (actool.ok) {
    console.log(
      `[package] Liquid Glass icons: actool ${actool.version} + ${ICON_COMPOSER_REL} (via afterPack)`,
    );
    return;
  }
  const msg = `[package] actool unavailable for Liquid Glass .icon: ${actool.reason}`;
  if (requireLiquidGlass()) {
    console.error(msg);
    console.error(
      "[package] CI/macOS release requires Xcode 26+ (actool ≥ 26) on the runner.",
    );
    console.error(
      "[package] Local workaround: install Xcode 26, or set ATMOS_ELECTRON_ICON_LEGACY=1 for icns-only.",
    );
    process.exit(1);
  }
  console.warn(msg);
  console.warn(
    "[package] Falling back to legacy icon.icns (Dock may look small on macOS 26).",
  );
}

function findPackagedMacApp(): string | null {
  const releaseDir = join(appRoot, "release");
  if (!existsSync(releaseDir)) return null;
  const stack = [releaseDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const p = join(dir, name);
      if (name === "Atmos.app") return p;
      if (name.startsWith("mac")) stack.push(p);
    }
  }
  return null;
}

function main() {
  run(process.execPath, [join(appRoot, "scripts/sync-icons.ts")]);
  run(process.execPath, [join(appRoot, "scripts/build.ts")]);

  // Guest element-select inject script must ship next to main.js (APP-053).
  const browserRuntime = join(appRoot, "dist/browser-runtime.js");
  if (!existsSync(browserRuntime)) {
    console.error(
      `[package] missing ${browserRuntime} — build must copy packages/shared/browser/browser-runtime.js`,
    );
    process.exit(1);
  }

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

  const stagedCliReq = join(appRoot, STAGED_CLI_REQUIREMENT_REL);
  if (!existsSync(stagedCliReq)) {
    console.error(
      `[package] missing ${stagedCliReq} — stage CLI floor overlay before packaging`,
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
    process.env.ATMOS_ELECTRON_BUILDER_ARGS?.trim()
      .split(/\s+/)
      .filter(Boolean) ?? [];
  preflightMacIcons(extra);

  run(process.execPath, [
    builderBin,
    "--config",
    "electron-builder.yml",
    ...extra,
  ]);
  console.log("[package] artifacts under apps/desktop-electron/release/");

  if (builderArgsIncludeMac(extra) && process.platform === "darwin") {
    const app = findPackagedMacApp();
    if (app) {
      const v = verifyPackagedMacIcon(app);
      for (const line of v.details) {
        console.log(`[package] icon-check: ${line}`);
      }
      const forcedLegacy = process.env.ATMOS_ELECTRON_ICON_LEGACY === "1";
      if (requireLiquidGlass() && !forcedLegacy && !v.ok) {
        console.error(
          `[package] macOS icon verification failed for ${app} (expected Assets.car + CFBundleIconName + icon.icns)`,
        );
        process.exit(1);
      }
      if (v.ok) {
        console.log("[package] macOS Liquid Glass + legacy ICNS icons OK");
      }

      assertSlimOk(dirname(app), "darwin", app);
    }
  }

  if (builderArgsIncludeWin(extra)) {
    const unpacked = join(appRoot, "release/win-unpacked");
    if (existsSync(unpacked)) {
      assertSlimOk(unpacked, "win32", unpacked);
    }
  }
  if (builderArgsIncludeLinux(extra)) {
    const unpacked = join(appRoot, "release/linux-unpacked");
    if (existsSync(unpacked)) {
      assertSlimOk(unpacked, "linux", unpacked);
    }
  }
}

main();
