import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasIconComposerPackage,
  ICON_COMPOSER_REL,
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
    // icon.icns is gitignored and produced by `bun run sync-icons` / packaging.
    // CI smoke without a local sync should not fail — Icon Composer package is the tracked source.
    const appIcns = join(appRoot, ICON_ICNS_REL);
    if (!existsSync(appIcns)) {
      return;
    }
    expect(existsSync(appIcns)).toBe(true);
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
    expect(existsSync(hostIcns)).toBe(true);
    expect(existsSync(notificationPng)).toBe(true);
    // When app icns is present (after sync-icons), it must match the host brand plate.
    if (!existsSync(appIcns)) {
      return;
    }
    expect(sha256(hostIcns)).toBe(sha256(appIcns));
  });
});
