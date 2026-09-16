/** Overview thumbs live in IndexedDB so persist JSON / localStorage stay small. */

export const PREVIEW_BLOB_SCHEME = "idb:pt-preview/";
const DB_NAME = "atmos-pt-design";
const DB_STORE = "preview";
const INLINE_DATA_URL_MAX = 80_000;

const memory = new Map<string, Blob>();
const objectUrls = new Map<string, string>();

export function previewBlobPointer(id: string): string {
  return `${PREVIEW_BLOB_SCHEME}${id}`;
}

export function isPreviewBlobPointer(preview: string | undefined): boolean {
  return Boolean(preview?.startsWith(PREVIEW_BLOB_SCHEME));
}

export function previewBlobId(preview: string | undefined): string | null {
  if (!preview?.startsWith(PREVIEW_BLOB_SCHEME)) return null;
  const id = preview.slice(PREVIEW_BLOB_SCHEME.length);
  return id || null;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "data:image/jpeg;base64";
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = header.match(/data:([^;,]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function forgetObjectUrl(id: string): void {
  const url = objectUrls.get(id);
  if (!url) return;
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
  objectUrls.delete(id);
}

function memoryGet(id: string): Blob | null {
  return memory.get(id) ?? null;
}

function memoryPut(id: string, blob: Blob): void {
  forgetObjectUrl(id);
  memory.set(id, blob);
}

function memoryDelete(id: string): void {
  forgetObjectUrl(id);
  memory.delete(id);
}

/** Sync object URL when the blob is already in memory — overview thumbs must not flash on remount. */
export function getPreviewObjectUrl(id: string): string | undefined {
  const hit = objectUrls.get(id);
  if (hit) return hit;
  const blob = memoryGet(id);
  if (!blob) return undefined;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return undefined;
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("preview db"));
  });
}

async function idbGet(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(id);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value instanceof Blob ? value : null);
      };
      req.onerror = () => reject(req.error ?? new Error("preview get"));
    });
  } finally {
    db.close();
  }
}

async function idbPut(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(blob, id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("preview put"));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("preview delete"));
    });
  } finally {
    db.close();
  }
}

function canUseIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function putPreviewBlob(id: string, blob: Blob): Promise<void> {
  memoryPut(id, blob);
  if (!canUseIdb()) return;
  try {
    await idbPut(id, blob);
  } catch {
    /* memory already has a copy for this session */
  }
}

export async function getPreviewBlob(id: string): Promise<Blob | null> {
  const cached = memoryGet(id);
  if (cached) return cached;
  if (!canUseIdb()) return null;
  try {
    const blob = await idbGet(id);
    if (blob) memoryPut(id, blob);
    return blob;
  } catch {
    return null;
  }
}

export async function deletePreviewBlob(id: string): Promise<void> {
  memoryDelete(id);
  if (!canUseIdb()) return;
  try {
    await idbDelete(id);
  } catch {
    /* ignore */
  }
}

export async function persistPreviewImage(
  id: string,
  dataUrl: string,
  blob?: Blob,
): Promise<string | undefined> {
  if (isPreviewBlobPointer(dataUrl)) return dataUrl;
  const stored = blob && blob.size > 32 ? blob : dataUrlToBlob(dataUrl);
  if (stored.size < 32) return undefined;
  try {
    await putPreviewBlob(id, stored);
    return previewBlobPointer(id);
  } catch {
    if (dataUrl.startsWith("data:image/") && dataUrl.length <= INLINE_DATA_URL_MAX) {
      return dataUrl;
    }
    return undefined;
  }
}

export function resetPreviewBlobMemory(): void {
  for (const id of [...objectUrls.keys()]) forgetObjectUrl(id);
  memory.clear();
}
