/** Active canvas document file name under `~/.atmos/canvas/` (client preference). */

const ACTIVE_DOCUMENT_KEY = "atmos.canvas.activeDocumentFileName";

export function readActiveCanvasDocumentFileName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ACTIVE_DOCUMENT_KEY);
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function writeActiveCanvasDocumentFileName(fileName: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!fileName) {
      window.localStorage.removeItem(ACTIVE_DOCUMENT_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_DOCUMENT_KEY, fileName);
  } catch {
    // ignore quota / private mode
  }
}

/** Well-known pin target when no active document is set (matches core-service). */
export const DEFAULT_PIN_DOCUMENT_FILE = "Default.atmos.tldr";
