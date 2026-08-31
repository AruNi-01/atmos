/** macOS clipboard screenshots arrive as TIFF; Chromium cannot preview that in <img>. */

const PREVIEWABLE_IMAGE_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
  "image/x-ms-bmp",
]);

const PREVIEWABLE_IMAGE_EXT = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const TIFF_EXT = /\.(tif|tiff)$/i;
const TIFF_TYPES = new Set([
  "image/tif",
  "image/tiff",
  "image/x-tif",
  "image/x-tiff",
]);

const TIFF_COMPRESSION_NONE = 1;
const TIFF_COMPRESSION_LZW = 5;
const TIFF_COMPRESSION_PACKBITS = 32773;
const TIFF_PHOTOMETRIC_BLACK_IS_ZERO = 1;
const TIFF_PHOTOMETRIC_RGB = 2;
const TIFF_MAX_PIXELS = 40_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

const TIFF_TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  7: 1,
};

export type ClipboardFileItem = {
  kind?: string;
  type: string;
  getAsFile: () => File | null;
};

export function isBrowserPreviewableImageMediaType(
  mediaType: string | undefined,
): boolean {
  if (!mediaType) return false;
  const type = mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return PREVIEWABLE_IMAGE_TYPES.has(type);
}

export function isBrowserPreviewableImageFilename(
  filename: string | undefined,
): boolean {
  return PREVIEWABLE_IMAGE_EXT.test(filename ?? "");
}

export function imageExtensionForFile(file: {
  name?: string;
  type?: string;
}): string {
  const type = file.type?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/pjpeg") {
    return "jpeg";
  }
  if (type === "image/svg+xml") return "svg";
  if (type.startsWith("image/")) {
    const subtype = type.slice("image/".length).replace(/[^a-z0-9]+/g, "");
    if (subtype) return subtype;
  }
  const match = file.name?.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || "png";
}

export function pickClipboardImageFiles(
  items: ArrayLike<ClipboardFileItem | undefined>,
): File[] {
  const images: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item) continue;
    if (item.kind && item.kind !== "file") continue;
    if (!item.type.toLowerCase().startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) images.push(file);
  }
  if (images.length <= 1) return images;
  const previewable = images.filter(isPreviewableImageFile);
  return previewable.length > 0 ? previewable : images;
}

export async function normalizeComposerImageFile(file: File): Promise<File> {
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!isTiffFile(file, header)) return file;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = decodeTiffToRgba(bytes);
  if (decoded) {
    const png = await encodePngRgba(decoded.width, decoded.height, decoded.rgba);
    return new File([png], pngFilename(file.name), { type: "image/png" });
  }

  const fromBitmap = await tiffToPngViaBitmap(file);
  return fromBitmap ?? file;
}

