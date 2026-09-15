import type { PtElement, PtElementType, PtScene } from "../core/types";
import { ATMOS_LIGHT_CANVAS } from "./chrome";
import { canonicalColor, canonicalInk, displayColor, displayInk } from "./theme-palette";

/** Excalidraw Helvetica (local system font). Kept for stored scenes that already picked it. */
export const FONT_HELVETICA = 2;
const FONT_VIRGIL = 1;
/** Excalidraw 0.18 bundled handwritten face. */
export const FONT_EXCALIFONT = 5;
const DEFAULT_FONT_SIZE = 13;
const DEFAULT_LINE_HEIGHT = 1.25;

function layoutUnboundText(el: {
  y: number;
  height: number;
  text?: string;
  fontSize?: number;
  lineHeight?: number;
  verticalAlign?: "top" | "middle";
  containerId?: string | null;
}): { y: number; height: number } {
  if (el.containerId || el.verticalAlign === "top" || (el.text ?? "").includes("\n")) {
    return { y: el.y, height: el.height };
  }
  const lineH = Math.round((el.fontSize ?? DEFAULT_FONT_SIZE) * (el.lineHeight ?? DEFAULT_LINE_HEIGHT));
  if (el.height <= lineH + 1) return { y: el.y, height: el.height };
  return { y: el.y + (el.height - lineH) / 2, height: lineH };
}

export type ExcalidrawCompatElement = PtElement & {
  strokeStyle: "solid" | "dashed" | "dotted";
  version: number;
  link: string | null;
  index: string | null;
};

/**
 * Protocol `customData.pt` (id/type/children) or catalog PtMeta — both ride on the handle.
 * `ptv` is a first-level History stamp (Excalidraw 0.18 `isShallowEqual` skip).
 */
export type ScenePtCustomData = {
  pt?: { id?: string; type?: string; [key: string]: unknown };
  /** First-level scalar so `Delta.calculate` cannot skip `customData` after strip. */
  ptv?: number;
};

export type SceneCustomDataSource = {
  id?: string;
  versionNonce?: number;
  customData?: ScenePtCustomData;
};

function payloadSnapshotKey(el: { id?: string; versionNonce?: number }): string {
  return `${el.id ?? ""}@${el.versionNonce ?? ""}`;
}

const KNOWN_TYPES = new Set<string>([
  "rectangle",
  "ellipse",
  "text",
  "line",
  "arrow",
  "frame",
  "freedraw",
  "diamond",
  "image",
]);

const HANDLE_DEFAULTS = {
  strokeColor: "#1e1e1e",
  backgroundColor: "#fffef7",
  fillStyle: "solid" as const,
  strokeWidth: 2,
  strokeStyle: "solid" as const,
  roughness: 1,
  opacity: 100,
  groupIds: [] as string[],
  frameId: null as string | null,
  roundness: { type: 3, value: 12 } as { type: number; value?: number },
  seed: 1,
  version: 1,
  versionNonce: 1,
  index: null as string | null,
  isDeleted: false,
  boundElements: null as { id: string; type: string }[] | null,
  updated: 1,
  locked: false,
  link: null as string | null,
  angle: 0,
};

/**
 * Re-attach `customData` after convert. Upstream convert (and Excalidraw restore)
 * can drop it; extract/overlay only see page-level nodes when `customData.pt` survives.
 */
export function stampPtCustomData<T extends { id: string; customData?: ScenePtCustomData }>(
  converted: readonly T[],
  source: readonly SceneCustomDataSource[],
): T[] {
  const byId = new Map<string, ScenePtCustomData | undefined>();
  for (const el of source) {
    if (el.id) byId.set(el.id, el.customData);
  }
  return converted.map((el, i) => {
    const data = (el.id ? byId.get(el.id) : undefined) ?? source[i]?.customData;
    if (data === undefined) return el;
    return { ...el, customData: data };
  });
}

const HISTORY_STRIPPED_KEYS = new Set(["id", "updated", "version", "versionNonce", "seed"]);

/**
 * Excalidraw 0.18 `isShallowEqual` used by `Delta.distinctKeysIterator`: first
 * level only, `===` for nested objects (empty arrays equal).
 */
function isHistoryShallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === 0 && b.length === 0) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  return aKeys.every((key) => recA[key] === recB[key] || (Array.isArray(recA[key]) && Array.isArray(recB[key]) && recA[key].length === 0 && recB[key].length === 0));
}

