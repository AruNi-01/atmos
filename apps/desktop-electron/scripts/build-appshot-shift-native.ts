/**
 * Compile libatmos_appshot_shift.dylib (macOS only) into resources/bin/.
 * Invoked from prepare-package / package flow.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(appRoot, "native/appshot-shift/appshot_shift.c");
const outDir = join(appRoot, "resources/bin");
const out = join(outDir, "libatmos_appshot_shift.dylib");

function main(): void {
  if (process.platform !== "darwin") {
    console.log("[build-appshot-shift] skip (not macOS)");
    return;
  }
  if (!existsSync(src)) {
    throw new Error(`missing native source: ${src}`);
  }
  mkdirSync(outDir, { recursive: true });

  const clang = spawnSync(
    "clang",
    [
      "-dynamiclib",
      "-O2",
      "-o",
      out,
      src,
      "-framework",
      "ApplicationServices",
      "-framework",
      "CoreFoundation",
      "-framework",
      "CoreGraphics",
      // Load by absolute path via koffi; keep a stable install name.
      "-install_name",
      "@rpath/libatmos_appshot_shift.dylib",
    ],
    { encoding: "utf8" },
  );
  if (clang.status !== 0) {
    throw new Error(
      `clang failed:\n${clang.stderr || clang.stdout || "unknown"}`,
    );
  }

  // Ad-hoc sign so hardened-runtime Electron can load the dylib.
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

main();
