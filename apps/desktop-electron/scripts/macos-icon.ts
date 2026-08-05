/**
 * macOS 26+ Liquid Glass icon helpers.
 *
 * electron-builder compiles `icon.icon` (Icon Composer package) via `actool`
 * into Assets.car + legacy Icon.icns when Xcode 26+ is installed.
 *
 * - Tahoe / macOS 26+: Assets.car + CFBundleIconName
 * - Older macOS: CFBundleIconFile → icon.icns
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ICON_COMPOSER_REL = "resources/icons/icon.icon";
export const ICON_ICNS_REL = "resources/icons/icon.icns";

export type ActoolStatus =
  | { ok: true; version: string }
  | { ok: false; reason: string };

/**
 * Require actool ≥ 26.0 (Xcode 26+) for Icon Composer compilation.
 */
export function checkActool26(): ActoolStatus {
  const r = spawnSync("actool", ["--version"], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.error) {
    return {
      ok: false,
      reason: `${r.error.message} (install full Xcode 26+, not only CLT)`,
    };
  }
  if (r.status !== 0) {
    return {
      ok: false,
      reason: `actool --version exited ${r.status ?? "null"} (install Xcode 26+)`,
    };
  }

  // actool prints a short plist. Prefer the short-bundle-version string.
  const m =
    out.match(
      /short-bundle-version<\/key>\s*<string>([0-9]+(?:\.[0-9]+)*)<\/string>/i,
    ) ?? out.match(/short-bundle-version["\s:=]+([0-9]+(?:\.[0-9]+)*)/i);
  const version = m?.[1] ?? "";
  if (!version) {
    return {
      ok: false,
      reason: "could not parse actool version (need Xcode 26+ actool)",
    };
  }
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  if (!Number.isFinite(major) || major < 26) {
    return {
      ok: false,
      reason: `actool ${version} < 26.0 (need Xcode 26+ for Liquid Glass .icon)`,
    };
  }
  return { ok: true, version };
}

export function hasIconComposerPackage(appRoot: string): boolean {
  const root = join(appRoot, ICON_COMPOSER_REL);
  return existsSync(join(root, "icon.json")) && existsSync(join(root, "Assets"));
}

/** Smoke: confirm a packaged .app has Tahoe Assets.car + CFBundleIconName. */
export function verifyPackagedMacIcon(appPath: string): {
  ok: boolean;
  details: string[];
} {
  const details: string[] = [];
  const resources = join(appPath, "Contents/Resources");
  const plistPath = join(appPath, "Contents/Info.plist");
  const car = join(resources, "Assets.car");
  const icns = join(resources, "icon.icns");

  if (!existsSync(plistPath)) {
    return { ok: false, details: [`missing Info.plist: ${plistPath}`] };
  }

  const name = spawnSync(
    "plutil",
    ["-extract", "CFBundleIconName", "raw", "-o", "-", plistPath],
    { encoding: "utf8" },
  );
  const file = spawnSync(
    "plutil",
    ["-extract", "CFBundleIconFile", "raw", "-o", "-", plistPath],
    { encoding: "utf8" },
  );
  // plutil -o - may write to stdout; some versions put value in stdout directly
  const iconName = (name.stdout ?? "").trim();
  const iconFile = (file.stdout ?? "").trim();

  if (iconName && !iconName.includes("error") && name.status === 0) {
    details.push(`CFBundleIconName=${iconName}`);
  } else {
    details.push("CFBundleIconName missing (Tahoe Liquid Glass inactive)");
  }
  if (iconFile && file.status === 0) {
    details.push(`CFBundleIconFile=${iconFile}`);
  } else {
    details.push("CFBundleIconFile missing");
  }

  if (existsSync(car)) {
    const size = readFileSync(car).byteLength;
    details.push(`Assets.car present (${size} bytes)`);
  } else {
    details.push("Assets.car missing");
  }
  if (existsSync(icns)) {
    details.push("icon.icns present");
  } else {
    details.push("icon.icns missing");
  }

  const hasName =
    Boolean(iconName) && name.status === 0 && !iconName.includes("error");
  const ok = hasName && existsSync(car) && existsSync(icns);
  return { ok, details };
}
