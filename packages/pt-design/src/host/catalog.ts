import {
  parsePtPersistV2,
  type PtDesignMeta,
  type PtDesignOpenMode,
  type PtDesignScope,
  type PtPersistV2,
} from "./adapters";
import {
  contentBoundsFromPersist,
  isLiveRasterPreview,
  previewNeedsRegen,
} from "./preview";
import { deletePreviewBlob } from "./preview-blob";

export type PtDesignHostContext =
  | { kind: "global" }
  | { kind: "project"; projectId: string }
  | { kind: "workspace"; workspaceId: string };

export type { PtDesignMeta, PtDesignOpenMode, PtDesignScope, PtPersistV2 };
export {
  contentBoundsFromPersist,
  isLiveRasterPreview,
  isPreviewBlobPointer,
  isSketchWireframePreview,
  parsePreviewViewBox,
  previewNeedsRegen,
  sketchPreviewFromPersist,
} from "./preview";
export {
  deletePreviewBlob,
  getPreviewBlob,
  getPreviewObjectUrl,
  persistPreviewImage,
  previewBlobId,
  previewBlobPointer,
} from "./preview-blob";

export const PT_DESIGN_V2_PREFIX = "pt-design/v2/";
export const PT_DESIGN_CREATED_ID_PREFIX = "doc-";
export const PT_DESIGN_EMPTY_PTX = `<page id="page"></page>\n`;

export type PtDesignFilterScope = "all" | PtDesignScope;

export type PtDesignListed = {
  id: string;
  key: string;
  doc: PtPersistV2;
  meta: PtDesignMeta;
};

export type PinGroup<T> = {
  pinned: T[];
  rest: T[];
};

function readStorage(storage?: Storage | null): Storage | null {
  if (storage) return storage;
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function ptDesignDocKey(id: string): string {
  return `${PT_DESIGN_V2_PREFIX}${id}`;
}

export function ptDesignIdFromKey(key: string): string | null {
  if (!key.startsWith(PT_DESIGN_V2_PREFIX)) return null;
  const id = key.slice(PT_DESIGN_V2_PREFIX.length);
  if (!id || id.includes("/") || id.includes(":")) return null;
  return id;
}

export function createPtDesignId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `${PT_DESIGN_CREATED_ID_PREFIX}${uuid}`;
}

export function isGlobalDesignId(id: string): boolean {
  return id === "global" || id === "default" || id.startsWith(PT_DESIGN_CREATED_ID_PREFIX);
}

export function inferPtDesignIdentity(id: string): Pick<PtDesignMeta, "scope" | "openMode"> {
  if (isGlobalDesignId(id)) return { scope: "global", openMode: "canvas" };
  return { scope: "workspace", openMode: "center-tab" };
}

function fittedPreview(doc: PtPersistV2 | null | undefined, stored?: PtDesignMeta): {
  preview?: string;
  previewFit?: "content";
} {
  const bounds = doc ? contentBoundsFromPersist(doc) : null;
  if (
    isLiveRasterPreview(stored?.preview) &&
    !previewNeedsRegen(stored?.preview, bounds, stored?.previewFit)
  ) {
    return { preview: stored?.preview, previewFit: "content" };
  }
  return {};
}

export function inferPtDesignMeta(id: string, doc?: PtPersistV2 | null): PtDesignMeta {
  const identity = inferPtDesignIdentity(id);
  const stored = doc?.meta;
  const fitted = fittedPreview(doc, stored);
  const meta: PtDesignMeta = {
    id,
    name: stored?.name ?? "",
    scope: stored?.scope ?? identity.scope,
    pinned: stored?.pinned === true,
    pinOrder: stored?.pinOrder ?? 0,
    updatedAt: stored?.updatedAt ?? Date.now(),
    openMode: stored?.openMode ?? identity.openMode,
  };
  if (stored?.projectId) meta.projectId = stored.projectId;
  if (stored?.workspaceId) meta.workspaceId = stored.workspaceId;
  if (identity.scope === "workspace" && !meta.workspaceId) meta.workspaceId = id;
  if (identity.scope === "project" && !meta.projectId) meta.projectId = id;
  if (fitted.preview) meta.preview = fitted.preview;
  if (fitted.previewFit) meta.previewFit = fitted.previewFit;
  return meta;
}

