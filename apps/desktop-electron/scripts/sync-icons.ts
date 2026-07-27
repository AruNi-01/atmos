/**
 * Copy Tauri production icons into apps/desktop-electron/resources/icons
 * so dev + future packaging both have local Atmos branding assets.
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

/** Files needed for Electron window / dock / future installer. */
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
  console.log(
    `[sync-icons] ${copied}/${REQUIRED.length} icons → ${destDir}`,
  );
}

main();
