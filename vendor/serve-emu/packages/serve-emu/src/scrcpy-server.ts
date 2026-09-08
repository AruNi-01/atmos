import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Pinned scrcpy server version. Bumping it means re-validating the wire protocol
// in `scrcpy.ts` (the framing drifts between scrcpy majors).
// Canonical wire spec and upgrade checklist: ../docs/protocol.md
export const SCRCPY_VERSION = "4.0";

const DOWNLOAD_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}`;

/** Source-tree vs packed-binary vendor dir. `$bunfs` is compile-time, not execPath. */
export function resolveVendorDir(importMetaUrl: string, execPath: string): string {
  if (importMetaUrl.includes("$bunfs")) {
    return join(dirname(execPath), "vendor");
  }
  return join(dirname(fileURLToPath(importMetaUrl)), "..", "vendor");
}

function vendorDir(): string {
  // Packed binary: ~/.atmos/runtime/serve-emu/<ver>/vendor/scrcpy-server-v4.0
  // next to process.execPath. bun --compile import.meta.url lives under
  // /$bunfs/ and cannot see that file. `bun run setup` uses the bun
  // executable as execPath, so that path must not be used in source runs.
  return resolveVendorDir(import.meta.url, process.execPath);
}

const VENDOR_DIR = vendorDir();
export const SCRCPY_SERVER_PATH = join(VENDOR_DIR, `scrcpy-server-v${SCRCPY_VERSION}`);

export async function ensureScrcpyServer(): Promise<string> {
  if (existsSync(SCRCPY_SERVER_PATH)) return SCRCPY_SERVER_PATH;
  await mkdir(VENDOR_DIR, { recursive: true });
  console.log(`Downloading scrcpy-server v${SCRCPY_VERSION}…`);
  const res = await fetch(DOWNLOAD_URL);
  if (!res.ok) throw new Error(`Failed to download ${DOWNLOAD_URL}: ${res.status} ${res.statusText}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(SCRCPY_SERVER_PATH, buf);
  console.log(`Saved ${SCRCPY_SERVER_PATH} (${buf.byteLength} bytes)`);
  return SCRCPY_SERVER_PATH;
}