export function decodeTiffToRgba(
  bytes: Uint8Array,
): { width: number; height: number; rgba: Uint8Array } | null {
  if (!isTiffBytes(bytes) || bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = bytes[0] === 0x49;
  const ifdOffset = readU32(view, 4, littleEndian);
  if (ifdOffset == null) return null;
  const tags = readTiffTags(bytes, view, ifdOffset, littleEndian);
  if (!tags) return null;

  const width = firstTag(tags, 256);
  const height = firstTag(tags, 257);
  if (!width || !height || width > 65535 || height > 65535) return null;
  if (width * height > TIFF_MAX_PIXELS) return null;

  const compression = firstTag(tags, 259) ?? TIFF_COMPRESSION_NONE;
  if (
    compression !== TIFF_COMPRESSION_NONE &&
    compression !== TIFF_COMPRESSION_LZW &&
    compression !== TIFF_COMPRESSION_PACKBITS
  ) {
    return null;
  }

  const photometric = firstTag(tags, 262);
  if (
    photometric !== TIFF_PHOTOMETRIC_BLACK_IS_ZERO &&
    photometric !== TIFF_PHOTOMETRIC_RGB
  ) {
    return null;
  }

  const planar = firstTag(tags, 284) ?? 1;
  if (planar !== 1) return null;

  const orientation = firstTag(tags, 274) ?? 1;
  if (orientation !== 1) return null;

  const bits = tags.get(258) ?? [8];
  if (bits.some((value) => value !== 8)) return null;

  const samplesPerPixel =
    firstTag(tags, 277) ??
    (photometric === TIFF_PHOTOMETRIC_RGB ? 3 : 1);
  if (samplesPerPixel < 1 || samplesPerPixel > 4) return null;

  const rowsPerStrip = Math.min(firstTag(tags, 278) ?? height, height);
  const stripOffsets = tags.get(273);
  const stripByteCounts = tags.get(279);
  if (!stripOffsets?.length) return null;

  const samples = decodeTiffStrips({
    bytes,
    compression,
    height,
    rowsPerStrip,
    samplesPerPixel,
    stripByteCounts,
    stripOffsets,
    width,
  });
  if (!samples) return null;

  const predictor = firstTag(tags, 317) ?? 1;
  if (predictor === 2) {
    applyHorizontalPredictor(samples, width, samplesPerPixel);
  } else if (predictor !== 1) {
    return null;
  }

  return {
    width,
    height,
    rgba: samplesToRgba(samples, width, height, samplesPerPixel, photometric),
  };
}

function isPreviewableImageFile(file: File): boolean {
  if (isBrowserPreviewableImageMediaType(file.type)) return true;
  if (file.type) return false;
  return isBrowserPreviewableImageFilename(file.name);
}

function isTiffFile(file: File, bytes: Uint8Array): boolean {
  if (isTiffBytes(bytes)) return true;
  const type = file.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (TIFF_TYPES.has(type)) return true;
  return TIFF_EXT.test(file.name);
}

function isTiffBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
  );
}

function pngFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "blob") return "paste.png";
  if (TIFF_EXT.test(trimmed)) return trimmed.replace(TIFF_EXT, ".png");
  if (/\.png$/i.test(trimmed)) return trimmed;
  const dot = trimmed.lastIndexOf(".");
  if (dot > 0) return `${trimmed.slice(0, dot)}.png`;
  return `${trimmed}.png`;
}

function firstTag(tags: Map<number, number[]>, tag: number): number | undefined {
  return tags.get(tag)?.[0];
}

function readTiffTags(
  bytes: Uint8Array,
  view: DataView,
  ifdOffset: number,
  littleEndian: boolean,
): Map<number, number[]> | null {
  const count = readU16(view, ifdOffset, littleEndian);
  if (count == null || count <= 0 || count > 256) return null;
  const tags = new Map<number, number[]>();
  for (let i = 0; i < count; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = readU16(view, entry, littleEndian);
    if (tag == null) return null;
    const values = readTiffValues(bytes, view, entry, littleEndian);
    if (values) tags.set(tag, values);
  }
  return tags;
}

function readTiffValues(
  bytes: Uint8Array,
  view: DataView,
  entryOffset: number,
  littleEndian: boolean,
): number[] | null {
  const type = readU16(view, entryOffset + 2, littleEndian);
  const count = readU32(view, entryOffset + 4, littleEndian);
  if (type == null || count == null || count <= 0 || count > 4096) return null;
  const size = TIFF_TYPE_SIZE[type];
  if (!size) return null;
  const byteCount = size * count;
  let dataOffset = entryOffset + 8;
  if (byteCount > 4) {
    const pointer = readU32(view, dataOffset, littleEndian);
    if (pointer == null) return null;
    dataOffset = pointer;
  }
  if (dataOffset < 0 || dataOffset + byteCount > bytes.length) return null;

  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = dataOffset + i * size;
    if (type === 3) {
      const value = readU16(view, offset, littleEndian);
      if (value == null) return null;
      values.push(value);
    } else if (type === 4) {
      const value = readU32(view, offset, littleEndian);
      if (value == null) return null;
      values.push(value);
    } else {
      values.push(bytes[offset]!);
    }
  }
  return values;
}

