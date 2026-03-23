import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXTENSION_ROOT = path.join(
  process.cwd(),
  'public',
  'atmos-inspector-extension',
);

const EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'injected.js',
  'preview-runtime.js',
] as const;

const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/AruNi-01/atmos/main/apps/web/public/atmos-inspector-extension';

const encoder = new TextEncoder();

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crc32Table = buildCrc32Table();

function crc32(data: Uint8Array): number {
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

function createZip(entries: Array<{ name: string; content: Uint8Array }>): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const content = entry.content;
    const crc = crc32(content);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, content.length);
    writeUint32(localView, 22, content.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, content);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, content.length);
    writeUint32(centralView, 24, content.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + content.length;
  }

  const centralDirectory = concatChunks(centralChunks);
  const localFileData = concatChunks(localChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, localFileData.length);
  writeUint16(endView, 20, 0);

  return concatChunks([localFileData, centralDirectory, endRecord]);
}

async function loadLocalEntries() {
  const loaded = await Promise.all(
    EXTENSION_FILES.map(async (name) => {
      const filePath = path.join(EXTENSION_ROOT, name);
      const content = await readFile(filePath);
      return {
        name,
        content: new Uint8Array(content),
      };
    }),
  );

  return loaded;
}

async function loadGithubEntries() {
  const loaded = await Promise.all(
    EXTENSION_FILES.map(async (name) => {
      const response = await fetch(`${GITHUB_RAW_BASE}/${name}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${name} from GitHub`);
      }
      const content = new Uint8Array(await response.arrayBuffer());
      return {
        name,
        content,
      };
    }),
  );

  return loaded;
}

export async function GET() {
  try {
    let entries;

    try {
      entries = await loadLocalEntries();
    } catch {
      entries = await loadGithubEntries();
    }

    const zipData = createZip(entries);

    return new NextResponse(Buffer.from(zipData), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="atmos-inspector-extension.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to build extension package.',
      },
      { status: 500 },
    );
  }
}
