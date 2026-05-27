import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildWebStaticForDesktop, copyWebStaticToSidecar } from "./build-web-static.mjs";
import { layoutRuntimeBundle } from "./layout-runtime-bundle.mjs";

const rootDir = resolve(import.meta.dirname, "../..");
const cliCargoToml = join(rootDir, "apps/cli/Cargo.toml");

function readCliVersion() {
  const cargoToml = readFileSync(cliCargoToml, "utf8");
  const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    console.error(`Unable to resolve CLI version from ${cliCargoToml}`);
    process.exit(1);
  }
  return match[1];
}

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

run("cargo", ["build", "--release", "--bin", "atmos", "--target", targetTriple], {
  env: {
    ...process.env,
    ATMOS_LOG_LEVEL: process.env.ATMOS_LOG_LEVEL ?? "info",
  },
});

const binExt = targetTriple.includes("windows") ? ".exe" : "";
const cliVersion = readCliVersion();
const binariesDir = join(rootDir, "apps/desktop/src-tauri/binaries");
mkdirSync(binariesDir, { recursive: true });

const fromSidecar = join(rootDir, `target/${targetTriple}/release/api${binExt}`);
const toSidecar = join(binariesDir, `atmos-sidecar-${targetTriple}${binExt}`);
cpSync(fromSidecar, toSidecar);
console.log(`Prepared sidecar: ${toSidecar}`);

const cliResourceDir = join(binariesDir, "atmos-cli");
const fromCli = join(rootDir, `target/${targetTriple}/release/atmos${binExt}`);
const toCli = join(cliResourceDir, `atmos${binExt}`);
rmSync(cliResourceDir, { recursive: true, force: true });
mkdirSync(cliResourceDir, { recursive: true });
cpSync(fromCli, toCli);
writeFileSync(
  join(cliResourceDir, "manifest.json"),
  JSON.stringify(
    {
      schema_version: 1,
      product: "atmos-cli",
      cli_version: cliVersion,
      target_triple: targetTriple,
      built_at: new Date().toISOString(),
      layout: {
        cli: `atmos${binExt}`,
      },
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`Prepared Atmos CLI resource: ${toCli}`);

copyWebStaticToSidecar(rootDir);

layoutRuntimeBundle(rootDir, targetTriple, binExt);