/**
 * Distinct keys of two elements as Excalidraw `Delta.calculate` sees them
 * (shallow, skip when first-level values are `isShallowEqual`).
 */
export function excalidrawDistinctElementKeys(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): string[] {
  if (prev === next) return [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const distinct: string[] = [];
  for (const key of keys) {
    const left = prev[key];
    const right = next[key];
    if (left === right) continue;
    if (
      typeof left === "object" &&
      typeof right === "object" &&
      left !== null &&
      right !== null &&
      isHistoryShallowEqual(left, right)
    ) {
      continue;
    }
    distinct.push(key);
  }
  return distinct;
}

/**
 * After `versionNonce` differs, History strips `id/updated/version/versionNonce/seed`.
 * Remaining keys are the visible `ElementsChange` partial.
 */
export function stripIrrelevantHistoryProps(partial: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (HISTORY_STRIPPED_KEYS.has(key)) continue;
    stripped[key] = value;
  }
  return stripped;
}

/**
 * Forward delta for one element as Excalidraw `ElementsChange.calculate` +
 * `stripIrrelevantProps` would record it. Empty when nonce is unchanged or
 * every distinct key is stripped (payload-only apply with shared `customData`).
 */
export function excalidrawStrippedElementDelta(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): { deleted: Record<string, unknown>; inserted: Record<string, unknown> } | null {
  if (prev.versionNonce === next.versionNonce) return null;
  const deleted: Record<string, unknown> = {};
  const inserted: Record<string, unknown> = {};
  for (const key of excalidrawDistinctElementKeys(prev, next)) {
    deleted[key] = prev[key];
    inserted[key] = next[key];
  }
  const strippedDeleted = stripIrrelevantHistoryProps(deleted);
  const strippedInserted = stripIrrelevantHistoryProps(inserted);
  if (Object.keys(strippedDeleted).length === 0 && Object.keys(strippedInserted).length === 0) {
    return null;
  }
  return { deleted: strippedDeleted, inserted: strippedInserted };
}

/**
 * `newElementWith`-style apply of an inverse History partial (`{ ...el, ...inserted }`
 * from `entry.inverse()`, whose `inserted` is the pre-apply stripped values).
 */
export function applyHistoryInversePartial<T extends Record<string, unknown>>(
  el: T,
  inserted: Record<string, unknown>,
): T {
  return { ...el, ...inserted };
}

/**
 * Distinct `customData` so Excalidraw 0.18 `Delta.calculate` treats payload as a
 * changed shallow key. Nested `pt` is cloned; `ptv` is a first-level scalar tied
 * to `versionNonce` so `isShallowEqual({ pt })` cannot skip `customData` when
 * `pt` still shares the Store snapshot ref.
 */
export function cloneScenePtCustomData<T extends { versionNonce?: number; customData?: ScenePtCustomData }>(
  el: T,
): T {
  if (el.customData === undefined) return el;
  const pt = el.customData.pt === undefined ? undefined : structuredClone(el.customData.pt);
  const ptv = typeof el.versionNonce === "number" ? el.versionNonce : el.customData.ptv;
  return {
    ...el,
    customData: ptv === undefined ? { pt } : { pt, ptv },
  };
}

/**
 * Restore `customData.pt` when convert/restore stored geometry-only clones.
 * Copies **payload only** — never live `x` / `y` / `width` / `height` / `angle`
 * from the last project.
 *
 * Excalidraw 0.18 History records a change when `versionNonce` differs, then
 * **strips** `versionNonce` from the delta (`stripIrrelevantProps`) while
 * keeping `customData`. Undo therefore restores the pre-apply payload onto a
 * handle that still carries the **applied** nonce. Overwriting live `pt` from
 * that nonce snapshot would paste the Agent apply back on. Keep live payload;
 * only fill clones that dropped `customData`. Never refill a live nonce from
 * its own applied snapshot.
 *
 * Shape C: live undo often **drops** `customData` while **keeping** the applied
 * nonce. A later `id@appliedNonce` lookup in `lastProjectedPayload` would
 * re-paste the apply. `witnessedNonces` records keys that already appeared
 * **with** `pt` on a live read — do not refill those from the **applied**
 * snapshot. Restore payload from the **pre-apply** snapshot for that handle
 * (seed / earlier nonce in `mergePtPayloadSource` / first payload that is not
 * the applied nonce). Convert/restore-drop (never seen live with `pt`) still
 * fills by nonce. `clearWitnesses` on load / `history.clear` so first hydrate
 * can fill missing `customData`.
 */
