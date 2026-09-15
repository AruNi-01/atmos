import { createApplyGate } from "./apply-gate";
import {
  extractDocument,
  parsePtx,
  projectDocument,
  serializePtx,
  type HandleElement,
  type PtDocument,
} from "../protocol";
import {
  bumpHandleVersions,
  cloneScenePtCustomData,
  fillMissingPtCustomData,
  mergePtPayloadSource,
  ptPayloadSource,
  toExcalidrawCompatElements,
} from "./scene-bridge";

export type Capture = "IMMEDIATELY" | "EVENTUALLY" | "NEVER";

/**
 * After a real IMMEDIATELY, same-window follow-up IMMEDIATELY writes must not
 * push a visible decoy onto History (Cmd+Z would undo the decoy, not payload).
 * The first payload call sees `recentlyImmediate === false` and stays IMMEDIATELY.
 */
export function followUpImmediateCapture(capture: Capture, recentlyImmediate: boolean): Capture {
  if (recentlyImmediate && capture === "IMMEDIATELY") return "NEVER";
  return capture;
}

/**
 * History.record is sync, but undo/redo `disabled` waits on useEffect paint.
 * HTML disabled buttons ignore `.click()`, so force-enable then click.
 * Missing control (Interact / viewMode / no chrome) is a no-op.
 */
export function clickExcalidrawHistoryControl(
  btn: { disabled: boolean; click(): void } | null | undefined,
): void {
  if (btn == null) return;
  btn.disabled = false;
  btn.click();
}

/**
 * Peel a same-tick History decoy left on top of an IMMEDIATELY apply.
 * Uses Excalidraw's own undo/redo controls (caller clicks them) — not a
 * second PTX journal. If undo does not change extract, the popped entry was
 * the decoy and payload stays; do not redo. If extract changes, the popped
 * entry was the apply — schedule redo on `afterPaint` (another rAF / microtask).
 * Same-tick redo does not restore Excalidraw 0.18 History.
 * `undoDisabled` is only "control missing" — never the stale `button.disabled`.
 * Caller must query undo/redo at click time: React replaces History buttons
 * after undo, so a redo node captured before this call is a no-op.
 */
export function peelImmediateHistoryDecoy(opts: {
  extractPtx: () => string;
  undoDisabled: boolean;
  undo: () => void;
  redo: () => void;
  afterPaint: (cb: () => void) => void;
}): void {
  if (opts.undoDisabled) return;
  const applied = opts.extractPtx();
  opts.undo();
  if (opts.extractPtx() === applied) return;
  opts.afterPaint(() => {
    opts.redo();
  });
}

/** Alias: same two-phase peel. Sync tests pass `afterPaint: (cb) => cb()`. */
export const trimImmediateHistoryDecoy = peelImmediateHistoryDecoy;

/**
 * Edit Cmd+Z: pop at most two native History entries so a visible
 * appState-only selection increment (overlay `force: true` hit on a handle)
 * does not swallow the payload/drag underneath.
 *
 * Do not read extract on the same tick as the first undo — Excalidraw 0.18
 * `setState` may not have flushed, so unchanged XML would extra-pop (S21).
 * Callers pass `requestAnimationFrame`; tests may pass `(cb) => cb()` only
 * when fake extract already updates inside `click`.
 *
 * Native undo must go through `clickExcalidrawHistoryControl` (stale
 * `button.disabled`). Re-query the control before each click — React
 * replaces History buttons after undo. Do not call this from apply.
 */
export function undoThroughSelectionDecoy(opts: {
  extractPtx: () => string;
  queryUndoControl: () => { disabled: boolean; click(): void } | null | undefined;
  afterPaint: (cb: () => void) => void;
}): void {
  if (opts.queryUndoControl() == null) return;
  const before = opts.extractPtx();
  clickExcalidrawHistoryControl(opts.queryUndoControl());
  opts.afterPaint(() => {
    if (opts.extractPtx() !== before) return;
    if (opts.queryUndoControl() == null) return;
    clickExcalidrawHistoryControl(opts.queryUndoControl());
  });
}

/** Live-scene extract for peel compare — not a parallel PT store. */
export function sceneExtractPtx(elements: readonly HandleElement[]): string {
  return serializePtx(extractDocument(elements));
}

/**
 * Board-level flag: `bindHostApi.updateScene(IMMEDIATELY)` arms it so the same
 * frame's theme-ink `queueMicrotask` does not `updateScene` (elements or
 * `currentItemStrokeColor`). Excalidraw 0.18 may still `captureIncrement` on a
 * NEVER color write via `componentDidUpdate` → `store.commit`.
 */
const skipInkAfterImmediate = new WeakMap<object, boolean>();

export function armSkipInkAfterImmediate(api: object): void {
  skipInkAfterImmediate.set(api, true);
}

export function isSkipInkAfterImmediate(api: object | null | undefined): boolean {
  return api != null && skipInkAfterImmediate.get(api) === true;
}

