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

const LOCAL_SHARED_PREVIEW_RUNTIME = path.resolve(
  process.cwd(),
  '..',
  '..',
  'packages',
  'shared',
  'preview',
  'preview-runtime.js',
);

const GITHUB_SHARED_PREVIEW_RUNTIME =
  'https://raw.githubusercontent.com/AruNi-01/atmos/main/packages/shared/preview/preview-runtime.js';

async function loadLocal(name: string): Promise<Uint8Array> {
  const filePath =
      name === 'preview-runtime.js'
        ? LOCAL_SHARED_PREVIEW_RUNTIME
        : path.join(LOCAL_EXTENSION_ROOT, name);
  return new Uint8Array(await readFile(filePath));
}

async function loadFromGitHub(name: string): Promise<Uint8Array> {
  const url =
      name === 'preview-runtime.js'
        ? GITHUB_SHARED_PREVIEW_RUNTIME
        : `${GITHUB_RAW_BASE}/${name}`;
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
