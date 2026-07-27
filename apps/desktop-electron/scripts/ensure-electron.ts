/**
 * Ensure the Electron binary is downloaded (bun sometimes skips postinstall).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function tryResolveElectron(): string | null {
  try {
    const path = require("electron") as string;
    return typeof path === "string" && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

if (tryResolveElectron()) {
  process.exit(0);
}

let electronPkgDir: string;
try {
  electronPkgDir = dirname(require.resolve("electron/package.json"));
} catch {
  console.warn(
    "[ensure-electron] electron package not installed; run bun install",
  );
  process.exit(0);
}

const installJs = join(electronPkgDir, "install.js");
if (!existsSync(installJs)) {
  console.warn("[ensure-electron] install.js missing");
  process.exit(0);
}

const result = spawnSync(process.execPath, [installJs], {
  cwd: electronPkgDir,
  stdio: "inherit",
  env: process.env,
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const again = tryResolveElectron();
if (!again) {
  console.error("[ensure-electron] binary still missing after install");
  process.exit(1);
}
console.log(`[ensure-electron] ready: ${again}`);