/** Clear after this round's ink microtask so later theme ink still runs. */
export function scheduleClearSkipInkAfterImmediate(api: object | null | undefined): void {
  if (api == null) return;
  queueMicrotask(() => {
    const clear = () => {
      skipInkAfterImmediate.delete(api);
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(clear);
    } else {
      queueMicrotask(clear);
    }
  });
}

/**
 * Edit owns Excalidraw undo: listen on `document` so overlay force-focus cannot
 * swallow Cmd+Z. Interact must not — viewMode already refuses undo, and the
 * document listener must be off so Interact Cmd+Z cannot pop board history.
 */
export function editModeHandlesKeyboardGlobally(viewModeEnabled: boolean): boolean {
  return viewModeEnabled !== true;
}

function isExcalidrawWritableUndoTarget(target: EventTarget | null): boolean {
  if (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement) return true;
  if (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) {
    return target.type === "text" || target.type === "number" || target.type === "password";
  }
  return (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    (target.isContentEditable || target.dataset.type === "wysiwyg")
  );
}

/**
 * Capture-phase board Cmd+Z in Edit (not while typing). Interact must not take
 * this path. Caller invokes Excalidraw's own undo control — not a second stack.
 */
export function editBoardCapturesUndoHotkey(
  viewModeEnabled: boolean,
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    target: EventTarget | null;
  },
): boolean {
  if (viewModeEnabled) return false;
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return false;
  if (event.key.toLowerCase() !== "z") return false;
  return !isExcalidrawWritableUndoTarget(event.target);
}

export type ExcalidrawHost = {
  getSceneElements(): readonly HandleElement[];
  getAppState(): {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    viewModeEnabled?: boolean;
  };
  updateScene(opts: {
    elements?: HandleElement[];
    appState?: Record<string, unknown>;
    captureUpdate: Capture;
  }): void;
  history?: { clear: () => void };
  addFiles?(files: unknown[]): void;
};

export type PersistSnapshot = { ptx?: string; canvas?: unknown; files?: unknown };

export type LiveBoard = {
  extract(): PtDocument;
  extractPtx(): string;
  applyPtx(xml: string, capture: Capture): void;
  applyDocument(doc: PtDocument, capture: Capture): void;
  setMode(mode: "edit" | "interact"): void;
  getMode(): "edit" | "interact";
  clearHistoryOnLoad(): void;
  onHostChange(): { echo: boolean; document: PtDocument };
  loadPersist(loaded: PersistSnapshot | null | undefined): void;
  disarmLoadRecover(): void;
};

/**
 * Viewport-only write. Must not create an undo increment — apply already used
 * the single IMMEDIATELY `updateScene`. Do not call Excalidraw `scrollToContent`
 * (0.18 records camera History by default).
 */
export function applySceneCameraNever(
  host: Pick<ExcalidrawHost, "getAppState" | "updateScene">,
  camera?: { scrollX?: number; scrollY?: number; zoom?: { value: number } },
): void {
  const current = host.getAppState();
  host.updateScene({
    appState: {
      scrollX: camera?.scrollX ?? current.scrollX,
      scrollY: camera?.scrollY ?? current.scrollY,
      zoom: camera?.zoom ?? current.zoom,
    },
    captureUpdate: "NEVER",
  });
}

/**
 * Capture strings match Excalidraw `CaptureUpdateAction` values. This module does
 * not import that package: bun tests have no `window`, and the host API is
 * typed to `Capture` so tests can assert `captureUpdate` directly.
 */
