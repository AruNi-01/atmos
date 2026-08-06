/**
 * Copy Tauri production bitmap/icns/ico into apps/desktop-electron/resources/icons
 * so dev + packaging both have local Atmos branding assets.
 *
 * Does **not** touch `icon.icon/` (macOS 26 Liquid Glass Icon Composer package) —
 * that tree is Electron-owned and must stay in resources/icons.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");
const sourceDir = join(repoRoot, "apps/desktop/src-tauri/icons");
const destDir = join(appRoot, "resources/icons");

/** Bitmap / classic macOS-Windows files synced from Tauri. */
const REQUIRED = [
  "icon.png",
  "icon.icns",
  "icon.ico",
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
] as const;

function main() {
  if (!existsSync(sourceDir)) {
    console.warn(`[sync-icons] source missing: ${sourceDir}`);
    return;
  }
  mkdirSync(destDir, { recursive: true });

  const available = new Set(readdirSync(sourceDir));
  let copied = 0;
  for (const name of REQUIRED) {
    if (!available.has(name)) {
      console.warn(`[sync-icons] skip missing ${name}`);
      continue;
    }
    copyFileSync(join(sourceDir, name), join(destDir, name));
    copied += 1;
  }

  const liquidGlass = join(destDir, "icon.icon", "icon.json");
  if (existsSync(liquidGlass)) {
    console.log(`[sync-icons] kept Liquid Glass package: icon.icon/`);
  } else {
    console.warn(
      `[sync-icons] icon.icon/ missing — macOS 26 packaging needs resources/icons/icon.icon`,
    );
  }

  console.log(
    `[sync-icons] ${copied}/${REQUIRED.length} icons → ${destDir}`,
  );
}

main();