function decodeTiffStrips({
  bytes,
  compression,
  height,
  rowsPerStrip,
  samplesPerPixel,
  stripByteCounts,
  stripOffsets,
  width,
}: {
  bytes: Uint8Array;
  compression: number;
  height: number;
  rowsPerStrip: number;
  samplesPerPixel: number;
  stripByteCounts: number[] | undefined;
  stripOffsets: number[];
  width: number;
}): Uint8Array | null {
  const rowBytes = width * samplesPerPixel;
  const out = new Uint8Array(rowBytes * height);
  let row = 0;
  for (let i = 0; i < stripOffsets.length; i += 1) {
    if (row >= height) break;
    const rows = Math.min(rowsPerStrip, height - row);
    const want = rows * rowBytes;
    const start = stripOffsets[i]!;
    const stored = stripByteCounts?.[i] ?? bytes.length - start;
    if (start < 0 || stored < 0 || start + stored > bytes.length) return null;
    const slice = bytes.subarray(start, start + stored);
    const decoded =
      compression === TIFF_COMPRESSION_NONE
        ? slice.length >= want
          ? slice.subarray(0, want)
          : null
        : compression === TIFF_COMPRESSION_PACKBITS
          ? decodePackBits(slice, want)
          : decodeTiffLzw(slice, want);
    if (!decoded) return null;
    out.set(decoded, row * rowBytes);
    row += rows;
  }
  return row === height ? out : null;
}

function decodeTiffLzw(input: Uint8Array, expected: number): Uint8Array | null {
  const out = new Uint8Array(expected);
  let outOffset = 0;
  let byteIndex = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  const readCode = (nbits: number): number | null => {
    while (bitCount < nbits) {
      if (byteIndex >= input.length) return null;
      bitBuffer = (bitBuffer << 8) | input[byteIndex]!;
      byteIndex += 1;
      bitCount += 8;
    }
    const shift = bitCount - nbits;
    const code = (bitBuffer >>> shift) & ((1 << nbits) - 1);
    bitCount = shift;
    bitBuffer &= (1 << bitCount) - 1;
    return code;
  };

  const clear = 256;
  const eoi = 257;
  const dictionary: Uint8Array[] = new Array(4096);
  let nextCode = 258;
  let nbits = 9;
  const reset = () => {
    for (let i = 0; i < 256; i += 1) dictionary[i] = Uint8Array.of(i);
    nextCode = 258;
    nbits = 9;
  };
  reset();

  let previous: Uint8Array | null = null;
  while (outOffset < expected) {
    const code = readCode(nbits);
    if (code == null) return null;
    if (code === eoi) break;
    if (code === clear) {
      reset();
      previous = null;
      continue;
    }

    let entry = code < nextCode ? dictionary[code] : undefined;
    if (!entry) {
      if (code !== nextCode || !previous) return null;
      entry = appendByte(previous, previous[0]!);
    }
    if (outOffset + entry.length > expected) return null;
    out.set(entry, outOffset);
    outOffset += entry.length;

    if (previous && nextCode < 4096) {
      dictionary[nextCode] = appendByte(previous, entry[0]!);
      nextCode += 1;
      if (nextCode === 512) nbits = 10;
      else if (nextCode === 1024) nbits = 11;
      else if (nextCode === 2048) nbits = 12;
    }
    previous = entry;
  }

  return outOffset === expected ? out : null;
}

function appendByte(bytes: Uint8Array, value: number): Uint8Array {
  const next = new Uint8Array(bytes.length + 1);
  next.set(bytes);
  next[bytes.length] = value;
  return next;
}

function decodePackBits(input: Uint8Array, expected: number): Uint8Array | null {
  const out = new Uint8Array(expected);
  let i = 0;
  let o = 0;
  while (i < input.length && o < expected) {
    const n = (input[i]! << 24) >> 24;
    i += 1;
    if (n >= 0 && n <= 127) {
      const count = n + 1;
      if (i + count > input.length || o + count > expected) return null;
      out.set(input.subarray(i, i + count), o);
      i += count;
      o += count;
    } else if (n >= -127 && n <= -1) {
      const count = 1 - n;
      if (i >= input.length || o + count > expected) return null;
      out.fill(input[i]!, o, o + count);
      i += 1;
      o += count;
    }
  }
  return o === expected ? out : null;
}

function applyHorizontalPredictor(
  samples: Uint8Array,
  width: number,
  samplesPerPixel: number,
): void {
  const stride = width * samplesPerPixel;
  for (let y = 0; y < samples.length; y += stride) {
    for (let x = samplesPerPixel; x < stride; x += 1) {
      samples[y + x] = (samples[y + x]! + samples[y + x - samplesPerPixel]!) & 0xff;
    }
  }
}

