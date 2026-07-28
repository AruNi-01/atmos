/**
 * macOS dev branding: stock `Electron.app` always shows name/icon "Electron" in
 * Dock / Stage Manager because CFBundle* comes from the .app bundle, not
 * app.setName() / dock.setIcon(). Stage a private copy with Atmos branding.
 *
 * Returns the path to the executable to spawn (may be the stock electron on
 * non-darwin).
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appRoot, "package.json"));

const PRODUCT_NAME = "Atmos";
const DEV_BUNDLE_ID = "com.atmos.desktop.dev";

function resolveElectronBinary(): string {
  const bin = require("electron") as string;
  if (!bin || !existsSync(bin)) {
    throw new Error("Electron binary missing — run bun install / ensure-electron");
  }
  return bin;
}

function resolveIconIcns(): string | null {
  const candidates = [
    join(appRoot, "resources/icons/icon.icns"),
    join(appRoot, "../desktop/src-tauri/icons/icon.icns"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Stage branded Electron.app under .cache/dev-app and return its MacOS/Electron.
 */
function stageDarwinDevApp(electronBin: string): string {
  // .../Electron.app/Contents/MacOS/Electron → .../Electron.app
  const srcApp = join(dirname(electronBin), "..", "..");
  if (!existsSync(join(srcApp, "Contents", "Info.plist"))) {
    console.warn(
      `[prepare-dev-app] unexpected electron layout (${electronBin}); using stock binary`,
    );
    return electronBin;
  }

  const stageRoot = join(appRoot, ".cache/dev-app");
  const destApp = join(stageRoot, `${PRODUCT_NAME}.app`);
  const markerPath = join(stageRoot, "source-electron.txt");
  const iconPath = resolveIconIcns();

  const markerWanted = `${electronBin}\n${iconPath ?? ""}\n${PRODUCT_NAME}\n${DEV_BUNDLE_ID}\n`;
  const markerHave = existsSync(markerPath)
    ? readFileSync(markerPath, "utf8")
    : "";
  const appPresent = existsSync(
    join(destApp, "Contents/MacOS/Electron"),
  );

  if (!appPresent || markerHave !== markerWanted) {
    console.log(`[prepare-dev-app] staging branded app → ${destApp}`);
    mkdirSync(stageRoot, { recursive: true });
    rmSync(destApp, { recursive: true, force: true });
    cpSync(srcApp, destApp, { recursive: true });
  }

  const plist = join(destApp, "Contents/Info.plist");
  if (!existsSync(plist)) {
    console.warn("[prepare-dev-app] Info.plist missing; using stock electron");
    return electronBin;
  }

  const plutilReplace = (key: string, value: string) => {
    execFileSync(
      "plutil",
      ["-replace", key, "-string", value, plist],
      { stdio: "pipe" },
    );
  };

  try {
    plutilReplace("CFBundleName", PRODUCT_NAME);
    plutilReplace("CFBundleDisplayName", PRODUCT_NAME);
    plutilReplace("CFBundleIdentifier", DEV_BUNDLE_ID);
  } catch (e) {
    console.warn("[prepare-dev-app] plutil patch failed", e);
  }

  if (iconPath) {
    try {
      cpSync(iconPath, join(destApp, "Contents/Resources/electron.icns"));
    } catch (e) {
      console.warn("[prepare-dev-app] copy icns failed", e);
    }
  } else {
    console.warn(
      "[prepare-dev-app] icon.icns missing — run bun run sync-icons",
    );
  }

  // Drop quarantine so a copied .app launches without Gatekeeper prompts.
  try {
    execFileSync("xattr", ["-cr", destApp], { stdio: "pipe" });
  } catch {
    /* ignore */
  }

  writeFileSync(markerPath, markerWanted, "utf8");
  const stagedBin = join(destApp, "Contents/MacOS/Electron");
  if (!existsSync(stagedBin)) {
    console.warn("[prepare-dev-app] staged binary missing; using stock");
    return electronBin;
  }
  console.log(
    `[prepare-dev-app] ready: ${PRODUCT_NAME} (${DEV_BUNDLE_ID})`,
  );
  return stagedBin;
}

export function resolveDevElectronBinary(): string {
  const stock = resolveElectronBinary();
  if (process.platform !== "darwin") {
    return stock;
  }
  try {
    return stageDarwinDevApp(stock);
  } catch (e) {
    console.warn("[prepare-dev-app] staging failed; using stock electron", e);
    return stock;
  }
}

// CLI: bun run scripts/prepare-dev-app.ts
if (import.meta.main) {
  const bin = resolveDevElectronBinary();
  console.log(bin);
}
