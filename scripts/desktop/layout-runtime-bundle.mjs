/**
 * Lay out Desktop / shared local runtime: binaries/runtime/current/{bin,web,system-skills}
 * Cross-platform (Windows-safe); replaces sourcing layout-runtime-bundle.sh from Node.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function layoutRuntimeBundle(rootDir, targetTriple, binExt = "") {
  const binariesDir = join(rootDir, "apps/desktop/src-tauri/binaries");
  const runtimeRoot = join(binariesDir, "runtime/current");

  let apiSrc = join(rootDir, `target/${targetTriple}/release/api${binExt}`);
  let cliSrc = join(rootDir, `target/${targetTriple}/release/atmos${binExt}`);
  if (!existsSync(apiSrc)) {
    apiSrc = join(rootDir, `target/${targetTriple}/debug/api${binExt}`);
    cliSrc = join(rootDir, `target/${targetTriple}/debug/atmos${binExt}`);
  }

  const webSrc = join(binariesDir, "web-out");
  const skillsSrc = join(binariesDir, "system-skills");

  if (!existsSync(apiSrc)) {
    console.error(
      `error: missing API binary at ${apiSrc} (run cargo build --release --bin api first)`,
    );
    process.exit(1);
  }

  mkdirSync(join(runtimeRoot, "bin"), { recursive: true });
  cpSync(apiSrc, join(runtimeRoot, "bin", `api${binExt}`));
  if (existsSync(cliSrc)) {
    cpSync(cliSrc, join(runtimeRoot, "bin", `atmos${binExt}`));
  }

  if (existsSync(webSrc)) {
    rmSync(join(runtimeRoot, "web"), { recursive: true, force: true });
    cpSync(webSrc, join(runtimeRoot, "web"), { recursive: true });
  } else {
    mkdirSync(join(runtimeRoot, "web"), { recursive: true });
  }

  if (existsSync(skillsSrc)) {
    rmSync(join(runtimeRoot, "system-skills"), { recursive: true, force: true });
    cpSync(skillsSrc, join(runtimeRoot, "system-skills"), { recursive: true });
  }

  const cargoToml = join(rootDir, "apps/desktop/src-tauri/Cargo.toml");
  if (existsSync(cargoToml)) {
    const match = readFileSync(cargoToml, "utf8").match(/^version\s*=\s*"([^"]+)"/m);
    if (match?.[1]) {
      writeFileSync(join(runtimeRoot, "version.txt"), `${match[1]}\n`, "utf8");
    }
  }

  console.log(`✅ Runtime bundle: ${runtimeRoot}`);
}

function parseArgs(argv) {
  const positional = [];
  let rootDir = "";
  let targetTriple = "";
  let binExt = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      rootDir = argv[++i] ?? "";
    } else if (arg === "--target") {
      targetTriple = argv[++i] ?? "";
    } else if (arg === "--bin-ext") {
      binExt = argv[++i] ?? "";
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (!rootDir && positional[0]) rootDir = positional[0];
  if (!targetTriple && positional[1]) targetTriple = positional[1];
  if (binExt === "" && positional[2] !== undefined) binExt = positional[2];

  return { rootDir, targetTriple, binExt };
}

import { fileURLToPath } from "node:url";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const { rootDir, targetTriple, binExt } = parseArgs(process.argv.slice(2));
  if (!rootDir || !targetTriple) {
    console.error(
      "Usage: node layout-runtime-bundle.mjs <rootDir> <targetTriple> [binExt]",
    );
    console.error(
      "   or: node layout-runtime-bundle.mjs --root <dir> --target <triple> [--bin-ext .exe]",
    );
    process.exit(1);
  }
  layoutRuntimeBundle(rootDir, targetTriple, binExt);
}
