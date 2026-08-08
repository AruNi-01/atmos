/**
 * Compile AppShot dual-shift native libraries (macOS only) into resources/bin/.
 *
 * - libatmos_appshot_shift.dylib — koffi load for Electron fallback helper
 * - libatmos_appshot_shift_inject.dylib — DYLD_INSERT into Atmos Desktop Use
 *   host serve process so dual-shift shares host Accessibility TCC
 *
 * Invoked from prepare-package / package / dev build flow.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(appRoot, "native/appshot-shift/appshot_shift.c");
const outDir = join(appRoot, "resources/bin");
const outHelper = join(outDir, "libatmos_appshot_shift.dylib");
const outInject = join(outDir, "libatmos_appshot_shift_inject.dylib");

function buildDylib(out: string, args: string[]): void {
  const clang = spawnSync("clang", args, { encoding: "utf8" });
  if (clang.status !== 0) {
    throw new Error(
      `clang failed for ${out}:\n${clang.stderr || clang.stdout || "unknown"}`,
    );
  }
  const sign = spawnSync("codesign", ["-s", "-", "-f", out], {
    encoding: "utf8",
  });
  if (sign.status !== 0) {
    console.warn(
      `[build-appshot-shift] codesign warning: ${sign.stderr || sign.stdout}`,
    );
  }
  console.log(`[build-appshot-shift] ${out}`);
}

function main(): void {
  if (process.platform !== "darwin") {
    console.log("[build-appshot-shift] skip (not macOS)");
    return;
  }
  if (!existsSync(src)) {
    throw new Error(`missing native source: ${src}`);
  }
  mkdirSync(outDir, { recursive: true });

  // Electron koffi helper (existing path)
  buildDylib(outHelper, [
    "-dynamiclib",
    "-O2",
    "-o",
    outHelper,
    src,
    "-framework",
    "ApplicationServices",
    "-framework",
    "CoreFoundation",
    "-framework",
    "CoreGraphics",
    "-install_name",
    "@rpath/libatmos_appshot_shift.dylib",
  ]);

  // Host inject — dual-shift inside Atmos Desktop Use serve process
  buildDylib(outInject, [
    "-dynamiclib",
    "-O2",
    "-DATMOS_APPSHOT_SHIFT_HOST_INJECT=1",
    "-o",
    outInject,
    src,
    "-framework",
    "ApplicationServices",
    "-framework",
    "CoreFoundation",
    "-framework",
    "CoreGraphics",
    "-install_name",
    "@rpath/libatmos_appshot_shift_inject.dylib",
  ]);
}

main();
