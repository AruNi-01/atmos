/**
 * Stage Atmos Server + web static + skills into resources/runtime/current
 * for electron-builder extraResources (process.resourcesPath/runtime/current).
 * Also stages atmos-browser-cookies for packaged cookie import (no cargo).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  cookieHelperBinName,
  findCookieHelperBinary,
  listCookieHelperCandidates,
} from "../src/cookies/helper-resolve.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");
const require = createRequire(join(appRoot, "package.json"));

function packageVersion(): string {
  const pkg = require(join(appRoot, "package.json")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function requireCookieHelper(): boolean {
  return (
    process.env.ATMOS_REQUIRE_COOKIE_HELPER === "1" ||
    process.env.CI === "true" ||
    process.env.CI === "1"
  );
}

function main() {
  const srcRuntime = join(
    repoRoot,
    "apps/desktop/src-tauri/binaries/runtime/current",
  );
  const destRuntime = join(appRoot, "resources/runtime/current");
  const apiCandidates = [
    join(srcRuntime, "bin/Atmos Server"),
    join(srcRuntime, "bin/Atmos Server.exe"),
    join(srcRuntime, "bin/atmos-api"),
    join(srcRuntime, "bin/api"),
  ];
  const hasApi = apiCandidates.some((p) => existsSync(p));
  const hasWeb = existsSync(join(srcRuntime, "web/index.html"));

  if (!hasApi || !hasWeb) {
    throw new Error(
      `Runtime bundle incomplete at ${srcRuntime} (api=${hasApi} web=${hasWeb}). ` +
        `Run: bash ./scripts/desktop/prepare-sidecar.sh`,
    );
  }

  rmSync(destRuntime, { recursive: true, force: true });
  mkdirSync(dirname(destRuntime), { recursive: true });
  cpSync(srcRuntime, destRuntime, { recursive: true });

  writeFileSync(
    join(destRuntime, "version.txt"),
    `${packageVersion()}\n`,
    "utf8",
  );

  console.log(`[prepare-package] staged runtime → ${destRuntime}`);

  // Native dual-shift dylib (macOS CGEventTap on dedicated thread).
  if (process.platform === "darwin") {
    const buildNative = spawnSync(
      process.execPath,
      [join(appRoot, "scripts/build-appshot-shift-native.ts")],
      { cwd: appRoot, stdio: "inherit", encoding: "utf8" },
    );
    if (buildNative.status !== 0) {
      throw new Error(
        `[prepare-package] build-appshot-shift-native failed status=${buildNative.status}`,
      );
    }
  }

  // Stage atmos-browser-cookies helper for packaged cookie import (no cargo).
  // Looks at host target/release AND target/<triple>/release (CI --target).
  const helperName = cookieHelperBinName();
  const helperSrc = findCookieHelperBinary({
    repoRoot,
    binName: helperName,
    packageResourcesBin: join(appRoot, "resources/bin"),
  });
  const helperDestDir = join(appRoot, "resources/bin");
  if (helperSrc) {
    mkdirSync(helperDestDir, { recursive: true });
    const dest = join(helperDestDir, helperName);
    // Avoid no-op copy when source is already dest
    if (helperSrc.path !== dest) {
      cpSync(helperSrc.path, dest);
    }
    console.log(
      `[prepare-package] staged cookie helper → ${dest} (from ${helperSrc.source})`,
    );
  } else {
    const tried = listCookieHelperCandidates({
      repoRoot,
      binName: helperName,
    })
      .slice(0, 12)
      .map((c) => c.path)
      .join("\n  ");
    const msg =
      `[prepare-package] atmos-browser-cookies not found.\n` +
      `  Build: cargo build --release -p browser-cookies --bin atmos-browser-cookies` +
      ` [--target <triple>]\n` +
      `  Looked under:\n  ${tried}`;
    if (requireCookieHelper()) {
      throw new Error(msg);
    }
    console.warn(msg);
  }
}

main();
