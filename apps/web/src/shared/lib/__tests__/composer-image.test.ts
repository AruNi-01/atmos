import { describe, expect, it } from "bun:test";
import {
  decodeTiffToRgba,
  imageExtensionForFile,
  normalizeComposerImageFile,
  pickClipboardImageFiles,
} from "../composer-image";

describe("pickClipboardImageFiles", () => {
  it("prefers a browser-previewable image when TIFF is also on the clipboard", () => {
    const png = new File([new Uint8Array([1])], "image.png", { type: "image/png" });
    const tiff = new File([new Uint8Array([2])], "image.tiff", {
      type: "image/tiff",
    });
    const picked = pickClipboardImageFiles([
      { kind: "file", type: "image/tiff", getAsFile: () => tiff },
      { kind: "file", type: "image/png", getAsFile: () => png },
    ]);
    expect(picked).toEqual([png]);
  });

  it("keeps TIFF when it is the only image", () => {
    const tiff = new File([new Uint8Array([2])], "image.tiff", {
      type: "image/tiff",
    });
    expect(
      pickClipboardImageFiles([
        { kind: "file", type: "image/tiff", getAsFile: () => tiff },
      ]),
    ).toEqual([tiff]);
  });
});

describe("decodeTiffToRgba", () => {
  it("decodes little-endian uncompressed RGB", () => {
    const tiff = buildTiff({
      width: 2,
      height: 1,
      samplesPerPixel: 3,
      samples: Uint8Array.from([255, 0, 0, 0, 255, 0]),
    });
    const decoded = decodeTiffToRgba(tiff);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(2);
    expect(decoded?.height).toBe(1);
    expect([...decoded!.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("decodes big-endian PackBits RGBA", () => {
    const raw = Uint8Array.from([255, 0, 0, 128, 0, 255, 0, 255]);
    const tiff = buildTiff({
      width: 2,
      height: 1,
      samplesPerPixel: 4,
      samples: raw,
      littleEndian: false,
      packbits: true,
    });
    const decoded = decodeTiffToRgba(tiff);
    expect(decoded).not.toBeNull();
    expect([...decoded!.rgba]).toEqual([...raw]);
  });

  it("rejects unknown compression so callers can fall back", () => {
    const tiff = buildTiff({
      width: 1,
      height: 1,
      samplesPerPixel: 3,
      samples: Uint8Array.from([255, 0, 0]),
      compression: 99,
    });
    expect(decodeTiffToRgba(tiff)).toBeNull();
  });

  it("decodes Apple-style LZW with horizontal predictor", () => {
    const tiff = buildTiff({
      width: 4,
      height: 4,
      samplesPerPixel: 4,
      samples: Uint8Array.from([
        128, 63, 192, 0, 8, 20, 14, 13, 7, 129, 193, 96, 176, 136, 68, 42, 25, 12,
        135, 67, 224, 240, 16,
      ]),
      compression: 5,
      predictor: 2,
    });
    const decoded = decodeTiffToRgba(tiff);
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(4);
    expect(decoded?.height).toBe(4);
    expect([...decoded!.rgba.slice(0, 8)]).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
    expect(decoded!.rgba.every((value, index) => value === [255, 0, 0, 255][index % 4])).toBe(
      true,
    );
  });
});

describe("normalizeComposerImageFile", () => {
  it("converts a macOS-style TIFF into a PNG the browser can preview", async () => {
    const tiff = buildTiff({
      width: 2,
      height: 2,
      samplesPerPixel: 4,
      samples: Uint8Array.from([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
      ]),
    });
    const file = new File([tiff], "screenshot.tiff", { type: "image/tiff" });
    const normalized = await normalizeComposerImageFile(file);
    expect(normalized.type).toBe("image/png");
    expect(normalized.name).toBe("screenshot.png");
    const bytes = new Uint8Array(await normalized.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(2);
    expect(view.getUint32(20)).toBe(2);
  });

  it("leaves an undecodable TIFF unchanged for the file-pill fallback", async () => {
    const tiff = buildTiff({
      width: 1,
      height: 1,
      samplesPerPixel: 3,
      samples: Uint8Array.from([1, 2, 3]),
      compression: 99,
    });
    const file = new File([tiff], "scan.tiff", { type: "image/tiff" });
    const normalized = await normalizeComposerImageFile(file);
    expect(normalized).toBe(file);
    expect(normalized.type).toBe("image/tiff");
  });

  it("does not rewrite an already previewable PNG", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", {
      type: "image/png",
    });
    expect(await normalizeComposerImageFile(file)).toBe(file);
  });

  it("converts a TIFF even when the clipboard labels it as PNG", async () => {
    const tiff = buildTiff({
      width: 1,
      height: 1,
      samplesPerPixel: 3,
      samples: Uint8Array.from([0, 128, 255]),
    });
    const file = new File([tiff], "image.png", { type: "image/png" });
    const normalized = await normalizeComposerImageFile(file);
    expect(normalized.type).toBe("image/png");
    expect(normalized).not.toBe(file);
    const bytes = new Uint8Array(await normalized.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

describe("imageExtensionForFile", () => {
  it("maps converted PNG and leftover TIFF names", () => {
    expect(imageExtensionForFile({ name: "paste.png", type: "image/png" })).toBe(
      "png",
    );
    expect(
      imageExtensionForFile({ name: "paste.tiff", type: "image/tiff" }),
    ).toBe("tiff");
  });
});

function buildTiff({
  width,
  height,
  samples,
  samplesPerPixel,
  littleEndian = true,
  packbits = false,
  compression,
  predictor,
}: {
  width: number;
  height: number;
  samples: Uint8Array;
  samplesPerPixel: number;
  littleEndian?: boolean;
  packbits?: boolean;
  compression?: number;
  predictor?: number;
}): Uint8Array {
  const payload = packbits ? packBits(samples) : samples;
  const extra: Uint8Array[] = [];
  let extraOffset = 8 + payload.length;
  const bitsPerSample = Array.from({ length: samplesPerPixel }, () => 8);
  const bitsInline = bitsPerSample.length * 2 <= 4;
  let bitsPointer = 0;
  if (!bitsInline) {
    bitsPointer = extraOffset;
    extra.push(u16List(bitsPerSample, littleEndian));
    extraOffset += bitsPerSample.length * 2;
  }
  const ifdOffset = extraOffset;
  const tags: Array<{ tag: number; type: 3 | 4; values: number[] }> = [
    { tag: 256, type: 3, values: [width] },
    { tag: 257, type: 3, values: [height] },
    { tag: 258, type: 3, values: bitsPerSample },
    {
      tag: 259,
      type: 3,
      values: [compression ?? (packbits ? 32773 : 1)],
    },
    { tag: 262, type: 3, values: [samplesPerPixel >= 3 ? 2 : 1] },
    { tag: 273, type: 4, values: [8] },
    { tag: 277, type: 3, values: [samplesPerPixel] },
    { tag: 278, type: 3, values: [height] },
    { tag: 279, type: 4, values: [payload.length] },
    { tag: 284, type: 3, values: [1] },
  ];
  if (predictor) tags.push({ tag: 317, type: 3, values: [predictor] });
  const ifd = new Uint8Array(2 + tags.length * 12 + 4);
  const ifdView = new DataView(ifd.buffer);
  ifdView.setUint16(0, tags.length, littleEndian);
  tags.forEach((entry, index) => {
    const offset = 2 + index * 12;
    ifdView.setUint16(offset, entry.tag, littleEndian);
    ifdView.setUint16(offset + 2, entry.type, littleEndian);
    ifdView.setUint32(offset + 4, entry.values.length, littleEndian);
    const size = entry.type === 3 ? 2 : 4;
    if (entry.tag === 258 && !bitsInline) {
      ifdView.setUint32(offset + 8, bitsPointer, littleEndian);
      return;
    }
    const inline = new Uint8Array(4);
    const inlineView = new DataView(inline.buffer);
    entry.values.forEach((value, valueIndex) => {
      if (entry.type === 3) inlineView.setUint16(valueIndex * size, value, littleEndian);
      else inlineView.setUint32(valueIndex * size, value, littleEndian);
    });
    ifd.set(inline, offset + 8);
  });
  ifdView.setUint32(2 + tags.length * 12, 0, littleEndian);

  const extraBytes = concat(extra);
  const out = new Uint8Array(8 + payload.length + extraBytes.length + ifd.length);
  out[0] = littleEndian ? 0x49 : 0x4d;
  out[1] = littleEndian ? 0x49 : 0x4d;
  const header = new DataView(out.buffer);
  header.setUint16(2, 42, littleEndian);
  header.setUint32(4, ifdOffset, littleEndian);
  out.set(payload, 8);
  out.set(extraBytes, 8 + payload.length);
  out.set(ifd, ifdOffset);
  return out;
}

function packBits(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; ) {
    const count = Math.min(128, data.length - i);
    out.push(count - 1);
    for (let j = 0; j < count; j += 1) out.push(data[i + j]!);
    i += count;
  }
  return Uint8Array.from(out);
}

function u16List(values: number[], littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, littleEndian));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