export function fillMissingPtCustomData<T extends {
  id: string;
  versionNonce?: number;
  customData?: ScenePtCustomData;
}>(
  live: readonly T[],
  source: readonly SceneCustomDataSource[],
  witnessedNonces?: Set<string>,
): T[] {
  const bySnapshot = new Map<string, ScenePtCustomData | undefined>();
  const byId = new Map<string, ScenePtCustomData | undefined>();
  const byIdKey = new Map<string, string>();
  for (const el of source) {
    if (!el.id || !el.customData?.pt) continue;
    const snapKey = payloadSnapshotKey(el);
    bySnapshot.set(snapKey, el.customData);
    if (!byId.has(el.id)) {
      byId.set(el.id, el.customData);
      byIdKey.set(el.id, snapKey);
    }
  }
  return live.map((el, i) => {
    const key = payloadSnapshotKey(el);
    if (el.customData?.pt) {
      witnessedNonces?.add(key);
      return el;
    }
    if (typeof el.versionNonce === "number" && witnessedNonces?.has(key)) {
      const preApply = byId.get(el.id);
      if (preApply?.pt && byIdKey.get(el.id) !== key) {
        return { ...el, customData: preApply };
      }
      return el;
    }
    const snapshot = typeof el.versionNonce === "number" ? bySnapshot.get(key) : undefined;
    if (snapshot?.pt) {
      return { ...el, customData: snapshot };
    }
    if (typeof el.versionNonce === "number") return el;
    const data = (el.id ? byId.get(el.id) : undefined) ?? source[i]?.customData;
    if (!data?.pt) return el;
    return { ...el, customData: data };
  });
}

/** Payload-only source for `fillMissingPtCustomData` — drop frozen spatial from last project. */
export function ptPayloadSource(
  elements: readonly SceneCustomDataSource[],
): SceneCustomDataSource[] {
  return elements.map((el) => ({
    id: el.id,
    versionNonce: el.versionNonce,
    customData: el.customData,
  }));
}

/**
 * Keep payload snapshots across IMMEDIATELY projects so geometry-only clones
 * can refill by nonce. After undo, restamp may rewrite the applied-nonce slot
 * with the restored payload. Geometry-only clones (no `pt`) must not clobber
 * a stored snapshot.
 */
export function mergePtPayloadSource(
  previous: readonly SceneCustomDataSource[],
  incoming: readonly SceneCustomDataSource[],
): SceneCustomDataSource[] {
  const byKey = new Map<string, SceneCustomDataSource>();
  for (const el of previous) {
    if (!el.id) continue;
    byKey.set(payloadSnapshotKey(el), {
      id: el.id,
      versionNonce: el.versionNonce,
      customData: el.customData,
    });
  }
  for (const el of incoming) {
    if (!el.id || !el.customData?.pt) continue;
    byKey.set(payloadSnapshotKey(el), {
      id: el.id,
      versionNonce: el.versionNonce,
      customData: el.customData,
    });
  }
  return [...byKey.values()];
}

/**
 * Excalidraw History keys element identity on `versionNonce`. Programmatic
 * `IMMEDIATELY` writes must bump it so payload/geometry diffs enter undo.
 * Clone `customData` (new `pt` + first-level `ptv`) so `Delta.calculate` cannot
 * skip the payload after `stripIrrelevantProps`.
 */
export function bumpHandleVersions<T extends {
  version?: number;
  versionNonce?: number;
  customData?: ScenePtCustomData;
}>(elements: readonly T[]): T[] {
  return elements.map((el) =>
    cloneScenePtCustomData({
      ...el,
      version: (el.version ?? 1) + 1,
      versionNonce: (el.versionNonce ?? 1) + 1,
    }),
  );
}

/**
 * Live Excalidraw `getSceneElements` restamp. Keep History-restored `pt` on
 * the applied nonce; Shape C (dropped `customData`, applied nonce kept)
 * restores the pre-apply payload, not the applied snapshot.
 * `clearWitnesses` on document load (`history.clear`) so restore-drop can fill.
 */
