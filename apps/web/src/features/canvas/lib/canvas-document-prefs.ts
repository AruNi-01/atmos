/**
 * Active canvas document preference.
 *
 * - **sessionStorage** (`TAB_ACTIVE_KEY`): this browser tab’s open document.
 *   Pin / cleanup **must only** use this — never localStorage (avoids sibling tabs).
 * - **localStorage** (`ACTIVE_DOCUMENT_KEY`): last-opened document for cold-start
 *   restore when opening Canvas in a tab that has no session value yet.
 */

const ACTIVE_DOCUMENT_KEY = "atmos.canvas.activeDocumentFileName";
const TAB_ACTIVE_KEY = "atmos.canvas.tabActiveDocumentFileName";

function readStorage(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, fileName: string | null): void {
  if (!storage) return;
  try {
    if (!fileName) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, fileName);
  } catch {
    // ignore quota / private mode
  }
}

function sessionStorageSafe(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function localStorageSafe(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** This tab’s open document only (pin / terminal cleanup). No cross-tab fallback. */
export function readTabActiveCanvasDocumentFileName(): string | null {
  return readStorage(sessionStorageSafe(), TAB_ACTIVE_KEY);
}

/** Last-opened document across sessions (Canvas cold start restore only). */
export function readLastOpenedCanvasDocumentFileName(): string | null {
  return readStorage(localStorageSafe(), ACTIVE_DOCUMENT_KEY);
}

/**
 * Document to open when Canvas loads in this tab.
 * Tab session first, then last-opened (never used for pin).
 */
export function readActiveCanvasDocumentFileName(): string | null {
  return readTabActiveCanvasDocumentFileName() ?? readLastOpenedCanvasDocumentFileName();
}

/**
 * Record the document open in this tab (session) and as last-opened (local).
 */
export function writeActiveCanvasDocumentFileName(fileName: string | null): void {
  writeStorage(sessionStorageSafe(), TAB_ACTIVE_KEY, fileName);
  writeStorage(localStorageSafe(), ACTIVE_DOCUMENT_KEY, fileName);
}

/** Well-known pin target when this tab has no open canvas document. */
export const DEFAULT_PIN_DOCUMENT_FILE = "Default.atmos.tldr";