export function createLiveBoard(host: ExcalidrawHost): LiveBoard {
  const gate = createApplyGate();
  let mode: "edit" | "interact" = host.getAppState().viewModeEnabled === true ? "interact" : "edit";
  let lastProjectedScene: HandleElement[] = [];
  let lastProjectedPayload: ReturnType<typeof ptPayloadSource> = [];
  let lastCapture: Capture = "NEVER";
  let recoverEmptyLoad = false;
  /** Blocks a second IMMEDIATELY apply until the first call stack unwinds. */
  let immediateApplyLock = false;
  /**
   * Incoming `serializePtx` of the last IMMEDIATELY write. Live hydrate can make
   * `extractPtx()` and `extract(lastProjected)` differ from that string, so the
   * skip key must be the incoming canonical — not extract after project.
   */
  let lastImmediateCanonical: string | null = null;
  const witnessedNonces = new Set<string>();

  const readScene = (): HandleElement[] => {
    const filled = fillMissingPtCustomData(
      host.getSceneElements(),
      lastProjectedPayload,
      witnessedNonces,
    );
    return filled as HandleElement[];
  };

  const extract = (): PtDocument => extractDocument(readScene());
  const extractPtx = (): string => serializePtx(extract());

  const sceneIsEmpty = (): boolean =>
    host.getSceneElements().filter((el) => !el.isDeleted).length === 0;

  const pushScene = (opts: {
    elements?: HandleElement[];
    appState?: Record<string, unknown>;
    captureUpdate: Capture;
  }): void => {
    gate.begin();
    lastCapture = opts.captureUpdate;
    let elements = opts.elements
      ? (toExcalidrawCompatElements(opts.elements) as unknown as HandleElement[])
      : undefined;
    if (elements && opts.captureUpdate === "IMMEDIATELY") {
      elements = bumpHandleVersions(elements);
    }
    if (elements) {
      lastProjectedScene = elements.map((el) => cloneScenePtCustomData({ ...el }));
      lastProjectedPayload = mergePtPayloadSource(
        lastProjectedPayload,
        ptPayloadSource(lastProjectedScene),
      );
    }
    host.updateScene({
      ...opts,
      ...(elements ? { elements } : {}),
    });
  };

  const applyDocumentCore = (doc: PtDocument, capture: Capture): void => {
    if (capture === "IMMEDIATELY") recoverEmptyLoad = false;
    const elements = projectDocument(doc, readScene());
    pushScene({ elements, captureUpdate: capture });
  };

  /**
   * Same-tick re-entry (`updateScene` → onChange → apply) still sees pre-apply
   * extract, so canonical-XML skip cannot help. Hold the lock through
   * `pushScene` and until this stack returns; a second IMMEDIATELY must not
   * `updateScene`.
   */
  const withImmediateApplyLock = (fn: () => void): void => {
    if (immediateApplyLock) return;
    immediateApplyLock = true;
    try {
      fn();
    } finally {
      immediateApplyLock = false;
    }
  };

  const applyImmediateIfNew = (doc: PtDocument): void => {
    withImmediateApplyLock(() => {
      const canonical = serializePtx(doc);
      if (canonical === extractPtx() || canonical === lastImmediateCanonical) return;
      applyDocumentCore(doc, "IMMEDIATELY");
      lastImmediateCanonical = canonical;
    });
  };

  const applyDocument = (doc: PtDocument, capture: Capture): void => {
    if (capture === "IMMEDIATELY") {
      applyImmediateIfNew(doc);
      return;
    }
    applyDocumentCore(doc, capture);
  };

  const ensureMissingHandles = (ptx: string): void => {
    const doc = parsePtx(ptx);
    const existing = [...readScene()];
    const have = new Set(
      existing.map((el) => el.customData?.pt?.id).filter((id): id is string => Boolean(id)),
    );
    const missing = (doc.pages[0]?.nodes ?? []).filter((node) => !have.has(node.id));
    if (missing.length === 0) return;
    const created = projectDocument(
      { version: doc.version, pages: [{ id: doc.pages[0]?.id ?? "page", nodes: missing }] },
      [],
    );
    pushScene({
      elements: [...existing, ...created],
      captureUpdate: "NEVER",
    });
  };

  const clearHistoryOnLoad = () => {
    lastImmediateCanonical = null;
    witnessedNonces.clear();
    host.history?.clear();
  };

  const loadPersist = (loaded: PersistSnapshot | null | undefined): void => {
    lastImmediateCanonical = null;
    recoverEmptyLoad = Boolean(loaded?.ptx);
    const canvas = loaded?.canvas;
    if (canvas && typeof canvas === "object") {
      const rec = canvas as { elements?: unknown[]; appState?: Record<string, unknown>; files?: unknown };
      if (Array.isArray(rec.elements)) {
        pushScene({
          elements: rec.elements as HandleElement[],
          appState: rec.appState,
          captureUpdate: "NEVER",
        });
      }
      const files = loaded?.files ?? rec.files;
      if (files && typeof files === "object") {
        host.addFiles?.(Object.values(files as Record<string, unknown>));
      }
    } else if (loaded?.ptx) {
      applyDocument(parsePtx(loaded.ptx), "NEVER");
    }
    if (loaded?.ptx) {
      try {
        ensureMissingHandles(loaded.ptx);
      } catch {
        /* invalid stored ptx — keep restored canvas */
      }
    }
    clearHistoryOnLoad();
  };

  return {
    extract,
    extractPtx,
    applyPtx(xml, capture) {
      if (capture === "IMMEDIATELY") {
        applyImmediateIfNew(parsePtx(xml));
        return;
      }
      applyDocumentCore(parsePtx(xml), capture);
    },
    applyDocument,
    setMode(next) {
      mode = next;
      pushScene({
        appState: { viewModeEnabled: next === "interact" },
        captureUpdate: "NEVER",
      });
    },
    getMode() {
      return mode;
    },
    clearHistoryOnLoad,
    onHostChange() {
      const echo = gate.consume();
      const emptyScene = sceneIsEmpty();
      if (
        recoverEmptyLoad &&
        emptyScene &&
        lastCapture !== "IMMEDIATELY" &&
        lastProjectedScene.some((el) => el.customData?.pt)
      ) {
        recoverEmptyLoad = false;
        pushScene({ elements: lastProjectedScene, captureUpdate: "NEVER" });
        return { echo: true, document: extract() };
      }
      if (!emptyScene && !echo) recoverEmptyLoad = false;
      const filled = readScene();
      const document = extractDocument(filled);
      if (!echo) {
        lastProjectedPayload = mergePtPayloadSource(lastProjectedPayload, ptPayloadSource(filled));
      }
      return { echo, document };
    },
    loadPersist,
    disarmLoadRecover() {
      recoverEmptyLoad = false;
    },
  };
}
