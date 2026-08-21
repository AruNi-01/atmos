import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DMG_ICON_PLATE_INSET,
  hasIconComposerPackage,
  ICON_COMPOSER_REL,
  ICON_DMG_ICNS_REL,
  ICON_ICNS_REL,
} from "./macos-icon.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("macos Liquid Glass icon packaging helpers", () => {
  it("keeps Icon Composer package in resources/icons", () => {
    expect(hasIconComposerPackage(appRoot)).toBe(true);
    expect(existsSync(join(appRoot, ICON_COMPOSER_REL, "icon.json"))).toBe(
      true,
    );
    expect(
      existsSync(join(appRoot, ICON_COMPOSER_REL, "Assets", "Logo.png")),
    ).toBe(true);
    expect(
      existsSync(join(appRoot, ICON_COMPOSER_REL, "Assets", "Rim.png")),
    ).toBe(true);
    const iconJson = readFileSync(
      join(appRoot, ICON_COMPOSER_REL, "icon.json"),
      "utf8",
    );
    expect(iconJson).toContain("Rim.png");
  });

  it("keeps the Rim hairline continuous through all four squircle corners", () => {
    const rimPng = join(appRoot, ICON_COMPOSER_REL, "Assets", "Rim.png");
    expect(existsSync(rimPng)).toBe(true);
    const py = `
from PIL import Image
import math
im = Image.open(${JSON.stringify(rimPng)}).convert("RGBA")
w, h = im.size
assert w == h == 1024, (w, h)
cx = cy = w / 2
assert im.getpixel((int(cx), int(cy)))[3] == 0
radius = w * 0.223
pad = 8
stroke = 13
mid = radius - pad - stroke / 2
samples = []
corners = [
    (radius, radius, math.pi * 1.25),
    (w - radius, radius, math.pi * 1.75),
    (w - radius, h - radius, math.pi * 0.25),
    (radius, h - radius, math.pi * 0.75),
]
for ox, oy, ang in corners:
    px = int(round(ox + math.cos(ang) * mid))
    py = int(round(oy + math.sin(ang) * mid))
    alpha = im.getpixel((px, py))[3]
    samples.append((px, py, alpha))
    if alpha < 20:
        raise SystemExit(f"corner rim missing at {(px, py)} alpha={alpha}")
top = im.getpixel((int(cx), pad + stroke // 2))[3]
if top < 20:
    raise SystemExit(f"top edge rim missing alpha={top}")
print("ok", samples)
`;
    const result = spawnSync("python3", ["-c", py], { encoding: "utf8" });
    if (result.status !== 0) {
      const err = `${result.stderr || ""}${result.stdout || ""}`;
      if (/Pillow|PIL/.test(err)) {
        return;
      }
      throw new Error(err || `python3 exited ${result.status}`);
    }
    expect(result.stdout).toContain("ok");
  });

  it("keeps the inner mark large enough that the tile is not mostly padding", () => {
    const logoPng = join(appRoot, ICON_COMPOSER_REL, "Assets", "Logo.png");
    expect(existsSync(logoPng)).toBe(true);
    const py = `
from PIL import Image
im = Image.open(${JSON.stringify(logoPng)}).convert("RGBA")
bbox = im.getbbox()
assert bbox, "empty Logo.png"
l, t, r, b = bbox
w = r - l
assert w / im.width >= 0.84, (w, im.width, w / im.width)
print("ok", w / im.width)
`;
    const result = spawnSync("python3", ["-c", py], { encoding: "utf8" });
    if (result.status !== 0) {
      const err = `${result.stderr || ""}${result.stdout || ""}`;
      if (/Pillow|PIL/.test(err)) {
        return;
      }
      throw new Error(err || `python3 exited ${result.status}`);
    }
    expect(result.stdout).toContain("ok");
  });

  it("keeps legacy icns for DMG / older macOS when synced", () => {
    // icon.icns / dmg-icon.icns are gitignored locally and produced by
    // `bun run regen-legacy-icns` / `sync-icons`. CI smoke without a local
    // sync should not fail — Icon Composer package is the tracked source.
    const appIcns = join(appRoot, ICON_ICNS_REL);
    const dmgIcns = join(appRoot, ICON_DMG_ICNS_REL);
    if (!existsSync(appIcns)) {
      return;
    }
    expect(existsSync(appIcns)).toBe(true);
    expect(existsSync(dmgIcns)).toBe(true);
  });

  it("points electron-builder DMG volume icon at the padded icns", () => {
    const yml = readFileSync(join(appRoot, "electron-builder.yml"), "utf8");
    const dmg = yml.split("\ndmg:")[1] ?? "";
    expect(dmg).toContain("icon: resources/icons/dmg-icon.icns");
    expect(yml).toContain("icon: resources/icons/icon.icns");
  });

  it("keeps DMG icns inset so Finder desktop wells have margin", () => {
    const dmgIcns = join(repoRoot, "apps/desktop/src-tauri/icons/dmg-icon.icns");
    const appIcns = join(repoRoot, "apps/desktop/src-tauri/icons/icon.icns");
    if (!existsSync(dmgIcns) || !existsSync(appIcns)) {
      return;
    }
    const py = `
from PIL import Image
import subprocess, tempfile, os

def midline_inset(path):
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        out = tmp.name
    subprocess.check_call(
        ["sips", "-s", "format", "png", "-z", "1024", "1024", path, "--out", out],
        stdout=subprocess.DEVNULL,
    )
    im = Image.open(out).convert("RGBA")
    os.unlink(out)
    w, h = im.size
    mid = h // 2
    for x in range(w):
        if im.getpixel((x, mid))[3] > 16:
            return x / w
    raise SystemExit("no opaque pixels")

app = midline_inset(${JSON.stringify(appIcns)})
dmg = midline_inset(${JSON.stringify(dmgIcns)})
if app > 0.02:
    raise SystemExit(f"app icns should stay full-bleed, inset={app}")
lo = ${DMG_ICON_PLATE_INSET} - 0.02
hi = ${DMG_ICON_PLATE_INSET} + 0.02
if not (lo <= dmg <= hi):
    raise SystemExit(f"dmg icns inset {dmg} not in [{lo}, {hi}]")
print("ok", app, dmg)
`;
    const result = spawnSync("python3", ["-c", py], { encoding: "utf8" });
    if (result.status !== 0) {
      const err = `${result.stderr || ""}${result.stdout || ""}`;
      if (/Pillow|PIL|sips/.test(err)) {
        return;
      }
      throw new Error(err || `python3 exited ${result.status}`);
    }
    expect(result.stdout).toContain("ok");
  });

  it("keeps Desktop Use host + notification icons in lockstep with app icns", () => {
    const appIcns = join(appRoot, ICON_ICNS_REL);
    const hostIcns = join(
      repoRoot,
      "crates/desktop-use/assets/host-app-icon.icns",
    );
    const notificationPng = join(
      repoRoot,
      "apps/web/public/notification-icon.png",
    );
    const docsIconPng = join(repoRoot, "apps/docs/src/app/icon.png");
    const docsAppleIconPng = join(repoRoot, "apps/docs/src/app/apple-icon.png");
    const docsFaviconIco = join(repoRoot, "apps/docs/public/favicon.ico");
    expect(existsSync(hostIcns)).toBe(true);
    expect(existsSync(notificationPng)).toBe(true);
    expect(existsSync(docsIconPng)).toBe(true);
    expect(existsSync(docsAppleIconPng)).toBe(true);
    expect(existsSync(docsFaviconIco)).toBe(true);
    // When app icns is present (after sync-icons), it must match the host brand plate.
    if (!existsSync(appIcns)) {
      return;
    }
    expect(sha256(hostIcns)).toBe(sha256(appIcns));
  });
});
