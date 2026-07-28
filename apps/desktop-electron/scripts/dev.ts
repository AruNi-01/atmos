/**
 * Production desktop dev entry: prepare shared runtime if needed, then launch Electron.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");

function run(command: string, args: string[], opts: { cwd?: string } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: opts.cwd ?? appRoot,
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

async function prepareIfNeeded() {
  if (process.env.ATMOS_ELECTRON_SKIP_PREPARE === "1") {
    console.log("[dev] skip prepare");
    return;
  }
  const apiBin = join(
    repoRoot,
    "apps/desktop/src-tauri/binaries/runtime/current/bin/Atmos Server",
  );
  const webIndex = join(
    repoRoot,
    "apps/desktop/src-tauri/binaries/runtime/current/web/index.html",
  );
  if (
    existsSync(apiBin) &&
    existsSync(webIndex) &&
    process.env.ATMOS_DESKTOP_SKIP_WEB_BUILD === "1"
  ) {
    console.log("[dev] runtime present; skip prepare");
    return;
  }
  console.log("[dev] prepare-sidecar…");
  await run("bash", [join(repoRoot, "scripts/desktop/prepare-sidecar.sh")], {
    cwd: repoRoot,
  });
}

async function main() {
  await prepareIfNeeded();
  // Sync icons into resources/icons before staging the macOS dev .app.
  await run(process.execPath, [join(appRoot, "scripts/sync-icons.ts")]);
  await run(process.execPath, [join(appRoot, "scripts/build.ts")]);

  // macOS: stock Electron.app hardcodes Dock name/icon as "Electron". Stage a
  // branded copy (Info.plist + icns) so just dev-desktop-electron looks right.
  const { resolveDevElectronBinary } = await import("./prepare-dev-app.ts");
  const electronBin = resolveDevElectronBinary();
  if (!electronBin || !existsSync(electronBin)) {
    throw new Error("Electron binary missing");
  }
  console.log(`[dev] ${electronBin}`);
  const child = spawn(electronBin, ["."], {
    cwd: appRoot,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
  });
  child.on("close", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
