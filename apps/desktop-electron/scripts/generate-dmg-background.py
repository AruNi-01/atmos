#!/usr/bin/env python3
"""Compose the macOS DMG backdrop: landscape + sharp arrow/caption + folder + chips.

  python3 scripts/generate-dmg-background.py /path/to/landscape.png

Finder still draws Atmos.app and the icon-name labels. This PNG paints the
surface, instruction, Applications folder glyph, and white chips under names.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources" / "dmg"
APPLICATIONS_ICON = OUT / "applications-folder.png"

W, H = 642, 406
ICON_APP = (95, 72)
ICON_APPLICATIONS = (367, 213)
ICON_SIZE = 128

ARROW_X, ARROW_Y = 242, 105
ARROW_WIDTH = 165
ARROW_THICKNESS = 4
ARROW_ROTATION_DEG = 34
ARROW_COLOR = (0x60, 0x60, 0x60, 255)

TEXT = "Drag to Applications to install"
TEXT_X, TEXT_Y = 355, 72
TEXT_SIZE = 19
TEXT_COLOR = (0x2F, 0x2F, 0x2F, 255)
TEXT_FONT = (
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "/Library/Fonts/Georgia.ttf",
    "/System/Library/Fonts/Times.ttc",
)

LABEL_FONT_SIZE = 13
LABEL_PAD_X = 6
LABEL_PAD_Y = 2
LABEL_RADIUS = 4
LABEL_TOP = 137
LABEL_BG = (255, 255, 255, 0xE0)
LABEL_FONT = (
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
)
LABELS = (
    ("Atmos", ICON_APP),
    ("Applications", ICON_APPLICATIONS),
)


def cover_crop(im: Image.Image, aspect: float) -> Image.Image:
    w, h = im.size
    src_aspect = w / h
    if src_aspect > aspect:
        new_w = int(round(h * aspect))
        x0 = (w - new_w) // 2
        return im.crop((x0, 0, x0 + new_w, h))
    if src_aspect < aspect:
        new_h = int(round(w / aspect))
        y0 = (h - new_h) // 2
        return im.crop((0, y0, w, y0 + new_h))
    return im


def flatten(im: Image.Image) -> Image.Image:
    if im.mode == "RGB":
        return im
    if im.mode == "RGBA":
        alpha = im.getchannel("A")
        if alpha.getextrema() == (255, 255):
            return im.convert("RGB")
        bg = Image.new("RGB", im.size, (232, 232, 234))
        bg.paste(im, mask=alpha)
        return bg
    return im.convert("RGB")


def load_font(candidates: tuple[str, ...], size: int) -> ImageFont.ImageFont:
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def xform(x: float, y: float, scale: int) -> tuple[float, float]:
    rad = math.radians(ARROW_ROTATION_DEG)
    c, s = math.cos(rad), math.sin(rad)
    return (ARROW_X + x * c - y * s) * scale, (ARROW_Y + x * s + y * c) * scale


def qbezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    steps: int = 64,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        pts.append(
            (
                u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
            )
        )
    return pts


def draw_arrow(overlay: Image.Image, scale: int) -> None:
    n = ARROW_WIDTH
    left, right = -n / 2, n / 2
    hyp = math.hypot(right, 30)
    ax, oy = right / hyp, 30 / hyp
    head = min(18, 0.3 * n)
    wing = min(12, 0.2 * n)
    ux, uy = right - ax * head, -oy * head

    def pt(x: float, y: float) -> tuple[int, int]:
        px, py = xform(x, y, scale)
        return round(px), round(py)

    draw = ImageDraw.Draw(overlay)
    width = max(1, round(ARROW_THICKNESS * scale))
    draw.line(
        [pt(x, y) for x, y in qbezier((left, 15), (0, -30), (right, 0))],
        fill=ARROW_COLOR,
        width=width,
        joint="curve",
    )
    draw.line(
        [
            pt(ux - oy * wing, uy + ax * wing),
            pt(right, 0),
            pt(ux + oy * wing, uy - ax * wing),
        ],
        fill=ARROW_COLOR,
        width=width,
        joint="curve",
    )


def draw_caption(overlay: Image.Image, scale: int) -> None:
    font = load_font(TEXT_FONT, TEXT_SIZE * scale)
    ImageDraw.Draw(overlay).text(
        (TEXT_X * scale, TEXT_Y * scale),
        TEXT,
        font=font,
        fill=TEXT_COLOR,
        anchor="mm",
    )


def draw_label_chips(overlay: Image.Image, scale: int) -> None:
    font = load_font(LABEL_FONT, LABEL_FONT_SIZE * scale)
    draw = ImageDraw.Draw(overlay)
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    for name, (cx, cy) in LABELS:
        bbox = probe.textbbox((0, 0), name, font=font)
        chip_w = (bbox[2] - bbox[0]) + 2 * LABEL_PAD_X * scale
        chip_h = LABEL_FONT_SIZE * scale + 2 * LABEL_PAD_Y * scale
        x0 = cx * scale - chip_w / 2
        y0 = (cy - ICON_SIZE / 2 + LABEL_TOP) * scale
        draw.rounded_rectangle(
            [x0, y0, x0 + chip_w, y0 + chip_h],
            radius=LABEL_RADIUS * scale,
            fill=LABEL_BG,
        )


def draw_applications_icon(overlay: Image.Image, scale: int) -> None:
    if not APPLICATIONS_ICON.is_file():
        raise SystemExit(f"missing {APPLICATIONS_ICON}")
    icon = Image.open(APPLICATIONS_ICON).convert("RGBA")
    size = ICON_SIZE * scale
    icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    cx, cy = ICON_APPLICATIONS
    overlay.alpha_composite(icon, (cx * scale - size // 2, cy * scale - size // 2))


def compose(base: Image.Image, scale: int) -> Image.Image:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw_label_chips(overlay, scale)
    draw_applications_icon(overlay, scale)
    draw_arrow(overlay, scale)
    draw_caption(overlay, scale)
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def main() -> None:
    if len(sys.argv) != 2:
        print(
            "usage: python3 scripts/generate-dmg-background.py /path/to/landscape.png",
            file=sys.stderr,
        )
        sys.exit(2)
    src = Path(sys.argv[1]).expanduser().resolve()
    if not src.is_file():
        print(f"missing source image: {src}", file=sys.stderr)
        sys.exit(1)

    cropped = cover_crop(flatten(Image.open(src)), W / H)
    OUT.mkdir(parents=True, exist_ok=True)
    for scale, name in ((1, "background.png"), (2, "background@2x.png")):
        out = compose(
            cropped.resize((W * scale, H * scale), Image.Resampling.LANCZOS),
            scale,
        ).convert("RGB")
        path = OUT / name
        out.save(path, "PNG", optimize=True, compress_level=9)
        print(f"wrote {path.relative_to(ROOT)} {out.size[0]}×{out.size[1]}")


if __name__ == "__main__":
    main()
