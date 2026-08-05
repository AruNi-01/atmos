/**
 * Regenerate legacy icon.icns / icon.png for DMG volume + pre-Tahoe
 * from the Liquid Glass Logo.png (white plate + mark).
 *
 * Run when Logo art changes:
 *   bun run scripts/regen-legacy-icns.ts
 *
 * Requires: Python Pillow (optional — falls back to sips-only path if logo is
 * already a full plate), sips, iconutil. Prefer running on macOS.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");
const logoPath = join(appRoot, "resources/icons/icon.icon/Assets/Logo.png");
const electronIcons = join(appRoot, "resources/icons");
const tauriIcons = join(repoRoot, "apps/desktop/src-tauri/icons");

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout || r.status}`,
    );
  }
  return r;
}

function main() {
  if (process.platform !== "darwin") {
    console.warn("[regen-legacy-icns] macOS only — skip");
    return;
  }
  if (!existsSync(logoPath)) {
    throw new Error(`missing ${logoPath}`);
  }

  const tmp = mkdtempSync(join(tmpdir(), "atmos-regen-icns-"));
  try {
    const fullPng = join(tmp, "full-1024.png");
    // Compose white rounded plate + Logo for Finder/DMG (classic .icns cannot be Assets.car).
    // Logo.png is already drawn at product scale (disc ~84% of canvas, same as original SVG).
    // Do NOT shrink further — scale < 1 made DMG volume art look "one ring smaller"
    // than the .app icon shown inside the DMG window (Assets.car / full mark).
    const py = `
from PIL import Image, ImageDraw
logo = Image.open(${JSON.stringify(logoPath)}).convert("RGBA")
S = 1024
plate = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(plate)
r = int(S * 0.223)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=(255, 255, 255, 255))
# Full-bleed mark: Logo already has correct content margins for the plate.
lg = logo.resize((S, S), Image.Resampling.LANCZOS)
plate.alpha_composite(lg, (0, 0))
plate.save(${JSON.stringify(fullPng)})
print("ok")
`;
    const pr = spawnSync("python3", ["-c", py], { encoding: "utf8" });
    if (pr.status !== 0) {
      throw new Error(
        `compose failed (need pillow): ${pr.stderr || pr.stdout}`,
      );
    }

    const iconset = join(tmp, "Atmos.iconset");
    mkdirSync(iconset);
    const pairs: [number, string][] = [
      [16, "icon_16x16.png"],
      [32, "icon_16x16@2x.png"],
      [32, "icon_32x32.png"],
      [64, "icon_32x32@2x.png"],
      [128, "icon_128x128.png"],
      [256, "icon_128x128@2x.png"],
      [256, "icon_256x256.png"],
      [512, "icon_256x256@2x.png"],
      [512, "icon_512x512.png"],
      [1024, "icon_512x512@2x.png"],
    ];
    for (const [px, name] of pairs) {
      run("sips", ["-z", String(px), String(px), fullPng, "--out", join(iconset, name)]);
    }
    const icnsOut = join(tmp, "icon.icns");
    run("iconutil", ["-c", "icns", iconset, "-o", icnsOut]);

    mkdirSync(electronIcons, { recursive: true });
    copyFileSync(icnsOut, join(electronIcons, "icon.icns"));
    run("sips", [
      "-z",
      "512",
      "512",
      fullPng,
      "--out",
      join(electronIcons, "icon.png"),
    ]);
    run("sips", [
      "-z",
      "128",
      "128",
      fullPng,
      "--out",
      join(electronIcons, "128x128.png"),
    ]);
    run("sips", [
      "-z",
      "256",
      "256",
      fullPng,
      "--out",
      join(electronIcons, "128x128@2x.png"),
    ]);
    run("sips", [
      "-z",
      "32",
      "32",
      fullPng,
      "--out",
      join(electronIcons, "32x32.png"),
    ]);

    if (existsSync(tauriIcons)) {
      for (const name of [
        "icon.icns",
        "icon.png",
        "128x128.png",
        "128x128@2x.png",
        "32x32.png",
      ]) {
        copyFileSync(join(electronIcons, name), join(tauriIcons, name));
      }
      console.log(`[regen-legacy-icns] synced → ${tauriIcons}`);
    }

    console.log(
      `[regen-legacy-icns] wrote icon.icns + png sizes under ${electronIcons}`,
    );
    console.log(
      "[regen-legacy-icns] DMG volume + CFBundleIconFile use this icns; Tahoe app tile uses Assets.car from icon.icon",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
