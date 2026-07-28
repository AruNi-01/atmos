#!/usr/bin/env python3
"""Minimal DMG backdrop: plain surface, slogan only (no Atmos title, no art).

  python3 scripts/generate-dmg-background.py

Keep ICON_* / W / H in sync with electron-builder.yml dmg.* .
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources" / "dmg"

W, H = 540, 380
ICON_Y = 170
ICON_L = 148
ICON_R = 392

SLOGAN = "Atmosphere for Agentic Builders"


def load_font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    # Prefer Helvetica Neue for both weights so slogan + caption share one family.
    # (Mixing SFNS regular with Helvetica Neue bold made the bottom line look off.)
    if bold:
        cands = (
            ("/System/Library/Fonts/HelveticaNeue.ttc", 1),  # Bold
            ("/System/Library/Fonts/Helvetica.ttc", 1),
            ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0),
        )
    else:
        cands = (
            ("/System/Library/Fonts/HelveticaNeue.ttc", 0),  # Regular
            ("/System/Library/Fonts/Helvetica.ttc", 0),
            ("/System/Library/Fonts/Supplemental/Arial.ttf", 0),
        )
    for path, idx in cands:
        try:
            return ImageFont.truetype(path, size=size, index=idx)
        except OSError:
            continue
    return ImageFont.load_default()


def text_w(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0]


def text_h(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    b = draw.textbbox((0, 0), text, font=font)
    return b[3] - b[1]


def draw_solid_arrow(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: int) -> None:
    s = scale
    shaft_w = int(30 * s)
    shaft_h = int(11 * s)
    head_w = int(17 * s)
    head_h = int(22 * s)
    color = (24, 24, 27, 255)
    total_w = shaft_w + head_w
    x0 = cx - total_w // 2
    x_join = x0 + shaft_w
    tip_x = x0 + total_w
    draw.polygon(
        [
            (x0, cy - shaft_h // 2),
            (x_join, cy - shaft_h // 2),
            (x_join, cy - head_h // 2),
            (tip_x, cy),
            (x_join, cy + head_h // 2),
            (x_join, cy + shaft_h // 2),
            (x0, cy + shaft_h // 2),
        ],
        fill=color,
    )


def compose(scale: int) -> Image.Image:
    w, h = W * scale, H * scale
    s = scale

    # Flat classic DMG gray (no decorative atmosphere)
    img = Image.new("RGB", (w, h), (232, 232, 234))
    draw = ImageDraw.Draw(img.convert("RGBA") if False else img)
    # slight vertical wash so it doesn't look poster-board flat
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        v = int(238 - 12 * t)
        for x in range(w):
            px[x, y] = (v, v, v + 1 if v < 254 else v)

    layer = img.convert("RGBA")
    draw = ImageDraw.Draw(layer)

    # Same family for slogan + caption (Helvetica Neue); slogan is bold.
    slogan_font = load_font(int(14 * s), bold=True)
    cap_font = load_font(int(13 * s), bold=False)
    cap_bold = load_font(int(13 * s), bold=True)
    ink = (40, 40, 44, 245)
    muted = (90, 90, 98, 230)

    # Slogan only at top (no Atmos wordmark)
    sw = text_w(draw, SLOGAN, slogan_font)
    sh = text_h(draw, SLOGAN, slogan_font)
    draw.text(((w - sw) // 2, int(48 * s)), SLOGAN, font=slogan_font, fill=muted)

    draw_solid_arrow(draw, w // 2, ICON_Y * s, s)

    # Bottom install caption
    parts = [
        ("Drag ", cap_font, ink),
        ("Atmos", cap_bold, ink),
        (" to Applications to install", cap_font, ink),
    ]
    widths = [text_w(draw, t, f) for t, f, _ in parts]
    x = (w - sum(widths)) // 2
    y = int(310 * s)
    for (t, f, fill), ww in zip(parts, widths):
        draw.text((x, y), t, font=f, fill=fill)
        x += ww

    return layer.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for scale, name in ((1, "background.png"), (2, "background@2x.png")):
        img = compose(scale)
        path = OUT / name
        img.save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(ROOT)} {img.size[0]}×{img.size[1]}")


if __name__ == "__main__":
    main()