function samplesToRgba(
  samples: Uint8Array,
  width: number,
  height: number,
  samplesPerPixel: number,
  photometric: number,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const pixels = width * height;
  if (photometric === TIFF_PHOTOMETRIC_BLACK_IS_ZERO) {
    for (let i = 0; i < pixels; i += 1) {
      const gray = samples[i * samplesPerPixel]!;
      const alpha = samplesPerPixel > 1 ? samples[i * samplesPerPixel + 1]! : 255;
      const o = i * 4;
      rgba[o] = gray;
      rgba[o + 1] = gray;
      rgba[o + 2] = gray;
      rgba[o + 3] = alpha;
    }
    return rgba;
  }
  for (let i = 0; i < pixels; i += 1) {
    const s = i * samplesPerPixel;
    const o = i * 4;
    rgba[o] = samples[s]!;
    rgba[o + 1] = samples[s + 1]!;
    rgba[o + 2] = samples[s + 2]!;
    rgba[o + 3] = samplesPerPixel > 3 ? samples[s + 3]! : 255;
  }
  return rgba;
}

async function tiffToPngViaBitmap(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;
  if (typeof document === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) return null;
    return new File([blob], pngFilename(file.name), { type: "image/png" });
  } catch {
    return null;
  }
}

async function encodePngRgba(
  width: number,
  height: number,
  rgba: Uint8Array,
): Promise<Uint8Array> {
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    raw.set(rgba.subarray(src, src + width * 4), dst + 1);
  }
  const compressed = await zlibDeflate(raw);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [
    Uint8Array.from(PNG_SIGNATURE),
    pngChunk(0x49484452, ihdr),
    pngChunk(0x49444154, compressed),
    pngChunk(0x49454e44, new Uint8Array(0)),
  ];
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "function") {
    try {
      const stream = new Blob([data]).stream().pipeThrough(
        new CompressionStream("deflate"),
      );
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
      if (isZlibWrapper(compressed)) return compressed;
    } catch {
      // Stored-block zlib is always valid; browsers that lack deflate still preview.
    }
  }
  return zlibStore(data);
}

function isZlibWrapper(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const cmf = bytes[0]!;
  const flg = bytes[1]!;
  if ((cmf & 0x0f) !== 8) return false;
  return ((cmf << 8) | flg) % 31 === 0;
}

function zlibStore(data: Uint8Array): Uint8Array {
  const max = 65535;
  const blockCount = Math.max(1, Math.ceil(data.length / max));
  const out = new Uint8Array(2 + blockCount * 5 + data.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (let i = 0; i < blockCount; i += 1) {
    const start = i * max;
    const slice = data.subarray(start, Math.min(start + max, data.length));
    const last = i === blockCount - 1;
    out[o] = last ? 1 : 0;
    out[o + 1] = slice.length & 0xff;
    out[o + 2] = slice.length >> 8;
    const nlen = ~slice.length & 0xffff;
    out[o + 3] = nlen & 0xff;
    out[o + 4] = nlen >> 8;
    o += 5;
    out.set(slice, o);
    o += slice.length;
  }
  const adler = adler32(data);
  out[o] = (adler >>> 24) & 0xff;
  out[o + 1] = (adler >>> 16) & 0xff;
  out[o + 2] = (adler >>> 8) & 0xff;
  out[o + 3] = adler & 0xff;
  return out.subarray(0, o + 4);
}

function pngChunk(type: number, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  view.setUint32(4, type);
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return chunk;
}

let CRC_TABLE: Uint32Array | null = null;

function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
    CRC_TABLE = table;
  }
  const table = CRC_TABLE;
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a += data[i]!;
    if (a >= 65521) a -= 65521;
    b += a;
    if (b >= 65521) b -= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function readU16(
  view: DataView,
  offset: number,
  littleEndian: boolean,
): number | null {
  if (offset < 0 || offset + 2 > view.byteLength) return null;
  return view.getUint16(offset, littleEndian);
}

function readU32(
  view: DataView,
  offset: number,
  littleEndian: boolean,
): number | null {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getUint32(offset, littleEndian);
}