export function createPtRestampState() {
  let lastHydrated: SceneCustomDataSource[] = [];
  const witnessedNonces = new Set<string>();
  return {
    ingest(elements: readonly SceneCustomDataSource[]) {
      lastHydrated = mergePtPayloadSource(lastHydrated, ptPayloadSource(elements));
    },
    restamp<T extends { id: string; versionNonce?: number; customData?: ScenePtCustomData }>(
      elements: readonly T[],
    ): T[] {
      const filled = fillMissingPtCustomData(elements, lastHydrated, witnessedNonces);
      lastHydrated = mergePtPayloadSource(lastHydrated, ptPayloadSource(filled));
      return filled;
    },
    clearWitnesses() {
      witnessedNonces.clear();
    },
  };
}

export function keepOverlayThroughEmptyLoad(
  current: { pages: { nodes: unknown[] }[] },
  incoming: { pages: { nodes: unknown[] }[] },
  loading: boolean,
): boolean {
  if (!loading) return false;
  return (incoming.pages[0]?.nodes.length ?? 0) === 0 && (current.pages[0]?.nodes.length ?? 0) > 0;
}

/**
 * Convert protocol handles / scene dumps into Excalidraw-shaped elements **without**
 * `customData`, then stamp `customData.pt` on. Window-free so bun tests can project
 * `{ ptx }` persist/load without `@excalidraw/excalidraw`.
 */
export function toExcalidrawCompatElements(elements: readonly unknown[]): ExcalidrawCompatElement[] {
  const converted = elements.map((raw): ExcalidrawCompatElement => {
    const el = raw as Record<string, unknown> & { id: string };
    const { customData: _dropped, ...rest } = el;
    void _dropped;
    const type = typeof rest.type === "string" && KNOWN_TYPES.has(rest.type) ? rest.type : "rectangle";
    return {
      ...HANDLE_DEFAULTS,
      ...rest,
      id: el.id,
      type: type as PtElementType,
      x: typeof rest.x === "number" ? rest.x : 0,
      y: typeof rest.y === "number" ? rest.y : 0,
      width: typeof rest.width === "number" ? rest.width : 0,
      height: typeof rest.height === "number" ? rest.height : 0,
      angle: typeof rest.angle === "number" ? rest.angle : 0,
    } as ExcalidrawCompatElement;
  });
  return stampPtCustomData(converted, elements as SceneCustomDataSource[]);
}

export type ExcalidrawHostApi = {
  updateScene: (input: {
    elements?: ExcalidrawCompatElement[];
    appState?: {
      viewBackgroundColor?: string;
      theme?: "light" | "dark";
      currentItemRoughness?: number;
      currentItemFontFamily?: number;
      currentItemStrokeColor?: string;
      currentItemBackgroundColor?: string;
      isBindingEnabled?: boolean;
      objectsSnapModeEnabled?: boolean;
      selectedElementIds?: Record<string, boolean>;
    };
  }) => void;
  scrollToContent: (
    target?: unknown,
    opts?: {
      animate?: boolean;
      duration?: number;
      fitToContent?: boolean;
      minZoom?: number;
      maxZoom?: number;
      canvasOffsets?: { top?: number; right?: number; bottom?: number; left?: number };
    },
  ) => void;
  getSceneElements: () => readonly ExcalidrawCompatElement[];
  getSceneElementsIncludingDeleted: () => readonly ExcalidrawCompatElement[];
  getFiles?: () => Record<string, unknown>;
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    width: number;
    height: number;
    viewBackgroundColor: string;
    selectedElementIds: Record<string, boolean>;
  };
};

export type OverlayViewport = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  viewModeEnabled?: boolean;
};

export function sameOverlayDocument(a: { version: string; pages: unknown }, b: { version: string; pages: unknown }): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function sameOverlayViewport(a: OverlayViewport, b: OverlayViewport): boolean {
  return (
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.zoom.value === b.zoom.value &&
    Boolean(a.viewModeEnabled) === Boolean(b.viewModeEnabled)
  );
}

export function sceneToExcalidrawElements(
  scene: PtScene,
  theme: "light" | "dark" = "light",
): ExcalidrawCompatElement[] {
  return scene.elements.map((el) => toCompat(el, theme));
}

export function excalidrawElementsToScene(
  elements: readonly ExcalidrawCompatElement[],
  _appState?: { viewBackgroundColor?: string },
  theme: "light" | "dark" = "light",
): PtScene {
  return {
    elements: elements
      .filter((el) => el.type !== ("selection" as PtElementType))
      .map((el) => fromCompat(el, theme)),
    appState: {
      // Display canvas is Atmos chrome. Persist the canonical light paper so
      // theme swaps do not rewrite the document.
      viewBackgroundColor: ATMOS_LIGHT_CANVAS,
    },
  };
}

