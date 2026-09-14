import { afterEach, describe, expect, test } from "bun:test";
import { localStoragePersistence, memoryPersistence } from "./adapters";

type MemoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const storage: MemoryStorage = {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return store;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("S28 old storage key ignored", () => {
  test("v1 scene blob at the old key does not load as a v2 document", async () => {
    const store = installLocalStorage();
    const v1 = { elements: [{ id: "old", type: "rectangle" }], appState: { viewBackgroundColor: "#fff" } };
    store.set("pt-design:scene:global", JSON.stringify(v1));
    const v2 = localStoragePersistence("pt-design/v2/global");
    expect(await v2.load()).toBeNull();
    expect(await localStoragePersistence("pt-design:scene:global").load()).toBeNull();
  });

  test("v1 blob at the v2 key is ignored without throwing", async () => {
    const store = installLocalStorage();
    store.set(
      "pt-design/v2/global",
      JSON.stringify({ elements: [{ id: "old" }], appState: {} }),
    );
    const adapter = localStoragePersistence("pt-design/v2/global");
    expect(await adapter.load()).toBeNull();
  });

  test("valid v2 persist round-trips; memory adapter starts empty", async () => {
    installLocalStorage();
    const adapter = localStoragePersistence("pt-design/v2/ws-1");
    const doc = { ptx: `<page id="p"></page>\n`, canvas: { zoom: 1 } };
    await adapter.save(doc);
    expect(await adapter.load()).toEqual(doc);
    expect(await memoryPersistence().load()).toBeNull();
  });
});
