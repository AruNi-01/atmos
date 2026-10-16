#!/usr/bin/env python3
"""Exit 0 when a PNG is almost one color. Exit 1 when it has other pixels.

simctl's first framebuffer after a launch can be the preview background
with no transcript. Run 38843429024 kept those shots: F1-light was 97%
#f4f4f6 and F11-dark was 99% black. A real fixture in that run stayed
under 88% one color.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path


def _paeth(a: int, b: int, c: int) -> int:
    estimate = a + b - c
    da = abs(estimate - a)
    db = abs(estimate - b)
    dc = abs(estimate - c)
    if da <= db and da <= dc:
        return a
    if db <= dc:
        return b
    return c


def dominant_fraction(path: Path) -> float:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    pos = 8
    width = height = None
    color_type = None
    idat = bytearray()
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", chunk[:10])
            interlace = chunk[12]
            if bit_depth != 8 or color_type not in (2, 6) or interlace != 0:
                raise ValueError(f"unsupported PNG {bit_depth=} {color_type=} {interlace=}")
        elif kind == b"IDAT":
            idat.extend(chunk)
        elif kind == b"IEND":
            break
    if width is None or height is None or color_type is None:
        raise ValueError(f"{path} has no IHDR")
    channels = 3 if color_type == 2 else 4
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    rows = []
    cursor = 0
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        row = bytearray(raw[cursor : cursor + stride])
        cursor += stride
        prior = rows[-1] if rows else bytearray(stride)
        if filter_type == 1:
            for i in range(stride):
                left = row[i - channels] if i >= channels else 0
                row[i] = (row[i] + left) & 255
        elif filter_type == 2:
            for i in range(stride):
                row[i] = (row[i] + prior[i]) & 255
        elif filter_type == 3:
            for i in range(stride):
                left = row[i - channels] if i >= channels else 0
                row[i] = (row[i] + ((left + prior[i]) // 2)) & 255
        elif filter_type == 4:
            for i in range(stride):
                left = row[i - channels] if i >= channels else 0
                up_left = prior[i - channels] if i >= channels else 0
                row[i] = (row[i] + _paeth(left, prior[i], up_left)) & 255
        elif filter_type != 0:
            raise ValueError(f"unsupported PNG filter {filter_type}")
        rows.append(row)
    counts: dict[tuple[int, int, int], int] = {}
    total = 0
    for y in range(0, height, 16):
        row = rows[y]
        for x in range(0, width, 16):
            i = x * channels
            color = (row[i], row[i + 1], row[i + 2])
            counts[color] = counts.get(color, 0) + 1
            total += 1
    if total == 0:
        return 1.0
    return max(counts.values()) / total


def _write_png(path: Path, width: int, height: int, rows_rgb: list[tuple[int, int, int]]) -> None:
    raw = bytearray()
    for color in rows_rgb:
        raw.append(0)
        raw.extend(bytes(color) * width)
    compressed = zlib.compress(bytes(raw))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b""))


def self_test() -> int:
    import tempfile

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        solid = root / "solid.png"
        mixed = root / "mixed.png"
        _write_png(solid, 32, 32, [(244, 244, 246)] * 32)
        _write_png(mixed, 32, 32, [(244, 244, 246)] * 16 + [(20, 20, 20)] * 16)
        solid_fraction = dominant_fraction(solid)
        mixed_fraction = dominant_fraction(mixed)
    if solid_fraction < 0.95 or mixed_fraction >= 0.95:
        print(f"self-test failed solid={solid_fraction:.3f} mixed={mixed_fraction:.3f}", file=sys.stderr)
        return 1
    print(f"self-test solid={solid_fraction:.3f} mixed={mixed_fraction:.3f}")
    return 0


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return self_test()
    if len(sys.argv) != 2:
        print("usage: png-flat.py <file.png>", file=sys.stderr)
        return 2
    fraction = dominant_fraction(Path(sys.argv[1]))
    # Printed for the capture log. Exit 0 means the shot is still empty.
    print(f"{fraction:.3f}")
    return 0 if fraction >= 0.95 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"png-flat: {error}", file=sys.stderr)
        raise SystemExit(2)
