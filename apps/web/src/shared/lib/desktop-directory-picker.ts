'use client';

import { desktopInvoke, isDesktopRuntime } from './desktop-bridge';

export type NativePathFilter = {
  name: string;
  extensions: string[];
};

export type NativePathPickResult =
  | { status: 'picked'; path: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

const MAX_EMBEDDED_FILE_BYTES = 2 * 1024 * 1024;

type OpenFilePickerOptions = {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type FilePickerHandle = {
  getFile: () => Promise<File>;
  path?: string;
};

type DirectoryPickerHandle = {
  name?: string;
  path?: string;
};

type WindowWithPickers = Window & {
  showOpenFilePicker?: (
    options?: OpenFilePickerOptions,
  ) => Promise<FilePickerHandle[]>;
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<DirectoryPickerHandle>;
};

type FileWithPath = File & {
  path?: string;
  webkitRelativePath?: string;
};

/**
 * Whether this client can invoke an OS folder/file picker (Desktop shell, or
 * a browser with a system picker). Remote / relay computers still need the
 * in-app FileBrowser because the OS picker would read the local laptop, not
 * the remote machine.
 */
export function canUseNativeDirectoryPicker(): boolean {
  return isDesktopRuntime() || canUseBrowserSystemPicker();
}

/** @deprecated Use canUseNativeDirectoryPicker */
export const isDesktopDirectoryPickerAvailable = canUseNativeDirectoryPicker;

function canUseBrowserSystemPicker(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const win = window as WindowWithPickers;
  return (
    typeof win.showOpenFilePicker === 'function' ||
    typeof win.showDirectoryPicker === 'function' ||
    typeof document.createElement === 'function'
  );
}

type PickLocalPathOptions = {
  directory: boolean;
  defaultPath?: string;
  title?: string;
  filters?: NativePathFilter[];
};

async function pickLocalPath(
  options: PickLocalPathOptions,
): Promise<NativePathPickResult> {
  const desktopResult = await pickViaDesktopShell(options);
  if (desktopResult.status !== 'unavailable') {
    return desktopResult;
  }
  return pickViaBrowser(options);
}

async function pickViaDesktopShell(
  options: PickLocalPathOptions,
): Promise<NativePathPickResult> {
  if (!isDesktopRuntime()) {
    return { status: 'unavailable' };
  }

  try {
    const result = await desktopInvoke<string | null>('open_path_dialog', {
      directory: options.directory,
      defaultPath: options.defaultPath,
      title: options.title,
      filters: options.filters,
    });
    if (typeof result === 'string' && result.length > 0) {
      return { status: 'picked', path: result };
    }
    // Electron returns null on cancel; Tauri may not implement open_path_dialog.
    if (result === null) {
      return { status: 'cancelled' };
    }
  } catch {
    // Fall through to Tauri dialog plugin.
  }

  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: options.directory,
      multiple: false,
      defaultPath: options.defaultPath,
      title: options.title,
      filters: options.filters,
    });
    if (typeof selected === 'string' && selected.length > 0) {
      return { status: 'picked', path: selected };
    }
    return { status: 'cancelled' };
  } catch {
    return { status: 'unavailable' };
  }
}

async function pickViaBrowser(
  options: PickLocalPathOptions,
): Promise<NativePathPickResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { status: 'unavailable' };
  }

  if (options.directory) {
    return pickBrowserDirectory();
  }
  return pickBrowserFile(options.filters);
}

async function pickBrowserFile(
  filters?: NativePathFilter[],
): Promise<NativePathPickResult> {
  const win = window as WindowWithPickers;
  if (typeof win.showOpenFilePicker === 'function') {
    try {
      const handles = await win.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: filtersToOpenFilePickerTypes(filters),
      });
      const handle = handles[0];
      if (!handle) {
        return { status: 'cancelled' };
      }
      if (typeof handle.path === 'string' && handle.path.length > 0) {
        return { status: 'picked', path: handle.path };
      }
      const file = await handle.getFile();
      return fileToPickResult(file);
    } catch (error) {
      if (isUserAbort(error)) {
        return { status: 'cancelled' };
      }
    }
  }

  return pickFileWithHiddenInput(filtersToAccept(filters));
}

async function pickBrowserDirectory(): Promise<NativePathPickResult> {
  const win = window as WindowWithPickers;
  if (typeof win.showDirectoryPicker === 'function') {
    try {
      const handle = await win.showDirectoryPicker({ mode: 'read' });
      const path = await directoryPathFromHandle(handle);
      if (path) {
        return { status: 'picked', path };
      }
      // The OS picker ran, but this browser will not expose an absolute path.
      // Callers fall back to the in-app FileBrowser.
      return { status: 'unavailable' };
    } catch (error) {
      if (isUserAbort(error)) {
        return { status: 'cancelled' };
      }
    }
  }

  return pickDirectoryWithHiddenInput();
}

async function directoryPathFromHandle(
  handle: DirectoryPickerHandle,
): Promise<string | null> {
  if (typeof handle.path === 'string' && handle.path.length > 0) {
    return handle.path;
  }

  const iterable = handle as DirectoryPickerHandle & {
    values?: () => AsyncIterable<{
      kind?: string;
      path?: string;
      getFile?: () => Promise<File>;
    }>;
  };
  if (typeof iterable.values !== 'function') {
    return null;
  }

  for await (const entry of iterable.values()) {
    if (typeof entry.path === 'string' && entry.path.length > 0) {
      return directoryFromContainedPath(entry.path);
    }
    if (entry.kind === 'file' && typeof entry.getFile === 'function') {
      try {
        const file = await entry.getFile();
        const fromFile = directoryPathFromPickedFile(file, handle.name);
        if (fromFile) {
          return fromFile;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  return null;
}

function pickDirectoryWithHiddenInput(): Promise<NativePathPickResult> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ status: 'unavailable' });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    (input as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory =
      true;
    input.style.display = 'none';

    settleHiddenInput(input, (files) => {
      const file = files?.[0];
      if (!file) {
        return { status: 'cancelled' };
      }
      const path = directoryPathFromPickedFile(file);
      if (path) {
        return { status: 'picked', path };
      }
      return { status: 'unavailable' };
    }).then(resolve);
  });
}