export function sceneFingerprint(scene: PtScene): string {
  const elements = scene.elements
    .filter((el) => !el.isDeleted)
    .map((el) =>
      [
        el.id,
        el.type,
        el.x,
        el.y,
        el.width,
        el.height,
        el.angle ?? 0,
        el.roughness ?? "",
        el.opacity ?? "",
        el.strokeColor ?? "",
        el.backgroundColor ?? "",
        el.frameId ?? "",
        el.text ?? "",
        el.name ?? "",
        el.customData?.pt?.instanceId ?? "",
        el.customData?.pt?.componentType ?? "",
        JSON.stringify(el.customData?.pt?.props ?? {}),
      ].join(":"),
    )
    .join("|");
  return `${elements}#${scene.appState?.viewBackgroundColor ?? ""}`;
}

function isPtHandle(el: { customData?: { pt?: unknown } }): boolean {
  return Boolean(el.customData?.pt);
}

function isCatalogElement(el: { customData?: { pt?: { instanceId?: string; componentType?: string } } }): boolean {
  return Boolean(el.customData?.pt?.instanceId || el.customData?.pt?.componentType);
}

function toCompat(el: PtElement, theme: "light" | "dark"): ExcalidrawCompatElement {
  const textBox = el.type === "text" ? layoutUnboundText(el) : null;
  const pt = isPtHandle(el);
  const remap = !pt && isCatalogElement(el);
  return {
    ...el,
    strokeColor: pt
      ? (el.strokeColor ?? HANDLE_DEFAULTS.strokeColor)
      : remap
        ? displayColor(el.strokeColor, theme)
        : displayInk(el.strokeColor, theme),
    backgroundColor: pt
      ? (el.backgroundColor ?? HANDLE_DEFAULTS.backgroundColor)
      : remap
        ? displayColor(el.backgroundColor, theme)
        : displayInk(el.backgroundColor, theme),
    startBinding: el.startBinding ?? null,
    endBinding: el.endBinding ?? null,
    strokeStyle: el.strokeStyle ?? "solid",
    version: el.version ?? 1,
    link: el.link ?? null,
    index: el.index ?? null,
    angle: el.angle ?? 0,
    groupIds: el.groupIds ?? [],
    frameId: el.frameId ?? null,
    boundElements: el.boundElements ?? null,
    locked: el.locked ?? false,
    isDeleted: el.isDeleted ?? false,
    roughness: el.roughness ?? 1,
    opacity: el.opacity ?? 100,
    fillStyle: el.fillStyle ?? "solid",
    y: textBox?.y ?? el.y,
    height: textBox?.height ?? el.height,
    fontFamily: el.type === "text" ? visibleTextFont(el.fontFamily) : el.fontFamily,
    lineHeight: el.type === "text" ? (el.lineHeight ?? 1.25) : el.lineHeight,
    autoResize: el.type === "text" ? (el.autoResize ?? false) : el.autoResize,
    containerId: el.type === "text" ? (el.containerId ?? null) : el.containerId,
  };
}

function fromCompat(el: ExcalidrawCompatElement, theme: "light" | "dark"): PtElement {
  const type = KNOWN_TYPES.has(el.type) ? (el.type as PtElementType) : "rectangle";
  const pt = isPtHandle(el);
  const remap = !pt && isCatalogElement(el);
  return {
    ...el,
    type,
    strokeColor: pt
      ? el.strokeColor
      : remap
        ? canonicalColor(el.strokeColor, theme)
        : canonicalInk(el.strokeColor, theme),
    backgroundColor: pt
      ? el.backgroundColor
      : remap
        ? canonicalColor(el.backgroundColor, theme)
        : canonicalInk(el.backgroundColor, theme),
    startBinding: el.startBinding ?? null,
    endBinding: el.endBinding ?? null,
    fontFamily: el.type === "text" ? visibleTextFont(el.fontFamily) : el.fontFamily,
    groupIds: [...(el.groupIds ?? [])],
    frameId: el.frameId ?? null,
    customData: el.customData,
  };
}

/** Virgil (1) needs a downloaded face. Excalifont (5) ships with Excalidraw 0.18. */
export function visibleTextFont(fontFamily: number | undefined): number {
  if (!fontFamily || fontFamily === FONT_VIRGIL) return FONT_EXCALIFONT;
  return fontFamily;
}
