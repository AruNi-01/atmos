#!/usr/bin/env python3
"""Print the video-track duration of an MP4 or MOV, in seconds.

macOS afinfo opens the file as audio and exits with AudioFileOpenURL when
the recording has no audio track. simctl recordVideo can also store a movie
header that is longer than the samples it actually wrote, so the video
track (mdhd) wins over mvhd.
"""

from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path


def _boxes(data: bytes, start: int, end: int):
    index = start
    while index + 8 <= end:
        size = struct.unpack_from(">I", data, index)[0]
        box_type = data[index + 4 : index + 8]
        header = 8
        if size == 1 and index + 16 <= end:
            size = struct.unpack_from(">Q", data, index + 8)[0]
            header = 16
        if size < header or index + size > end:
            return
        yield index, size, box_type, header
        index += size


def _media_seconds(data: bytes, offset: int, header: int) -> float:
    payload = offset + header
    version = data[payload]
    if version == 0:
        timescale, duration = struct.unpack_from(">II", data, payload + 12)
    else:
        timescale, duration = struct.unpack_from(">IQ", data, payload + 20)
    if timescale == 0:
        return 0.0
    return duration / timescale


def video_duration_seconds(data: bytes) -> float:
    """Return the video sample duration, or the movie header when no video track exists."""
    movie_header = 0.0
    for offset, size, box_type, header in _boxes(data, 0, len(data)):
        if box_type != b"moov":
            continue
        moov_end = offset + size
        for child_offset, child_size, child_type, child_header in _boxes(
            data, offset + header, moov_end
        ):
            if child_type == b"mvhd":
                movie_header = _media_seconds(data, child_offset, child_header)
            if child_type != b"trak":
                continue
            handler = b""
            media_header = None
            track_end = child_offset + child_size
            for media_offset, media_size, media_type, media_header_size in _boxes(
                data, child_offset + child_header, track_end
            ):
                if media_type != b"mdia":
                    continue
                media_end = media_offset + media_size
                for inner_offset, _inner_size, inner_type, inner_header in _boxes(
                    data, media_offset + media_header_size, media_end
                ):
                    if inner_type == b"hdlr" and inner_offset + inner_header + 12 <= len(data):
                        handler = data[inner_offset + inner_header + 8 : inner_offset + inner_header + 12]
                    if inner_type == b"mdhd":
                        media_header = (inner_offset, inner_header)
            if handler == b"vide" and media_header is not None:
                return _media_seconds(data, media_header[0], media_header[1])
    return movie_header


