/**
 * electron-builder afterPack: inject macOS 26 Liquid Glass Assets.car.
 *
 * Why not mac.icon = *.icon?
 * electron-builder 26.x runs actool and then requires BOTH Assets.car and
 * Icon.icns. On Xcode 26.3, actool only emits Assets.car for .icon packages,
 * so the stock path throws ENOENT on Icon.icns (or fails earlier on bad
 * icon.json/SVG). We keep CFBundleIconFile → icon.icns (legacy) and inject
 * Assets.car + CFBundleIconName ourselves when actool ≥ 26 is available.
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
const { spawnSync } = require("node:child_process");
const {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const ICON_COMPOSER = "resources/icons/icon.icon";

function checkActool26() {
  const r = spawnSync("actool", ["--version"], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.error || r.status !== 0) {
    return { ok: false, reason: r.error?.message ?? `exit ${r.status}` };
  }
  const m =
    out.match(
      /short-bundle-version<\/key>\s*<string>([0-9]+(?:\.[0-9]+)*)<\/string>/i,
    ) ?? out.match(/short-bundle-version["\s:=]+([0-9]+(?:\.[0-9]+)*)/i);
  const version = m?.[1] ?? "";
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  if (!version || !Number.isFinite(major) || major < 26) {
    return { ok: false, reason: `actool ${version || "unknown"} < 26` };
  }
  return { ok: true, version };
}

function findAppBundle(appOutDir) {
  // release/mac-arm64/Atmos.app or release/mac/Atmos.app
  const direct = join(appOutDir, "Atmos.app");
  if (existsSync(direct)) return direct;
  try {
    const { readdirSync } = require("node:fs");
    for (const name of readdirSync(appOutDir)) {
      if (name.endsWith(".app")) return join(appOutDir, name);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function compileAssetsCar(iconPath) {
  const tmp = mkdtempSync(join(tmpdir(), "atmos-icon-compile-"));
  const staged = join(tmp, "Icon.icon");
  const outDir = join(tmp, "out");
  try {
    // Recursive copy of .icon package
    const { cpSync } = require("node:fs");
    cpSync(iconPath, staged, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    const r = spawnSync(
      "actool",
      [
        staged,
        "--compile",
        outDir,
        "--output-format",
        "human-readable-text",
        "--notices",
        "--warnings",
        "--errors",
        "--output-partial-info-plist",
        join(outDir, "assetcatalog_generated_info.plist"),
        "--app-icon",
        "Icon",
        "--include-all-app-icons",
        "--enable-on-demand-resources",
        "NO",
        "--development-region",
        "en",
        "--target-device",
        "mac",
        "--minimum-deployment-target",
        "26.0",
        "--platform",
        "macosx",
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const carPath = join(outDir, "Assets.car");
    if (!existsSync(carPath)) {
      return {
        ok: false,
        reason: `actool did not emit Assets.car\n${log.slice(0, 2000)}`,
      };
    }
    const car = readFileSync(carPath);
    return { ok: true, car, log };
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function setPlistIconName(plistPath, iconName) {
  // Prefer plutil for binary/xml plists
  const r = spawnSync(
    "plutil",
    ["-replace", "CFBundleIconName", "-string", iconName, plistPath],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    // insert if missing
    const r2 = spawnSync(
      "plutil",
      ["-insert", "CFBundleIconName", "-string", iconName, plistPath],
      { encoding: "utf8" },
    );
    if (r2.status !== 0) {
      throw new Error(
        `failed to set CFBundleIconName: ${r.stderr || r2.stderr || r.stdout}`,
      );
    }
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appOutDir = context.appOutDir;
  const appPath = findAppBundle(appOutDir);
  if (!appPath) {
    console.warn(`[after-pack-macos-icon] no .app under ${appOutDir}`);
    return;
  }

  const projectDir = context.packager?.projectDir ?? process.cwd();
  const iconPath = join(projectDir, ICON_COMPOSER);
  const requireGlass =
    process.env.ATMOS_ELECTRON_REQUIRE_LIQUID_GLASS === "1" ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true";
  const forceLegacy = process.env.ATMOS_ELECTRON_ICON_LEGACY === "1";

  if (forceLegacy) {
    console.log(
      "[after-pack-macos-icon] ATMOS_ELECTRON_ICON_LEGACY=1 — skip Assets.car",
    );
    return;
  }

  if (!existsSync(join(iconPath, "icon.json"))) {
    const msg = `[after-pack-macos-icon] missing ${ICON_COMPOSER}`;
    if (requireGlass) throw new Error(msg);
    console.warn(msg);
    return;
  }

  const actool = checkActool26();
  if (!actool.ok) {
    const msg = `[after-pack-macos-icon] actool unavailable: ${actool.reason}`;
    if (requireGlass) throw new Error(msg);
    console.warn(`${msg} — Dock may look small on macOS 26`);
    return;
  }

  console.log(
    `[after-pack-macos-icon] compiling Liquid Glass with actool ${actool.version}`,
  );
  const compiled = compileAssetsCar(iconPath);
  if (!compiled.ok) {
    const msg = `[after-pack-macos-icon] ${compiled.reason}`;
    if (requireGlass) throw new Error(msg);
    console.warn(msg);
    return;
  }

  const resources = join(appPath, "Contents/Resources");
  const plistPath = join(appPath, "Contents/Info.plist");
  writeFileSync(join(resources, "Assets.car"), compiled.car);
  // electron-builder uses "Icon" as the asset catalog app-icon name
  setPlistIconName(plistPath, "Icon");

  // Ensure legacy icns key remains (set by electron-builder from mac.icon)
  const fileCheck = spawnSync(
    "plutil",
    ["-extract", "CFBundleIconFile", "raw", "-o", "-", plistPath],
    { encoding: "utf8" },
  );
  console.log(
    `[after-pack-macos-icon] Assets.car ${compiled.car.byteLength} bytes; ` +
      `CFBundleIconName=Icon; CFBundleIconFile=${(fileCheck.stdout || "").trim() || "(unset)"}`,
  );
};
