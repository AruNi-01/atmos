export type PtDesignSettings = { radius?: string };

export type PtDesignScope = "global" | "project" | "workspace";
export type PtDesignOpenMode = "canvas" | "center-tab";

export type PtDesignMeta = {
  id: string;
  name: string;
  scope: PtDesignScope;
  projectId?: string;
  workspaceId?: string;
  pinned: boolean;
  pinOrder: number;
  updatedAt: number;
  /** PNG/JPEG/WebP data URL, or `idb:pt-preview/{id}` pointing at the blob store. */
  preview?: string;
  /** Set when `preview` is cropped to content bounds (not a camera viewport). */
  previewFit?: "content";
  openMode: PtDesignOpenMode;
};

export type PtPersistV2 = {
  ptx: string;
  canvas?: unknown;
  files?: unknown;
  settings?: PtDesignSettings;
  meta?: PtDesignMeta;
};

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
  load(name: string): Promise<{ name: string; persist: PtPersistV2 }>;
  save(name: string, persist: PtPersistV2): Promise<{ name: string }>;
};

export type HandoffSink = {
  accept(payload: { ptx: string }): void | Promise<void>;
};

export type PtTheme = "light" | "dark" | "system";

const SCOPES = new Set<PtDesignScope>(["global", "project", "workspace"]);
const OPEN_MODES = new Set<PtDesignOpenMode>(["canvas", "center-tab"]);

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

export function parsePtDesignMeta(value: unknown): PtDesignMeta | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.id !== "string" || rec.id.trim() === "") return null;
  if (typeof rec.name !== "string") return null;
  if (typeof rec.scope !== "string" || !SCOPES.has(rec.scope as PtDesignScope)) return null;
  if (typeof rec.openMode !== "string" || !OPEN_MODES.has(rec.openMode as PtDesignOpenMode)) {
    return null;
  }
  const updatedAt = asFiniteNumber(rec.updatedAt);
  if (updatedAt === undefined) return null;
  const meta: PtDesignMeta = {
    id: rec.id,
    name: rec.name,
    scope: rec.scope as PtDesignScope,
    pinned: rec.pinned === true,
    pinOrder: asFiniteNumber(rec.pinOrder) ?? 0,
    updatedAt,
    openMode: rec.openMode as PtDesignOpenMode,
  };
  if (typeof rec.projectId === "string" && rec.projectId) meta.projectId = rec.projectId;
  if (typeof rec.workspaceId === "string" && rec.workspaceId) meta.workspaceId = rec.workspaceId;
  if (typeof rec.preview === "string" && rec.preview) meta.preview = rec.preview;
  if (rec.previewFit === "content") meta.previewFit = "content";
  return meta;
}

export function parsePtPersistV2(value: unknown): PtPersistV2 | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.ptx !== "string") return null;
  const doc: PtPersistV2 = { ptx: rec.ptx };
  if ("canvas" in rec) doc.canvas = rec.canvas;
  if ("files" in rec) doc.files = rec.files;
  if (rec.settings && typeof rec.settings === "object") {
    const settings = rec.settings as Record<string, unknown>;
    const next: PtDesignSettings = {};
    if (typeof settings.radius === "string") next.radius = settings.radius;
    if (next.radius !== undefined) doc.settings = next;
  }
  const meta = parsePtDesignMeta(rec.meta);
  if (meta) doc.meta = meta;
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
        return parsePtPersistV2(JSON.parse(raw));
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