function directoryPathFromPickedFile(
  file: File,
  rootName?: string,
): string | null {
  const abs = (file as FileWithPath).path;
  if (typeof abs !== 'string' || abs.length === 0) {
    return null;
  }
  const normalizedAbs = abs.replace(/\\/g, '/');
  const relative = ((file as FileWithPath).webkitRelativePath ?? '').replace(
    /\\/g,
    '/',
  );
  if (relative && normalizedAbs.endsWith(`/${relative}`)) {
    return stripTrailingSlash(
      normalizedAbs.slice(0, normalizedAbs.length - relative.length - 1),
    );
  }
  if (relative && normalizedAbs.endsWith(relative)) {
    return stripTrailingSlash(
      normalizedAbs.slice(0, normalizedAbs.length - relative.length),
    );
  }
  const fileDir = directoryFromContainedPath(normalizedAbs);
  if (relative.includes('/')) {
    const relDir = relative.slice(0, relative.lastIndexOf('/'));
    if (fileDir.endsWith(`/${relDir}`)) {
      return stripTrailingSlash(fileDir.slice(0, fileDir.length - relDir.length));
    }
  }
  if (rootName && (fileDir === rootName || fileDir.endsWith(`/${rootName}`))) {
    return fileDir;
  }
  return fileDir;
}

function directoryFromContainedPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '');
}

function filtersToOpenFilePickerTypes(
  filters?: NativePathFilter[],
): OpenFilePickerOptions['types'] {
  if (!filters || filters.length === 0) {
    return undefined;
  }
  return filters.map((filter) => {
    const extensions = filter.extensions.map(
      (extension) => `.${extension.replace(/^\./, '')}`,
    );
    const accept: Record<string, string[]> = {};
    for (const extension of filter.extensions) {
      const mime = mimeTypeForExtension(extension);
      const dotted = `.${extension.replace(/^\./, '')}`;
      const bucket = accept[mime] ?? [];
      bucket.push(dotted);
      accept[mime] = bucket;
    }
    if (Object.keys(accept).length === 0) {
      accept['application/octet-stream'] = extensions;
    }
    return {
      description: filter.name,
      accept,
    };
  });
}

function mimeTypeForExtension(extension: string): string {
  switch (extension.replace(/^\./, '').toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

function filtersToAccept(filters?: NativePathFilter[]): string {
  if (!filters || filters.length === 0) {
    return '';
  }
  return filters
    .flatMap((filter) =>
      filter.extensions.map((extension) => `.${extension.replace(/^\./, '')}`),
    )
    .join(',');
}

async function fileToPickResult(file: File): Promise<NativePathPickResult> {
  const path = (file as FileWithPath).path;
  if (typeof path === 'string' && path.length > 0) {
    return { status: 'picked', path };
  }
  if (file.size === 0 || file.size > MAX_EMBEDDED_FILE_BYTES) {
    return { status: 'unavailable' };
  }
  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl.startsWith('data:')) {
      return { status: 'unavailable' };
    }
    return { status: 'picked', path: dataUrl };
  } catch {
    return { status: 'unavailable' };
  }
}

async function readFileAsDataUrl(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  const mime = file.type.trim() || 'application/octet-stream';
  return `data:${mime};base64,${btoa(binary)}`;
}

function pickFileWithHiddenInput(accept: string): Promise<NativePathPickResult> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ status: 'unavailable' });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    if (accept) {
      input.accept = accept;
    }
    input.style.display = 'none';
    void settleHiddenInput(input, (files) => {
      const file = files?.[0];
      if (!file) {
        return { status: 'cancelled' };
      }
      return fileToPickResult(file);
    }).then(resolve);
  });
}

function settleHiddenInput(
  input: HTMLInputElement,
  onFiles: (
    files: FileList | null,
  ) => NativePathPickResult | Promise<NativePathPickResult>,
): Promise<NativePathPickResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: NativePathPickResult) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(result);
    };

    const onFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          settle({ status: 'cancelled' });
        }
      }, 800);
    };

    input.addEventListener('change', () => {
      void Promise.resolve(onFiles(input.files)).then(settle);
    });
    input.addEventListener('cancel', () => {
      settle({ status: 'cancelled' });
    });

    document.body.appendChild(input);
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
}

function isUserAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Open the native OS directory picker.
 * `unavailable` means the caller should fall back to the in-app FileBrowser.
 */
export async function pickLocalDirectory(options?: {
  defaultPath?: string;
  title?: string;
}): Promise<NativePathPickResult> {
  return pickLocalPath({
    directory: true,
    defaultPath: options?.defaultPath,
    title: options?.title,
  });
}

/**
 * Open the native OS file picker.
 * `unavailable` means the caller should fall back to the in-app FileBrowser.
 */
export async function pickLocalFile(options?: {
  defaultPath?: string;
  title?: string;
  filters?: NativePathFilter[];
}): Promise<NativePathPickResult> {
  return pickLocalPath({
    directory: false,
    defaultPath: options?.defaultPath,
    title: options?.title,
    filters: options?.filters,
  });
}

/** @deprecated Use pickLocalDirectory */
export const pickDesktopDirectory = pickLocalDirectory;
