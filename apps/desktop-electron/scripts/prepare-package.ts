/**
 * Stage Atmos Server + web static + skills into resources/runtime/current
 * for electron-builder extraResources (process.resourcesPath/runtime/current).
 * Also stages atmos-browser-cookies for packaged cookie import (no cargo),
 * and Desktop Use engine-manifest.json (pin authority for this Desktop build).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  PINNED_HELPER,
  PINNED_HELPER_TARBALL_SHA256,
  PINNED_HELPER_TARBALL_URL,
  PINNED_HELPER_VERSION,
} from "../src/simulator/pin.ts";
import {
  cookieHelperBinName,
  findCookieHelperBinary,
  listCookieHelperCandidates,
} from "../src/cookies/helper-resolve.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");
const require = createRequire(join(appRoot, "package.json"));

function packageVersion(): string {
  const pkg = require(join(appRoot, "package.json")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

function requireCookieHelper(): boolean {
  return (
    process.env.ATMOS_REQUIRE_COOKIE_HELPER === "1" ||
    process.env.CI === "true" ||
    process.env.CI === "1"
  );
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

  // Desktop Use pin authority for this Desktop build (APP-052 optimal design).
  // Runtime injects ATMOS_DESKTOP_USE_MANIFEST → process.resourcesPath/desktop-use/...
  const manifestSrc = join(
    repoRoot,
    "crates/desktop-use/manifest/default.json",
  );
  const manifestDestDir = join(appRoot, "resources/desktop-use");
  if (!existsSync(manifestSrc)) {
    throw new Error(
      `[prepare-package] missing engine manifest at ${manifestSrc}`,
    );
  }
  mkdirSync(manifestDestDir, { recursive: true });
  cpSync(manifestSrc, join(manifestDestDir, "engine-manifest.json"));
  console.log(
    `[prepare-package] staged engine-manifest.json → ${manifestDestDir}`,
  );

  // CLI floor for this Desktop build: min Atmos CLI version Desktop Use expects.
  // Binary is never bundled (ADR-005); only the version pin ships in the package.
  const cliCargo = join(repoRoot, "apps/cli/Cargo.toml");
  const cliCargoText = existsSync(cliCargo)
    ? readFileSync(cliCargo, "utf8")
    : "";
  const cliVersionMatch = cliCargoText.match(
    /^version\s*=\s*"([^"]+)"/m,
  );
  const minCliVersion =
    cliVersionMatch?.[1]?.trim() ||
    (() => {
      const fallback = join(
        repoRoot,
        "crates/desktop-use/manifest/cli-requirement.json",
      );
      if (existsSync(fallback)) {
        try {
          const j = JSON.parse(readFileSync(fallback, "utf8")) as {
            min_cli_version?: string;
          };
          return j.min_cli_version?.trim() || "";
        } catch {
          return "";
        }
      }
      return "";
    })();
  if (!minCliVersion) {
    throw new Error(
      `[prepare-package] cannot determine min CLI version (apps/cli/Cargo.toml or cli-requirement.json)`,
    );
  }
  const cliReq = {
    schema_version: 1,
    min_cli_version: minCliVersion,
  };
  writeFileSync(
    join(manifestDestDir, "cli-requirement.json"),
    `${JSON.stringify(cliReq, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `[prepare-package] staged cli-requirement.json min_cli_version=${minCliVersion}`,
  );

  // CLI is never staged into the Desktop package (ADR-005). Sole install path
  // is ~/.atmos/bin/atmos — managed by installers / API self-heal / Settings.
  const atmosName = process.platform === "win32" ? "atmos.exe" : "atmos";
  const runtimeAtmos = join(destRuntime, "bin", atmosName);
  if (existsSync(runtimeAtmos)) {
    rmSync(runtimeAtmos, { force: true });
    console.log(
      `[prepare-package] removed staged atmos CLI (use ~/.atmos/bin only)`,
    );
  }

  // Native dual-shift dylib (macOS CGEventTap on dedicated thread).
  if (process.platform === "darwin") {
    const buildNative = spawnSync(
      process.execPath,
      [join(appRoot, "scripts/build-appshot-shift-native.ts")],
      { cwd: appRoot, stdio: "inherit", encoding: "utf8" },
    );
    if (buildNative.status !== 0) {
      throw new Error(
        `[prepare-package] build-appshot-shift-native failed status=${buildNative.status}`,
      );
    }
  }

  // Stage atmos-browser-cookies helper for packaged cookie import (no cargo).
  // Looks at host target/release AND target/<triple>/release (CI --target).
  const helperName = cookieHelperBinName();
  const helperSrc = findCookieHelperBinary({
    repoRoot,
    binName: helperName,
    packageResourcesBin: join(appRoot, "resources/bin"),
  });
  const helperDestDir = join(appRoot, "resources/bin");
  if (helperSrc) {
    mkdirSync(helperDestDir, { recursive: true });
    const dest = join(helperDestDir, helperName);
    // Avoid no-op copy when source is already dest
    if (helperSrc.path !== dest) {
      cpSync(helperSrc.path, dest);
    }
    console.log(
      `[prepare-package] staged cookie helper → ${dest} (from ${helperSrc.source})`,
    );
  } else {
    const tried = listCookieHelperCandidates({
      repoRoot,
      binName: helperName,
    })
      .slice(0, 12)
      .map((c) => c.path)
      .join("\n  ");
    const msg =
      `[prepare-package] atmos-browser-cookies not found.\n` +
      `  Build: cargo build --release -p browser-cookies --bin atmos-browser-cookies` +
      ` [--target <triple>]\n` +
      `  Looked under:\n  ${tried}`;
    if (requireCookieHelper()) {
      throw new Error(msg);
    }
    console.warn(msg);
  }

  stageSimulatorHelper();
}

function stageSimulatorHelper() {
  if (process.platform !== "darwin") {
    console.log("[prepare-package] skip simulator helper (not darwin)");
    return;
  }

  const destRoot = join(appRoot, "resources/simulator-helper");
  const destPayload = join(destRoot, "serve-sim");
  mkdirSync(destRoot, { recursive: true });

  const tmpTar = join(destRoot, "serve-sim.tgz");
  const fetch = spawnSync("curl", ["-fsSL", PINNED_HELPER_TARBALL_URL, "-o", tmpTar], {
    encoding: "utf8",
  });
  if (fetch.status !== 0) {
    throw new Error(
      `[prepare-package] failed to fetch ${PINNED_HELPER}@${PINNED_HELPER_VERSION}: ${fetch.stderr}`,
    );
  }

  const digest = createHash("sha256").update(readFileSync(tmpTar)).digest("hex");
  if (digest !== PINNED_HELPER_TARBALL_SHA256) {
    rmSync(tmpTar, { force: true });
    throw new Error(
      `[prepare-package] simulator helper sha256 mismatch: got ${digest}, expected ${PINNED_HELPER_TARBALL_SHA256}`,
    );
  }

  rmSync(destPayload, { recursive: true, force: true });
  mkdirSync(destPayload, { recursive: true });
  const extract = spawnSync(
    "tar",
    ["-xzf", tmpTar, "-C", destPayload, "--strip-components=1"],
    { encoding: "utf8" },
  );
  rmSync(tmpTar, { force: true });
  if (extract.status !== 0) {
    throw new Error(
      `[prepare-package] failed to extract simulator helper: ${extract.stderr}`,
    );
  }

  const manifest = {
    helper: PINNED_HELPER,
    version: PINNED_HELPER_VERSION,
    tarball_sha256: PINNED_HELPER_TARBALL_SHA256,
    requires: { os: "darwin", arch: "arm64", minos: "14.0" },
  };
  writeFileSync(
    join(destRoot, "helper-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `[prepare-package] staged ${PINNED_HELPER}@${PINNED_HELPER_VERSION} → ${destPayload}`,
  );
}

main();
