/**
 * Lay out Desktop / shared local runtime: binaries/runtime/current/{bin,web,system-skills}
 * Cross-platform (Windows-safe); replaces sourcing layout-runtime-bundle.sh from Node.
 */

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Recursively copy a tree, materializing symlinks as real files/directories.
 *
 * Node's `cpSync({ dereference: true })` still preserves symlink inodes on some
 * platforms. electron-builder/7zip on Windows then fails NSIS packaging with
 * "WARNING: The directory name is invalid" on paths like
 * `system-skills/.../atmos-review-cli.md\` (git symlinks under skills/).
 */
function copyTreeDereferenced(src, dest) {
  let st;
  try {
    st = lstatSync(src);
  } catch {
    return;
  }

  if (st.isSymbolicLink()) {
    let target;
    try {
      target = realpathSync(src);
    } catch {
      // Broken link (common on Windows without symlink privilege) — skip.
      console.warn(`Warning: skipping broken symlink: ${src}`);
      return;
    }
    let targetSt;
    try {
      targetSt = statSync(target);
    } catch {
      console.warn(`Warning: skipping unreadable symlink target: ${src} -> ${target}`);
      return;
    }
    if (targetSt.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      for (const name of readdirSync(target)) {
        copyTreeDereferenced(join(target, name), join(dest, name));
      }
    } else {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(target, dest);
    }
    return;
  }

  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) {
      copyTreeDereferenced(join(src, name), join(dest, name));
    }
    return;
  }

  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function prepareSystemSkillsBundle(rootDir, binariesDir) {
  const skillsSrc = join(rootDir, "skills");
  const bundledSkills = join(binariesDir, "system-skills");

  rmSync(bundledSkills, { recursive: true, force: true });
  if (existsSync(skillsSrc)) {
    copyTreeDereferenced(skillsSrc, bundledSkills);
    console.log(`✅ Bundled system skills: ${bundledSkills}`);
  } else {
    mkdirSync(bundledSkills, { recursive: true });
    console.warn(
      `Warning: ${skillsSrc} not found, created empty bundled system skills directory`,
    );
  }
}

export function layoutRuntimeBundle(rootDir, targetTriple, binExt = "") {
  const binariesDir = join(rootDir, "apps/desktop/src-tauri/binaries");
  const runtimeRoot = join(binariesDir, "runtime/current");

  let apiSrc = join(rootDir, `target/${targetTriple}/release/api${binExt}`);
  if (!existsSync(apiSrc)) {
    apiSrc = join(rootDir, `target/${targetTriple}/debug/api${binExt}`);
  }

  const webSrc = join(binariesDir, "web-out");
  const skillsSrc = join(binariesDir, "system-skills");

  if (!existsSync(apiSrc)) {
    console.error(
      `error: missing built Atmos Server source binary at ${apiSrc} (run cargo build --release --bin api first)`,
    );
    process.exit(1);
  }

  mkdirSync(join(runtimeRoot, "bin"), { recursive: true });
  rmSync(join(runtimeRoot, "bin", `api${binExt}`), { force: true });
  rmSync(join(runtimeRoot, "bin", `atmos-api${binExt}`), { force: true });
  rmSync(join(runtimeRoot, "bin", `Atmos Server${binExt}`), { force: true });
  copyFileSync(apiSrc, join(runtimeRoot, "bin", `Atmos Server${binExt}`));

  // CLI is never bundled (ADR-005): sole install is ~/.atmos/bin/atmos via
  // install scripts / API self-heal / Settings → About. Remove any stale copy.
  rmSync(join(runtimeRoot, "bin", `atmos${binExt}`), { force: true });

  if (existsSync(webSrc)) {
    rmSync(join(runtimeRoot, "web"), { recursive: true, force: true });
    copyTreeDereferenced(webSrc, join(runtimeRoot, "web"));
  } else {
    mkdirSync(join(runtimeRoot, "web"), { recursive: true });
  }

  prepareSystemSkillsBundle(rootDir, binariesDir);
  if (existsSync(skillsSrc)) {
    rmSync(join(runtimeRoot, "system-skills"), { recursive: true, force: true });
    copyTreeDereferenced(skillsSrc, join(runtimeRoot, "system-skills"));
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
