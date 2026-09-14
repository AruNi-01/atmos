import type { PtScene } from "../core/types";

export type PtPersistV2 = { ptx: string; canvas?: unknown; files?: unknown };

export type PersistenceAdapter = {
  load(): Promise<PtPersistV2 | null>;
  save(doc: PtPersistV2): Promise<void>;
};

export type DesignLibraryItem = {
  name: string;
  modifiedAt?: number;
};

export type DesignLibrary = {
  list(): Promise<DesignLibraryItem[]>;
  load(name: string): Promise<{ name: string; scene: PtScene }>;
  save(name: string, scene: PtScene): Promise<{ name: string }>;
};

export type HandoffSink = {
  accept(payload: { ptx: string }): void | Promise<void>;
};

export type PtTheme = "light" | "dark" | "system";

function asPersistV2(value: unknown): PtPersistV2 | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.ptx !== "string") return null;
  const doc: PtPersistV2 = { ptx: rec.ptx };
  if ("canvas" in rec) doc.canvas = rec.canvas;
  if ("files" in rec) doc.files = rec.files;
  return doc;
}

export function memoryPersistence(initial?: PtPersistV2 | null): PersistenceAdapter {
  let doc = initial ?? null;
  return {
    async load() {
      return doc;
    },
    async save(input) {
      doc = input;
    },
  };
}

export function localStoragePersistence(key: string): PersistenceAdapter {
  return {
    async load() {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        return asPersistV2(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async save(input) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify(input));
    },
  };
}
