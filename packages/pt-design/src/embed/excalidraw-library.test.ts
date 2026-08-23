import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EXCALIDRAW_LIBRARY_STORAGE_KEY,
  EXCALIDRAW_LIBRARY_WINDOW_NAME,
  bindExcalidrawLibraryWindowName,
  localStorageLibraryAdapter,
} from "./excalidraw-library";

describe("excalidraw published library install", () => {
  test("board listens for #addLibrary and names the window for same-tab return", () => {
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    expect(board).toContain("useHandleLibrary");
    expect(board).toContain("bindExcalidrawLibraryWindowName");
    expect(board).toContain("localStorageLibraryAdapter");
    expect(board).toContain("libraryHost");
    expect(board).not.toMatch(/excalidrawAPI=\{\(api\) => \{[\s\S]*setLibraryHost/);
  });

  test("bindExcalidrawLibraryWindowName fills an empty name and leaves an existing one", () => {
    const empty = { name: "" };
    bindExcalidrawLibraryWindowName(empty);
    expect(empty.name).toBe(EXCALIDRAW_LIBRARY_WINDOW_NAME);
    bindExcalidrawLibraryWindowName(empty);
    expect(empty.name).toBe(EXCALIDRAW_LIBRARY_WINDOW_NAME);
    const named = { name: "already" };
    bindExcalidrawLibraryWindowName(named);
    expect(named.name).toBe("already");
  });

  test("adapter round-trips library items and ignores corrupt JSON", async () => {
    const store = new Map<string, string>();
    const kv = {
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    };
    const adapter = localStorageLibraryAdapter(EXCALIDRAW_LIBRARY_STORAGE_KEY, kv);
    expect(await adapter.load()).toBeNull();
    const items = [{ id: "lib-1", status: "published", created: 1, elements: [] }];
    await adapter.save({ libraryItems: items });
    expect(await adapter.load()).toEqual({ libraryItems: items });
    store.set(EXCALIDRAW_LIBRARY_STORAGE_KEY, "{not-json");
    expect(await adapter.load()).toBeNull();
    store.set(EXCALIDRAW_LIBRARY_STORAGE_KEY, JSON.stringify({}));
    expect(await adapter.load()).toEqual({ libraryItems: [] });
  });
});
