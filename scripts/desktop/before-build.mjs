import { cpSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildWebStaticForDesktop, copyWebStaticToSidecar } from "./build-web-static.mjs";
import { layoutRuntimeBundle } from "./layout-runtime-bundle.mjs";

const rootDir = resolve(import.meta.dirname, "../..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: rootDir,
    env: process.env,
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

buildWebStaticForDesktop(rootDir);

let targetTriple = process.env.TARGET_TRIPLE;
if (!targetTriple) {
  const rustc = spawnSync("rustc", ["-vV"], {
    cwd: rootDir,
    encoding: "utf-8",
    shell: process.platform === "win32",
  });

  if (rustc.status !== 0) {
    process.exit(rustc.status ?? 1);
  }

  const hostLine = rustc.stdout.split("\n").find((line) => line.startsWith("host:"));

  if (!hostLine) {
    console.error("Unable to detect rust host triple from `rustc -vV`.");
    process.exit(1);
  }

  targetTriple = hostLine.replace("host:", "").trim();
}

run("cargo", ["build", "--release", "--bin", "api", "--target", targetTriple], {
  env: {
    ...process.env,
    ATMOS_LOG_LEVEL: process.env.ATMOS_LOG_LEVEL ?? "info",
  },
});

const binExt = targetTriple.includes("windows") ? ".exe" : "";
const binariesDir = join(rootDir, "apps/desktop/src-tauri/binaries");
mkdirSync(binariesDir, { recursive: true });

const fromSidecar = join(rootDir, `target/${targetTriple}/release/api${binExt}`);
const toSidecar = join(binariesDir, `atmos-sidecar-${targetTriple}${binExt}`);
cpSync(fromSidecar, toSidecar);
console.log(`Prepared sidecar: ${toSidecar}`);

copyWebStaticToSidecar(rootDir);

layoutRuntimeBundle(rootDir, targetTriple, binExt);