export function withEnsuredMeta(id: string, doc: PtPersistV2): { doc: PtPersistV2; changed: boolean } {
  const nextMeta = inferPtDesignMeta(id, doc);
  const same =
    doc.meta &&
    doc.meta.id === nextMeta.id &&
    doc.meta.name === nextMeta.name &&
    doc.meta.scope === nextMeta.scope &&
    doc.meta.pinned === nextMeta.pinned &&
    doc.meta.pinOrder === nextMeta.pinOrder &&
    doc.meta.updatedAt === nextMeta.updatedAt &&
    doc.meta.openMode === nextMeta.openMode &&
    doc.meta.preview === nextMeta.preview &&
    doc.meta.previewFit === nextMeta.previewFit &&
    doc.meta.projectId === nextMeta.projectId &&
    doc.meta.workspaceId === nextMeta.workspaceId;
  if (same) return { doc, changed: false };
  return { doc: { ...doc, meta: nextMeta }, changed: true };
}

export function designListedInHost(
  meta: Pick<PtDesignMeta, "id" | "scope" | "projectId" | "workspaceId">,
  host: PtDesignHostContext,
): boolean {
  if (host.kind === "global") return true;
  if (host.kind === "project") {
    return meta.scope === "project" && (meta.projectId === host.projectId || meta.id === host.projectId);
  }
  return meta.scope === "workspace" && (meta.workspaceId === host.workspaceId || meta.id === host.workspaceId);
}

export function filterPtDesignsByHost<T extends { meta: Pick<PtDesignMeta, "id" | "scope" | "projectId" | "workspaceId"> }>(
  items: T[],
  host: PtDesignHostContext,
): T[] {
  if (host.kind === "global") return items;
  return items.filter((item) => designListedInHost(item.meta, host));
}

