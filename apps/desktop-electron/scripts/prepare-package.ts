/**
 * Stage Atmos Server + web static + skills into resources/runtime/current
 * for electron-builder extraResources (process.resourcesPath/runtime/current).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");
const require = createRequire(join(appRoot, "package.json"));

function packageVersion(): string {
  const pkg = require(join(appRoot, "package.json")) as { version?: string };
  return pkg.version ?? "0.0.0";
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
}

main();
