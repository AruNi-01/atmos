import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'injected.js',
  'preview-runtime.js',
] as const;

export type ExtensionFileName = (typeof EXTENSION_FILES)[number];

const LOCAL_EXTENSION_ROOT = path.resolve(
  process.cwd(),
  '..',
  '..',
  'extension',
);

const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/AruNi-01/atmos/main/extension';

async function loadLocal(name: string): Promise<Uint8Array> {
  const filePath = path.join(LOCAL_EXTENSION_ROOT, name);
  return new Uint8Array(await readFile(filePath));
}

async function loadFromGitHub(name: string): Promise<Uint8Array> {
  const url = `${GITHUB_RAW_BASE}/${name}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`GitHub fetch failed for ${name}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Load an extension file: try local filesystem first, fall back to GitHub raw.
 * This ensures `npx` users without the source tree still get the extension.
 */
export async function loadExtensionFile(name: ExtensionFileName): Promise<Uint8Array> {
  try {
    return await loadLocal(name);
  } catch {
    return await loadFromGitHub(name);
  }
}