function parseStored(raw: string | null): PtPersistV2 | null {
  if (!raw) return null;
  try {
    return parsePtPersistV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeDoc(storage: Storage, key: string, doc: PtPersistV2): void {
  storage.setItem(key, JSON.stringify(doc));
}

export function listPtDesignDocs(storage?: Storage | null): PtDesignListed[] {
  const store = readStorage(storage);
  if (!store) return [];
  const listed: PtDesignListed[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key) continue;
    const id = ptDesignIdFromKey(key);
    if (!id) continue;
    const parsed = parseStored(store.getItem(key));
    if (!parsed) continue;
    const ensured = withEnsuredMeta(id, parsed);
    if (ensured.changed) writeDoc(store, key, ensured.doc);
    listed.push({
      id,
      key,
      doc: ensured.doc,
      meta: ensured.doc.meta ?? inferPtDesignMeta(id, ensured.doc),
    });
  }
  listed.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
  return listed;
}

export function filterPtDesigns<T extends { meta: Pick<PtDesignMeta, "scope"> }>(
  items: T[],
  scope: PtDesignFilterScope,
): T[] {
  if (scope === "all") return items;
  return items.filter((item) => item.meta.scope === scope);
}

export function groupPinnedPtDesigns<T extends { meta: Pick<PtDesignMeta, "pinned" | "pinOrder" | "updatedAt"> }>(
  items: T[],
): PinGroup<T> {
  const pinned = items
    .filter((item) => item.meta.pinned)
    .sort((a, b) => {
      if (a.meta.pinOrder !== b.meta.pinOrder) return a.meta.pinOrder - b.meta.pinOrder;
      return b.meta.updatedAt - a.meta.updatedAt;
    });
  const rest = items
    .filter((item) => !item.meta.pinned)
    .sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
  return { pinned, rest };
}

function patchListed(
  storage: Storage,
  id: string,
  patch: (meta: PtDesignMeta, doc: PtPersistV2) => PtDesignMeta | null,
): PtDesignListed | null {
  const key = ptDesignDocKey(id);
  const parsed = parseStored(storage.getItem(key));
  if (!parsed) return null;
  const currentMeta = parsed.meta ?? inferPtDesignMeta(id, parsed);
  const nextMeta = patch(currentMeta, parsed);
  if (!nextMeta) {
    storage.removeItem(key);
    storage.removeItem(`${key}:file`);
    return null;
  }
  const nextDoc = { ...parsed, meta: nextMeta };
  writeDoc(storage, key, nextDoc);
  return { id, key, doc: nextDoc, meta: nextMeta };
}

export function renamePtDesign(
  id: string,
  name: string,
  storage?: Storage | null,
): PtDesignListed | null {
  const store = readStorage(storage);
  if (!store) return null;
  const trimmed = name.trim();
  return patchListed(store, id, (meta) => ({
    ...meta,
    name: trimmed,
  }));
}

export function setPtDesignPinned(
  id: string,
  pinned: boolean,
  storage?: Storage | null,
  now = Date.now(),
): PtDesignListed | null {
  const store = readStorage(storage);
  if (!store) return null;
  return patchListed(store, id, (meta) => ({
    ...meta,
    pinned,
    pinOrder: pinned ? (meta.pinned ? meta.pinOrder : now) : 0,
    updatedAt: meta.updatedAt,
  }));
}

export function deletePtDesign(id: string, storage?: Storage | null): boolean {
  const store = readStorage(storage);
  if (!store) return false;
  const key = ptDesignDocKey(id);
  if (store.getItem(key) == null) return false;
  store.removeItem(key);
  store.removeItem(`${key}:file`);
  void deletePreviewBlob(id);
  return true;
}

export function createPtDesignDoc(
  input: {
    name?: string;
    scope?: PtDesignScope;
    openMode?: PtDesignOpenMode;
    projectId?: string;
    workspaceId?: string;
    id?: string;
  } = {},
  storage?: Storage | null,
): PtDesignListed | null {
  const store = readStorage(storage);
  if (!store) return null;
  const id = input.id ?? createPtDesignId();
  const meta: PtDesignMeta = {
    id,
    name: input.name?.trim() ?? "",
    scope: input.scope ?? "global",
    pinned: false,
    pinOrder: 0,
    updatedAt: Date.now(),
    openMode: input.openMode ?? "canvas",
  };
  if (input.projectId) meta.projectId = input.projectId;
  if (input.workspaceId) meta.workspaceId = input.workspaceId;
  const doc: PtPersistV2 = { ptx: PT_DESIGN_EMPTY_PTX, meta };
  const key = ptDesignDocKey(id);
  writeDoc(store, key, doc);
  return { id, key, doc, meta };
}

export function mergePtDesignMeta(
  stored: PtDesignMeta | undefined,
  host: Partial<PtDesignMeta> | undefined,
  id: string,
  doc?: PtPersistV2 | null,
): PtDesignMeta {
  const inferred = inferPtDesignMeta(id, doc);
  return {
    ...inferred,
    ...host,
    ...stored,
    id,
    scope: host?.scope ?? stored?.scope ?? inferred.scope,
    openMode: stored?.openMode ?? host?.openMode ?? inferred.openMode,
    projectId: host?.projectId ?? stored?.projectId ?? inferred.projectId,
    workspaceId: host?.workspaceId ?? stored?.workspaceId ?? inferred.workspaceId,
    name: stored?.name ?? host?.name ?? inferred.name,
    pinned: stored?.pinned ?? inferred.pinned,
    pinOrder: stored?.pinOrder ?? inferred.pinOrder,
    preview: isLiveRasterPreview(stored?.preview)
      ? stored?.preview
      : isLiveRasterPreview(inferred.preview)
        ? inferred.preview
        : undefined,
    previewFit: isLiveRasterPreview(stored?.preview) || isLiveRasterPreview(inferred.preview)
      ? "content"
      : undefined,
    updatedAt: stored?.updatedAt ?? inferred.updatedAt,
  };
}
