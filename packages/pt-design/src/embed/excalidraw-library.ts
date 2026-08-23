/** Named window so libraries.excalidraw.com returns into this tab (`target=<name>`). */
export const EXCALIDRAW_LIBRARY_WINDOW_NAME = "pt-design";

export const EXCALIDRAW_LIBRARY_STORAGE_KEY = "pt-design:excalidraw-library:v1";

export type LibraryKv = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type NamedWindow = { name: string };

function browserKv(): LibraryKv | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * `libraries.excalidraw.com` uses `<a target="{window.name || '_blank'}">`.
 * An empty name opens a new tab; a named window navigates this one to `#addLibrary=`.
 */
export function bindExcalidrawLibraryWindowName(
  target: NamedWindow | null = typeof window === "undefined" ? null : window,
): void {
  if (!target) return;
  if (!target.name) target.name = EXCALIDRAW_LIBRARY_WINDOW_NAME;
}

export function localStorageLibraryAdapter(
  key = EXCALIDRAW_LIBRARY_STORAGE_KEY,
  kv: LibraryKv | null = browserKv(),
) {
  return {
    async load() {
      if (!kv) return null;
      const raw = kv.getItem(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { libraryItems?: unknown };
        return Array.isArray(parsed.libraryItems)
          ? { libraryItems: parsed.libraryItems }
          : { libraryItems: [] };
      } catch {
        return null;
      }
    },
    async save(libraryData: { libraryItems: unknown }) {
      if (!kv) return;
      kv.setItem(key, JSON.stringify({ libraryItems: libraryData.libraryItems }));
    },
  };
}
