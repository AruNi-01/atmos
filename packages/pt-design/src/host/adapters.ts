import type { HandoffPayload } from "../ir/handoff";
import type { PtScene } from "../core/types";

export type PersistenceAdapter = {
  load(): Promise<{ scene: PtScene } | null>;
  save(input: { scene: PtScene }): Promise<void>;
};

export type HandoffSink = {
  accept(payload: HandoffPayload): void | Promise<void>;
};

export type PtTheme = "light" | "dark" | "system";

export function memoryPersistence(initial?: PtScene): PersistenceAdapter {
  let scene = initial ?? null;
  return {
    async load() {
      return scene ? { scene } : null;
    },
    async save(input) {
      scene = input.scene;
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
        return JSON.parse(raw) as { scene: PtScene };
      } catch {
        return null;
      }
    },
    async save(input) {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify({ scene: input.scene }));
    },
  };
}