def _box(box_type: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + box_type + payload


def _mdhd(timescale: int, duration: int) -> bytes:
    payload = struct.pack(">IIIIIH", 0, 0, 0, timescale, duration, 0)
    return _box(b"mdhd", payload)


def _hdlr(kind: bytes) -> bytes:
    payload = struct.pack(">II4s", 0, 0, kind) + (b"\x00" * 12) + b"\x00"
    return _box(b"hdlr", payload)


def _jpeg_size(data: bytes) -> tuple[int, int]:
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            break
        marker = data[index + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            height, width = struct.unpack_from(">HH", data, index + 5)
            return width, height
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            index += 2
            continue
        if index + 4 > len(data):
            break
        length = struct.unpack_from(">H", data, index + 2)[0]
        if length < 2:
            break
        index += 2 + length
    raise ValueError("jpeg is missing a start-of-frame marker")


def _jpeg_sample_entry(width: int, height: int) -> bytes:
    payload = b"".join(
        (
            b"\x00" * 6,
            struct.pack(">H", 1),
            struct.pack(">HH", 0, 0),
            struct.pack(">III", 0, 0, 0),
            struct.pack(">HH", width, height),
            struct.pack(">II", 0x00480000, 0x00480000),
            struct.pack(">IH", 0, 1),
            b"\x00" * 32,
            struct.pack(">hh", 24, -1),
        )
    )
    return _box(b"jpeg", payload)


def write_mjpeg_mov(frames: list[bytes], seconds: float) -> bytes:
    """Mux baseline JPEGs into a QuickTime movie whose video track lasts `seconds`.

    simctl recordVideo dropped a static screen down to two samples. These frames
    are screenshots taken across the capture window, each held long enough that
    the movie header matches that window.
    """
    if not frames:
        raise ValueError("mjpeg movie needs at least one frame")
    if seconds <= 0:
        raise ValueError("mjpeg duration must be positive")
    width, height = _jpeg_size(frames[0])
    timescale = 1000
    total_ticks = max(len(frames), int(round(seconds * timescale)))
    sample_delta = total_ticks // len(frames)
    duration = sample_delta * len(frames)

    ftyp = _box(b"ftyp", b"qt  " + struct.pack(">I", 0) + b"qt  ")
    mdat = _box(b"mdat", b"".join(frames))
    sample_offset = len(ftyp) + 8

    matrix = struct.pack(
        ">9I",
        0x00010000,
        0,
        0,
        0,
        0x00010000,
        0,
        0,
        0,
        0x40000000,
    )
    mvhd = _box(
        b"mvhd",
        struct.pack(">III", 0, 0, 0)
        + struct.pack(">II", timescale, duration)
        + struct.pack(">IH", 0x00010000, 0x0100)
        + (b"\x00" * 10)
        + matrix
        + (b"\x00" * 24)
        + struct.pack(">I", 2),
    )
    tkhd = _box(
        b"tkhd",
        struct.pack(">I", 0x0000000F)
        + struct.pack(">II", 0, 0)
        + struct.pack(">II", 1, 0)
        + struct.pack(">I", duration)
        + (b"\x00" * 8)
        + struct.pack(">hhhh", 0, 0, 0, 0)
        + matrix
        + struct.pack(">II", width << 16, height << 16),
    )
    mdhd = _box(
        b"mdhd",
        struct.pack(">III", 0, 0, 0)
        + struct.pack(">II", timescale, duration)
        + struct.pack(">HH", 0x55C4, 0),
    )
    hdlr = _box(
        b"hdlr",
        struct.pack(">II", 0, 0) + b"vide" + struct.pack(">III", 0, 0, 0) + b"VideoHandler\x00",
    )
    vmhd = _box(b"vmhd", struct.pack(">IHHHH", 1, 0, 0, 0, 0))
    dref = _box(b"dref", struct.pack(">II", 0, 1) + _box(b"url ", struct.pack(">I", 1)))
    stsd = _box(b"stsd", struct.pack(">II", 0, 1) + _jpeg_sample_entry(width, height))
    stts = _box(b"stts", struct.pack(">IIII", 0, 1, len(frames), sample_delta))
    stss = _box(
        b"stss",
        struct.pack(">II", 0, len(frames)) + struct.pack(f">{len(frames)}I", *range(1, len(frames) + 1)),
    )
    stsc = _box(b"stsc", struct.pack(">IIIII", 0, 1, 1, len(frames), 1))
    stsz = _box(
        b"stsz",
        struct.pack(">III", 0, 0, len(frames)) + struct.pack(f">{len(frames)}I", *(len(frame) for frame in frames)),
    )
    stco = _box(b"stco", struct.pack(">III", 0, 1, sample_offset))
    stbl = _box(b"stbl", stsd + stts + stss + stsc + stsz + stco)
    minf = _box(b"minf", vmhd + _box(b"dinf", dref) + stbl)
    trak = _box(b"trak", tkhd + _box(b"mdia", mdhd + hdlr + minf))
    return ftyp + mdat + _box(b"moov", mvhd + trak)


class Mp4DurationTest(unittest.TestCase):
    def test_video_track_wins_over_a_longer_movie_header(self) -> None:
        # simctl wrote mvhd 4048/600 (6.75s) while the video samples were 762/600 (1.27s).
        movie = _mdhd(600, 4048)
        video = _box(b"mdia", _hdlr(b"vide") + _mdhd(600, 762))
        audio = _box(b"mdia", _hdlr(b"soun") + _mdhd(44100, 44100))
        data = _box(
            b"moov",
            movie + _box(b"trak", video) + _box(b"trak", audio),
        )
        self.assertAlmostEqual(video_duration_seconds(data), 1.27, places=2)

    def test_video_only_file_still_has_a_duration(self) -> None:
        data = _box(b"moov", _box(b"trak", _box(b"mdia", _hdlr(b"vide") + _mdhd(600, 4800))))
        self.assertAlmostEqual(video_duration_seconds(data), 8.0, places=2)

    def test_empty_file_is_zero(self) -> None:
        self.assertEqual(video_duration_seconds(b""), 0.0)

    def test_screenshot_movie_keeps_the_capture_window(self) -> None:
        frame = _synthetic_jpeg(8, 8)
        movie = write_mjpeg_mov([frame, frame], 8)
        self.assertAlmostEqual(video_duration_seconds(movie), 8.0, places=2)


def _synthetic_jpeg(width: int, height: int) -> bytes:
    """Smallest baseline JPEG the duration parser can size. Not a picture."""
    body = struct.pack(">BHHB", 8, height, width, 1) + bytes((1, 0x11, 0, 0))
    sof = b"\xff\xc0" + struct.pack(">H", 2 + len(body)) + body
    return b"\xff\xd8" + sof + b"\xff\xd9"


def _write_mjpeg_directory(out: Path, directory: Path, seconds: float) -> None:
    frames = [path.read_bytes() for path in sorted(directory.glob("*.jpg"))]
    if not frames:
        raise SystemExit(f"no jpeg frames in {directory}")
    out.write_bytes(write_mjpeg_mov(frames, seconds))


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(Mp4DurationTest)
        result = unittest.TextTestRunner(verbosity=1).run(suite)
        return 0 if result.wasSuccessful() else 1
    if len(sys.argv) == 5 and sys.argv[1] == "--write-mjpeg":
        _write_mjpeg_directory(Path(sys.argv[2]), Path(sys.argv[3]), float(sys.argv[4]))
        print(f"{video_duration_seconds(Path(sys.argv[2]).read_bytes()):.3f}")
        return 0
    if len(sys.argv) != 2:
        print(
            "usage: mp4-duration.py <file> | --self-test | --write-mjpeg <out.mov> <jpeg-dir> <seconds>",
            file=sys.stderr,
        )
        return 2
    seconds = video_duration_seconds(Path(sys.argv[1]).read_bytes())
    print(f"{seconds:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
