/**
 * Regenerate **all** classic brand icon surfaces from Liquid Glass Logo.png.
 *
 * Single source of truth for non–Assets.car art so Dock/DMG/notifications/
 * Desktop Use host never drift:
 *
 *   resources/icons/icon.icon/Assets/Logo.png
 *     → electron + Tauri: icon.icns, icon.png, size PNGs
 *     → crates/desktop-use/assets/host-app-icon.icns  (TCC host / Settings)
 *     → apps/web/public/notification-icon.png         (notification content)
 *
 * Run when Logo art changes:
 *   bun run scripts/regen-legacy-icns.ts
 *   # or: bun run regen-legacy-icns
 *
 * Requires: Python Pillow, sips, iconutil. macOS only.
 *
 * Liquid Glass (Tahoe Dock for Atmos.app) still comes from packaging:
 *   afterPack compiles icon.icon → Assets.car
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");
const logoPath = join(appRoot, "resources/icons/icon.icon/Assets/Logo.png");
const rimPath = join(appRoot, "resources/icons/icon.icon/Assets/Rim.png");
const electronIcons = join(appRoot, "resources/icons");
const tauriIcons = join(repoRoot, "apps/desktop/src-tauri/icons");
const hostAppIcon = join(
  repoRoot,
  "crates/desktop-use/assets/host-app-icon.icns",
);
const notificationIcon = join(
  repoRoot,
  "apps/web/public/notification-icon.png",
);

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout || r.status}`,
    );
  }
  return r;
}

function composeBrandArt(fullPng: string) {
  // Black rounded plate + hairline rim + white Logo mark.
  // Classic .icns / PNG cannot be Assets.car — bake the squircle so DMG /
  // Windows / notifications are not a sharp square. Also writes Rim.png for
  // the Liquid Glass package (system still masks the fill; the rim layer
  // keeps the tile from dissolving into a dark Dock, like Cursor).
  // Logo.png stays the mark on transparent — no inner disc.
  const py = `
from PIL import Image, ImageChops, ImageDraw

S = 1024
SCALE = 4
SS = S * SCALE
RADIUS = 0.223
STROKE = 13 * SCALE
PAD = 8 * SCALE
RIM = (232, 232, 235, 108)

# Pillow's rounded_rectangle(outline=...) only paints the four straight
# edges — the corner arcs are missing. Fill an outer squircle and punch
# an inner one so the hairline is continuous around all four corners.

def squircle_ring(size, radius, inset, width, fill):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    outer = [inset, inset, size - 1 - inset, size - 1 - inset]
    inner_inset = inset + width
    inner = [inner_inset, inner_inset, size - 1 - inner_inset, size - 1 - inner_inset]
    draw.rounded_rectangle(outer, radius=max(1, radius - inset), fill=fill)
    hole = Image.new("L", (size, size), 0)
    ImageDraw.Draw(hole).rounded_rectangle(
        inner,
        radius=max(1, radius - inner_inset),
        fill=255,
    )
    r_ch, g_ch, b_ch, a_ch = img.split()
    return Image.merge("RGBA", (r_ch, g_ch, b_ch, ImageChops.subtract(a_ch, hole)))

logo = Image.open(${JSON.stringify(logoPath)}).convert("RGBA")

hi = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
d = ImageDraw.Draw(hi)
r = int(SS * RADIUS)
d.rounded_rectangle([0, 0, SS - 1, SS - 1], radius=r, fill=(0, 0, 0, 255))
ring = squircle_ring(SS, r, PAD, STROKE, RIM)
hi.alpha_composite(ring)
plate = hi.resize((S, S), Image.Resampling.LANCZOS)
lg = logo.resize((S, S), Image.Resampling.LANCZOS)
plate.alpha_composite(lg, (0, 0))
plate.save(${JSON.stringify(fullPng)})

rim = ring.resize((S, S), Image.Resampling.LANCZOS)
rim.save(${JSON.stringify(rimPath)})
print("ok")
`;
  const pr = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (pr.status !== 0) {
    throw new Error(
      `compose failed (need pillow): ${pr.stderr || pr.stdout}`,
    );
  }
}

function writeIco(fullPng: string, icoOut: string) {
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(fullPng)}).convert("RGBA")
im.save(
    ${JSON.stringify(icoOut)},
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("ok")
`;
  const pr = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (pr.status !== 0) {
    throw new Error(`ico failed (need pillow): ${pr.stderr || pr.stdout}`);
  }
}

function buildIcns(fullPng: string, icnsOut: string, tmp: string) {
  const iconset = join(tmp, "Atmos.iconset");
  mkdirSync(iconset, { recursive: true });
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
    run("sips", [
      "-z",
      String(px),
      String(px),
      fullPng,
      "--out",
      join(iconset, name),
    ]);
  }
  run("iconutil", ["-c", "icns", iconset, "-o", icnsOut]);
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
    composeBrandArt(fullPng);

    const icnsOut = join(tmp, "icon.icns");
    buildIcns(fullPng, icnsOut, tmp);

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
    writeIco(fullPng, join(electronIcons, "icon.ico"));

    if (existsSync(tauriIcons)) {
      run("sips", [
        "-z",
        "64",
        "64",
        fullPng,
        "--out",
        join(tauriIcons, "64x64.png"),
      ]);
      for (const name of [
        "icon.icns",
        "icon.png",
        "icon.ico",
        "128x128.png",
        "128x128@2x.png",
        "32x32.png",
      ]) {
        copyFileSync(join(electronIcons, name), join(tauriIcons, name));
      }
      console.log(`[regen-legacy-icns] synced → ${tauriIcons}`);
    }

    // Desktop Use host (System Settings / Accessibility / Screen Recording)
    mkdirSync(dirname(hostAppIcon), { recursive: true });
    copyFileSync(icnsOut, hostAppIcon);
    console.log(`[regen-legacy-icns] host → ${hostAppIcon}`);

    // Default notification content icon (left side of banner)
    mkdirSync(dirname(notificationIcon), { recursive: true });
    run("sips", [
      "-z",
      "256",
      "256",
      fullPng,
      "--out",
      notificationIcon,
    ]);
    console.log(`[regen-legacy-icns] notification → ${notificationIcon}`);

    console.log(
      `[regen-legacy-icns] wrote icon.icns + png sizes under ${electronIcons}`,
    );
    console.log(
      "[regen-legacy-icns] surfaces: Electron/Tauri app+DMG, Desktop Use host, web notification-icon.png, icon.icon/Assets/Rim.png",
    );
    console.log(
      "[regen-legacy-icns] Tahoe Atmos.app Dock still uses Assets.car from icon.icon (afterPack)",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
