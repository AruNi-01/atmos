import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fireAgentActions } from "../components/groups/form/runtime";
import { parsePtx, PtDesignError, serializePtx, type HandleElement, type PtDocument } from "../protocol";
import {
  applySceneCameraNever,
  armSkipInkAfterImmediate,
  clickExcalidrawHistoryControl,
  createLiveBoard,
  editBoardCapturesUndoHotkey,
  editModeHandlesKeyboardGlobally,
  followUpImmediateCapture,
  isSkipInkAfterImmediate,
  peelImmediateHistoryDecoy,
  scheduleClearSkipInkAfterImmediate,
  sceneExtractPtx,
  trimImmediateHistoryDecoy,
  undoThroughSelectionDecoy,
  type Capture,
  type ExcalidrawHost,
} from "./live-board";
import { applyHistoryInversePartial, createPtRestampState, excalidrawStrippedElementDelta, toExcalidrawCompatElements } from "./scene-bridge";

const VALID_PTX = `<page id="p">
  <button id="run" label="Run" value="ready" x="300" y="260" width="100" height="40"/>
</page>`;

type SceneCall = {
  elements?: HandleElement[];
  appState?: { viewModeEnabled?: boolean; scrollX?: number; scrollY?: number; zoom?: { value: number } };
  captureUpdate: Capture;
};

function createRestoreDropHost(): {
  host: ExcalidrawHost;
  wipe: () => void;
} {
  let elements: HandleElement[] = [];
  let appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false as boolean | undefined };
  const host: ExcalidrawHost = {
    getSceneElements: () => elements.map((el) => ({ ...el })),
    getAppState: () => appState,
    updateScene(opts) {
      if (opts.elements) {
        const converted = toExcalidrawCompatElements(opts.elements);
        elements = converted.map((el) => {
          const { customData: _drop, ...rest } = el;
          void _drop;
          return { ...rest } as HandleElement;
        });
      }
      if (opts.appState?.viewModeEnabled !== undefined) {
        appState = { ...appState, viewModeEnabled: opts.appState.viewModeEnabled };
      }
    },
  };
  return {
    host,
    wipe() {
      elements = [];
    },
  };
}

function deepCopyElement(val: unknown): unknown {
  if (val == null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map((item) => deepCopyElement(item));
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(val)) {
    copy[key] = deepCopyElement((val as Record<string, unknown>)[key]);
  }
  return copy;
}

/**
 * Host that records Excalidraw-style stripped `ElementsChange` on IMMEDIATELY
 * and undoes by `{...el, ...inserted}` from the inverse partial — not
 * `setElements(preApply)`.
 */
function createStripHistoryHost(initial: HandleElement[] = []): {
  host: ExcalidrawHost;
  calls: SceneCall[];
  cleared: { count: number };
  undo: () => void;
  undoDepth: () => number;
  lastImmediateCustomDataKeys: string[];
} {
  let elements: HandleElement[] = [...initial];
  let snapshot: HandleElement[] = initial.map((el) => deepCopyElement(el) as HandleElement);
  const inverses: Array<Map<string, Record<string, unknown>>> = [];
  const lastImmediateCustomDataKeys: string[] = [];
  let appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false as boolean | undefined };
  const calls: SceneCall[] = [];
  const cleared = { count: 0 };
  const host: ExcalidrawHost = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    updateScene(opts) {
      calls.push(opts);
      const undoable = opts.captureUpdate !== "NEVER";
      if (opts.elements) {
        const next = [...opts.elements];
        if (undoable) {
          lastImmediateCustomDataKeys.length = 0;
          const inverse = new Map<string, Record<string, unknown>>();
          for (const el of next) {
            const prev = snapshot.find((item) => item.id === el.id);
            if (!prev) continue;
            const delta = excalidrawStrippedElementDelta(
              prev as unknown as Record<string, unknown>,
              el as unknown as Record<string, unknown>,
            );
            if (!delta) continue;
            lastImmediateCustomDataKeys.push(...Object.keys(delta.inserted));
            inverse.set(el.id, delta.deleted);
          }
          inverses.push(inverse);
        }
        elements = next;
        snapshot = next.map((el) => deepCopyElement(el) as HandleElement);
      } else if (opts.appState && undoable) {
        inverses.push(new Map());
      }
      if (opts.appState) {
        appState = {
          ...appState,
          ...(opts.appState.viewModeEnabled !== undefined
            ? { viewModeEnabled: opts.appState.viewModeEnabled }
            : {}),
          ...(typeof opts.appState.scrollX === "number" ? { scrollX: opts.appState.scrollX } : {}),
          ...(typeof opts.appState.scrollY === "number" ? { scrollY: opts.appState.scrollY } : {}),
          ...(opts.appState.zoom ? { zoom: opts.appState.zoom } : {}),
        };
      }
    },
    history: {
      clear() {
        cleared.count += 1;
        inverses.length = 0;
      },
    },
  };
  return {
    host,
    calls,
    cleared,
    lastImmediateCustomDataKeys,
    undoDepth: () => inverses.length,
    undo() {
      const inverse = inverses.pop();
      if (!inverse) return;
      elements = elements.map((el) => {
        const inserted = inverse.get(el.id);
        if (!inserted) return el;
        return applyHistoryInversePartial(el as unknown as Record<string, unknown>, inserted) as HandleElement;
      });
    },
  };
}

function createFakeHost(initial: HandleElement[] = []): {
  host: ExcalidrawHost;
  calls: SceneCall[];
  cleared: { count: number };
  setElements: (next: HandleElement[]) => void;
} {
  let elements: HandleElement[] = [...initial];
  let appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false as boolean | undefined };
  const calls: SceneCall[] = [];
  const cleared = { count: 0 };
  const host: ExcalidrawHost = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    updateScene(opts) {
      calls.push(opts);
      if (opts.elements) elements = [...opts.elements];
      if (opts.appState?.viewModeEnabled !== undefined) {
        appState = { ...appState, viewModeEnabled: opts.appState.viewModeEnabled };
      }
    },
    history: {
      clear() {
        cleared.count += 1;
      },
    },
  };
  return {
    host,
    calls,
    cleared,
    setElements(next) {
      elements = next;
    },
  };
}

/**
 * Load (NEVER) updates the scene; IMMEDIATELY records the call but leaves
 * `getSceneElements` on the pre-apply (claude) scene — live Excalidraw can lag.
 */
function createStaleAfterImmediateHost(initial: HandleElement[] = []): {
  host: ExcalidrawHost;
  calls: SceneCall[];
  cleared: { count: number };
} {
  let elements: HandleElement[] = [...initial];
  let appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false as boolean | undefined };
  const calls: SceneCall[] = [];
  const cleared = { count: 0 };
  const host: ExcalidrawHost = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    updateScene(opts) {
      calls.push(opts);
      if (opts.captureUpdate === "IMMEDIATELY") {
        if (opts.appState?.viewModeEnabled !== undefined) {
          appState = { ...appState, viewModeEnabled: opts.appState.viewModeEnabled };
        }
        return;
      }
      if (opts.elements) elements = [...opts.elements];
      if (opts.appState?.viewModeEnabled !== undefined) {
        appState = { ...appState, viewModeEnabled: opts.appState.viewModeEnabled };
      }
    },
    history: {
      clear() {
        cleared.count += 1;
      },
    },
  };
  return { host, calls, cleared };
}

/**
 * Strip-history host whose `extractPtx()` after the first IMMEDIATELY write is
 * intentionally not `serializePtx(parsePtx(edited))` — live Excalidraw hydrate
 * can diverge the same way. Skip must use incoming canonical, not extract.
 */
function createExtractRoundtripMismatchHost(initial: HandleElement[] = []): ReturnType<
  typeof createStripHistoryHost
> {
  const inner = createStripHistoryHost(initial);
  let mismatchExtract = false;
  const storedGet = inner.host.getSceneElements;
  const storedUpdate = inner.host.updateScene.bind(inner.host);
  inner.host.getSceneElements = () => {
    const els = storedGet();
    if (!mismatchExtract) return els;
    return els.map((el) => ({ ...el, x: el.x + 13 }));
  };
  inner.host.updateScene = (opts) => {
    storedUpdate(opts);
    if (opts.captureUpdate === "IMMEDIATELY" && opts.elements) {
      mismatchExtract = true;
    }
  };
  return inner;
}

function expectCode(fn: () => unknown, code: string): PtDesignError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PtDesignError);
    const err = error as PtDesignError;
    expect(err.code).toBe(code);
    return err;
  }
  throw new Error(`expected PtDesignError ${code}`);
}

describe("createLiveBoard applyPtx", () => {
  test("legal XML projects once with IMMEDIATELY and customData.pt.id", () => {
    const freehand: HandleElement = {
      id: "draw1",
      type: "rectangle",
      x: 9,
      y: 9,
      width: 1,
      height: 1,
      angle: 0,
    };
    const { host, calls, cleared } = createFakeHost([freehand]);
    const board = createLiveBoard(host);
    board.applyPtx(VALID_PTX, "IMMEDIATELY");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.captureUpdate).toBe("IMMEDIATELY");
    const ids = (calls[0]!.elements ?? []).map((el) => el.customData?.pt?.id);
    expect(ids).toContain("run");
    expect((calls[0]!.elements ?? []).map((el) => el.id)).toContain("draw1");
    expect(cleared.count).toBe(0);
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
  });

  test("S13 orphan option throws invalid_ptx and does not updateScene; freehand kept on full apply", () => {
    const freehand: HandleElement = {
      id: "draw1",
      type: "rectangle",
      x: 9,
      y: 9,
      width: 1,
      height: 1,
      angle: 0,
    };
    const { host, calls } = createFakeHost([freehand]);
    const board = createLiveBoard(host);
    board.applyPtx(VALID_PTX, "IMMEDIATELY");
    expect(calls).toHaveLength(1);
    expect((calls[0]!.elements ?? []).map((el) => el.id)).toContain("draw1");
    expectCode(() => board.applyPtx(`<option value="x">X</option>`, "IMMEDIATELY"), "invalid_ptx");
    expect(calls).toHaveLength(1);
    const withOption = `<page id="p">
  <button id="run" label="Run" value="ready" x="300" y="260" width="100" height="40"/>
  <select id="model" value="claude" x="1" y="1" width="10" height="10">
    <option value="claude">Claude</option>
    <option value="x">X</option>
  </select>
</page>`;
    board.applyPtx(withOption, "IMMEDIATELY");
    expect(calls).toHaveLength(2);
    expect((calls[1]!.elements ?? []).map((el) => el.id)).toContain("draw1");
    expect(board.extract().pages[0]!.nodes.some((n) => n.id === "model")).toBe(true);
  });
});

describe("createLiveBoard applyDocument / extract", () => {
  test("S17 extract matches spatial and value; Interact commit is NEVER and history does not grow", () => {
    const { host, calls } = createFakeHost();
    const board = createLiveBoard(host);
    const doc = parsePtx(VALID_PTX);
    board.applyDocument(doc, "IMMEDIATELY");
    const extracted = board.extract();
    const node = extracted.pages[0]!.nodes[0]!;
    expect(node.id).toBe("run");
    expect(node.x).toBe(300);
    expect(node.y).toBe(260);
    expect(node.width).toBe(100);
    expect(node.height).toBe(40);
    expect(node.value).toBe("ready");

    const page = extracted.pages[0]!;
    const next: PtDocument = {
      version: extracted.version,
      pages: [
        {
          id: page.id,
          nodes: page.nodes.map((item) => (item.id === "run" ? { ...item, value: "gemini" } : item)),
        },
      ],
    };
    board.applyDocument(next, "NEVER");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.captureUpdate).toBe("NEVER");
    expect(board.extract().pages[0]!.nodes[0]!.value).toBe("gemini");
    expect(board.extract().pages[0]!.nodes[0]!.x).toBe(300);
  });

  test("S17 Interact click fires host action payload and applyDocument NEVER does not clear history", () => {
    const { host, calls, cleared } = createFakeHost();
    const board = createLiveBoard(host);
    const withAction = `<page id="p">
  <button id="run" label="Run" x="300" y="260" width="100" height="40">
    <on event="click">
      <action type="agent" name="run"/>
    </on>
  </button>
</page>`;
    board.applyPtx(withAction, "IMMEDIATELY");
    const payloads: Array<{
      nodeId: string;
      event: "click" | "change";
      action: { type: "agent"; name: string };
    }> = [];
    fireAgentActions(board.extract().pages[0]!.nodes[0]!, "click", (payload) => {
      payloads.push(payload);
    });
    expect(payloads).toEqual([
      { nodeId: "run", event: "click", action: { type: "agent", name: "run" } },
    ]);
    board.applyDocument(board.extract(), "NEVER");
    expect(calls.at(-1)!.captureUpdate).toBe("NEVER");
    expect(cleared.count).toBe(0);
  });
});

describe("createLiveBoard setMode", () => {
  test("Edit handles keyboard globally; Interact does not", () => {
    expect(editModeHandlesKeyboardGlobally(false)).toBe(true);
    expect(editModeHandlesKeyboardGlobally(true)).toBe(false);
    const board = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    expect(board).toContain("handleKeyboardGlobally={editModeHandlesKeyboardGlobally(viewModeEnabled)}");
    expect(board).not.toContain("handleKeyboardGlobally={false}");
  });

  test("Edit capture-phase Cmd+Z is on; Interact and Shift+Z are off", () => {
    const undo = {
      key: "z",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      target: null,
    };
    expect(editBoardCapturesUndoHotkey(false, undo)).toBe(true);
    expect(editBoardCapturesUndoHotkey(true, undo)).toBe(false);
    expect(editBoardCapturesUndoHotkey(false, { ...undo, shiftKey: true })).toBe(false);
    const src = readFileSync(new URL("./live-board.ts", import.meta.url), "utf8");
    expect(src).toContain("HTMLInputElement");
    expect(src).toContain("HTMLTextAreaElement");
  });

  test("interact sets viewModeEnabled true with NEVER capture", () => {
    const { host, calls } = createFakeHost();
    const board = createLiveBoard(host);
    expect(board.getMode()).toBe("edit");
    board.setMode("interact");
    expect(board.getMode()).toBe("interact");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.appState?.viewModeEnabled).toBe(true);
    expect(calls[0]!.captureUpdate).toBe("NEVER");
    expect(calls[0]!.elements).toBeUndefined();
  });

  test("edit sets viewModeEnabled false with NEVER capture", () => {
    const { host, calls } = createFakeHost();
    const board = createLiveBoard(host);
    board.setMode("interact");
    board.setMode("edit");
    expect(board.getMode()).toBe("edit");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.appState?.viewModeEnabled).toBe(false);
    expect(calls[1]!.captureUpdate).toBe("NEVER");
    expect(calls[1]!.elements).toBeUndefined();
  });
});

describe("createLiveBoard history", () => {
  test("clearHistoryOnLoad is the only history.clear path", () => {
    const { host, calls, cleared } = createFakeHost();
    const board = createLiveBoard(host);
    board.applyPtx(VALID_PTX, "IMMEDIATELY");
    board.setMode("interact");
    expect(cleared.count).toBe(0);
    board.clearHistoryOnLoad();
    expect(cleared.count).toBe(1);
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe("createLiveBoard onHostChange", () => {
  test("echo extract does not apply back onto the scene", () => {
    const { host, calls } = createFakeHost();
    const board = createLiveBoard(host);
    board.applyPtx(VALID_PTX, "IMMEDIATELY");
    expect(calls).toHaveLength(1);
    const echo = board.onHostChange();
    expect(echo.echo).toBe(true);
    expect(echo.document.pages[0]!.nodes[0]!.id).toBe("run");
    expect(calls).toHaveLength(1);
    expect(board.onHostChange().echo).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("live-board source", () => {
  test("does not keep a parallel session store", () => {
    const src = readFileSync(new URL("./live-board.ts", import.meta.url), "utf8");
    expect(src).not.toContain("replaceSession");
    expect(src).not.toContain("board-sync");
    expect(src).toContain("clearHistoryOnLoad");
    expect(src).toContain("history?.clear");
    expect(src).toContain("mergePtPayloadSource");
    expect(src).toContain("witnessedNonces");
    expect(src).toContain("applySceneCameraNever");
    expect(src).toContain('captureUpdate: "NEVER"');
    expect(src).toContain("skipInkAfterImmediate");
    expect(src).toContain("armSkipInkAfterImmediate");
    expect(src).toContain("scheduleClearSkipInkAfterImmediate");
    expect(src).toContain("requestAnimationFrame");
    expect(src).not.toContain("@excalidraw/excalidraw");
    expect(src).toContain("canonical === extractPtx()");
    expect(src).toContain("canonical === lastImmediateCanonical");
    expect(src).toContain("lastImmediateCanonical = canonical");
    expect(src).toContain("lastImmediateCanonical = null");
    expect(src).not.toContain("extractDocument(lastProjectedScene)");
    expect(src).toContain("immediateApplyLock");
    expect(src).toContain("withImmediateApplyLock");
    expect(src).toContain("applyDocumentCore");
    expect(src).toContain("followUpImmediateCapture");
    expect(src).toContain("peelImmediateHistoryDecoy");
    expect(src).toContain("trimImmediateHistoryDecoy");
    expect(src).toContain("undoThroughSelectionDecoy");
    expect(src).toContain("afterPaint");
    expect(src).toContain("sceneExtractPtx");
    expect(src).toContain("clickExcalidrawHistoryControl");
    expect(src).toContain("btn.disabled = false");
    expect(src).toMatch(/try \{[\s\S]*fn\(\)[\s\S]*\} finally \{/);
    const liveBoardFn = src.slice(src.indexOf("export function createLiveBoard"));
    expect(liveBoardFn).not.toContain("undoThroughSelectionDecoy");
    expect(liveBoardFn).not.toContain("peelImmediateHistoryDecoy");
    expect(liveBoardFn).not.toContain("trimImmediateHistoryDecoy");
  });

  test("followUpImmediateCapture demotes only armed IMMEDIATELY", () => {
    expect(followUpImmediateCapture("IMMEDIATELY", true)).toBe("NEVER");
    expect(followUpImmediateCapture("IMMEDIATELY", false)).toBe("IMMEDIATELY");
    expect(followUpImmediateCapture("NEVER", true)).toBe("NEVER");
    expect(followUpImmediateCapture("NEVER", false)).toBe("NEVER");
    expect(followUpImmediateCapture("EVENTUALLY", true)).toBe("EVENTUALLY");
  });

  test("S17 PtDesignApp OverlayHost is passed onAction", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/<OverlayHost[\s\S]*onAction=/);
  });
});

describe("clickExcalidrawHistoryControl", () => {
  test("force-enables a disabled control then clicks", () => {
    let clicks = 0;
    const btn = {
      disabled: true,
      click() {
        clicks += 1;
      },
    };
    clickExcalidrawHistoryControl(btn);
    expect(btn.disabled).toBe(false);
    expect(clicks).toBe(1);
  });

  test("no-ops when the control is missing", () => {
    clickExcalidrawHistoryControl(null);
    clickExcalidrawHistoryControl(undefined);
  });
});

describe("undoThroughSelectionDecoy", () => {
  test("extract changes on first undo: sync afterPaint does not undo twice (S21)", () => {
    let xml = "moved x=390";
    let clicks = 0;
    const btn = {
      disabled: true,
      click() {
        clicks += 1;
        xml = "origin x=300";
      },
    };
    undoThroughSelectionDecoy({
      extractPtx: () => xml,
      queryUndoControl: () => btn,
      afterPaint: (cb) => cb(),
    });
    expect(clicks).toBe(1);
    expect(xml).toBe("origin x=300");
    expect(btn.disabled).toBe(false);
  });

  test("extract unchanged after first undo and afterPaint: second undo (S30 selection decoy)", () => {
    let xml = "deepseek";
    let clicks = 0;
    const btn = {
      disabled: true,
      click() {
        clicks += 1;
        if (clicks === 2) xml = "claude";
      },
    };
    undoThroughSelectionDecoy({
      extractPtx: () => xml,
      queryUndoControl: () => btn,
      afterPaint: (cb) => cb(),
    });
    expect(clicks).toBe(2);
    expect(xml).not.toContain("deepseek");
    expect(xml).toBe("claude");
    expect(btn.disabled).toBe(false);
  });

  test("cannot undo: no-op", () => {
    let clicks = 0;
    undoThroughSelectionDecoy({
      extractPtx: () => "deepseek",
      queryUndoControl: () => null,
      afterPaint: (cb) => {
        clicks += 10;
        cb();
      },
    });
    expect(clicks).toBe(0);
  });

  test("unflushed extract: afterPaint sees change, no second undo (S21 live)", () => {
    let xml = "moved";
    let clicks = 0;
    const btn = {
      disabled: false,
      click() {
        clicks += 1;
      },
    };
    let paint: (() => void) | undefined;
    undoThroughSelectionDecoy({
      extractPtx: () => xml,
      queryUndoControl: () => btn,
      afterPaint: (cb) => {
        paint = () => {
          xml = "origin";
          cb();
        };
      },
    });
    expect(clicks).toBe(1);
    expect(xml).toBe("moved");
    paint!();
    expect(clicks).toBe(1);
    expect(xml).toBe("origin");
  });
});

describe("peelImmediateHistoryDecoy", () => {
  test("decoy: undo, no redo scheduled", () => {
    const calls: string[] = [];
    peelImmediateHistoryDecoy({
      extractPtx: () => "<page applied/>",
      undoDisabled: false,
      undo: () => {
        calls.push("undo");
      },
      redo: () => {
        calls.push("redo");
      },
      afterPaint: (cb) => {
        calls.push("afterPaint");
        cb();
      },
    });
    expect(calls).toEqual(["undo"]);
  });

  test("payload-only: sync afterPaint still redos deepseek back to applied", () => {
    let xml = "deepseek";
    const applied = xml;
    const calls: string[] = [];
    peelImmediateHistoryDecoy({
      extractPtx: () => xml,
      undoDisabled: false,
      undo: () => {
        calls.push("undo");
        xml = "claude";
      },
      redo: () => {
        calls.push("redo");
        xml = applied;
      },
      afterPaint: (cb) => cb(),
    });
    expect(calls).toEqual(["undo", "redo"]);
    expect(xml).toBe(applied);
    expect(xml).toContain("deepseek");
  });

  test("payload-only: afterPaint is invoked and redo restores applied including deepseek", () => {
    let xml = "deepseek";
    const applied = xml;
    const calls: string[] = [];
    let painted = false;
    peelImmediateHistoryDecoy({
      extractPtx: () => xml,
      undoDisabled: false,
      undo: () => {
        calls.push("undo");
        xml = "claude";
      },
      redo: () => {
        calls.push("redo");
        xml = applied;
      },
      afterPaint: (cb) => {
        painted = true;
        cb();
      },
    });
    expect(painted).toBe(true);
    expect(calls).toEqual(["undo", "redo"]);
    expect(xml).toContain("deepseek");
  });

  test("payload-only: redo is requested via afterPaint, not before it returns", () => {
    let xml = "deepseek";
    const applied = xml;
    const calls: string[] = [];
    let held: (() => void) | undefined;
    peelImmediateHistoryDecoy({
      extractPtx: () => xml,
      undoDisabled: false,
      undo: () => {
        calls.push("undo");
        xml = "claude";
      },
      redo: () => {
        calls.push("redo");
        xml = applied;
      },
      afterPaint: (cb) => {
        held = cb;
      },
    });
    expect(calls).toEqual(["undo"]);
    expect(xml).toBe("claude");
    expect(typeof held).toBe("function");
    held!();
    expect(calls).toEqual(["undo", "redo"]);
    expect(xml).toBe(applied);
    expect(xml).toContain("deepseek");
  });

  test("undoDisabled / missing control: no undo", () => {
    const calls: string[] = [];
    peelImmediateHistoryDecoy({
      extractPtx: () => "deepseek",
      undoDisabled: true,
      undo: () => {
        calls.push("undo");
      },
      redo: () => {
        calls.push("redo");
      },
      afterPaint: (cb) => {
        calls.push("afterPaint");
        cb();
      },
    });
    expect(calls).toEqual([]);
  });

  test("trimImmediateHistoryDecoy alias is the same two-phase peel", () => {
    expect(trimImmediateHistoryDecoy).toBe(peelImmediateHistoryDecoy);
  });

  test("after peeling decoy, one undo drops deepseek and keeps claude + overlay ids", () => {
    const pre = `<page id="model-config">
  <select id="model" value="claude"></select>
  <input id="prompt"/>
  <button id="run"/>
</page>`;
    const applied = pre.replace("claude", "deepseek");
    let xml = applied;
    const stack = ["payload", "decoy"];
    peelImmediateHistoryDecoy({
      extractPtx: () => xml,
      undoDisabled: false,
      undo: () => {
        stack.pop();
        if (!stack.includes("payload")) xml = pre;
      },
      redo: () => {
        stack.push("payload");
        xml = applied;
      },
      afterPaint: (cb) => cb(),
    });
    expect(stack).toEqual(["payload"]);
    expect(xml).toContain("deepseek");
    stack.pop();
    xml = pre;
    expect(xml).not.toContain("deepseek");
    expect(xml).toContain("claude");
    expect(xml).toContain('id="model"');
    expect(xml).toContain('id="prompt"');
    expect(xml).toContain('id="run"');
  });

  test("sceneExtractPtx serializes live customData payload including deepseek", () => {
    const elements = [
      {
        id: "model",
        type: "rectangle" as const,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        angle: 0,
        customData: {
          pt: {
            id: "model",
            type: "select",
            props: {},
            options: [{ value: "deepseek", label: "DeepSeek" }],
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            rotation: 0,
          },
        },
      },
    ];
    expect(sceneExtractPtx(elements)).toContain("deepseek");
  });
});

const SEEDED_PTX = `<page id="model-config">
  <select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
    <option value="gemini">Gemini</option>
  </select>
  <input id="prompt" label="Prompt" value="" x="300" y="250" width="240" height="40"/>
  <button id="run" label="Run" x="300" y="300" width="100" height="40">
    <on event="click">
      <action type="agent" name="run"/>
    </on>
  </button>
</page>
`;

describe("ptx-only persist load", () => {
  test("ptx-only persist/load projects extract overlay ids including run", async () => {
    const { host, calls, cleared } = createFakeHost();
    const board = createLiveBoard(host);
    const persist = {
      async load() {
        return { ptx: SEEDED_PTX };
      },
      async save() {},
    };
    const loaded = await persist.load();
    expect("canvas" in loaded).toBe(false);
    board.loadPersist(loaded);
    expect(cleared.count).toBe(1);
    expect(calls[0]?.captureUpdate).toBe("NEVER");
    const ids = board.extract().pages[0]?.nodes.map((n) => n.id) ?? [];
    expect(ids).toContain("model");
    expect(ids).toContain("prompt");
    expect(ids).toContain("run");
    const run = (calls[0]?.elements ?? []).find((el) => el.customData?.pt?.id === "run");
    expect(run?.customData?.pt?.id).toBe("run");
    expect(typeof (run as { seed?: number } | undefined)?.seed).toBe("number");
  });

  test("restore-drop host still extracts model/prompt/run after ptx-only loadPersist", () => {
    const { host } = createRestoreDropHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    const ids = board.extract().pages[0]?.nodes.map((n) => n.id) ?? [];
    expect(ids).toContain("model");
    expect(ids).toContain("prompt");
    expect(ids).toContain("run");
    expect(host.getSceneElements().every((el) => el.customData?.pt === undefined)).toBe(true);
  });

  test("delayed empty onChange after ptx-only loadPersist does not leave zero page-level nodes", () => {
    const { host, wipe } = createRestoreDropHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    wipe();
    expect(host.getSceneElements()).toEqual([]);
    const change = board.onHostChange();
    expect(change.echo).toBe(true);
    const ids = change.document.pages[0]?.nodes.map((n) => n.id) ?? [];
    expect(ids).toContain("model");
    expect(ids).toContain("prompt");
    expect(ids).toContain("run");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
  });

  test("extract spatial follows live geometry after load, not lastProjected", () => {
    const { host, cleared } = createFakeHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: VALID_PTX });
    expect(cleared.count).toBe(1);
    const run = host.getSceneElements().find((el) => el.customData?.pt?.id === "run");
    expect(run).toBeDefined();
    const originX = run!.x;
    const originY = run!.y;
    run!.x = originX + 48;
    run!.y = originY + 12;
    const extracted = board.extract().pages[0]!.nodes[0]!;
    expect(extracted.id).toBe("run");
    expect(extracted.x).toBe(originX + 48);
    expect(extracted.y).toBe(originY + 12);
  });

  test("applyPtx IMMEDIATELY after load does not call history.clear", () => {
    const { host, calls, cleared } = createFakeHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: VALID_PTX });
    expect(cleared.count).toBe(1);
    const edited = VALID_PTX.replace(
      "</page>",
      `  <input id="prompt" label="Prompt" value="deepseek" x="1" y="1" width="10" height="10"/>
</page>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.at(-1)!.captureUpdate).toBe("IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
    expect(cleared.count).toBe(1);
    expect(board.extractPtx()).toContain("deepseek");
    const nonce = (calls.at(-1)!.elements ?? []).find((el) => el.customData?.pt?.id === "run") as
      | { versionNonce?: number }
      | undefined;
    const loadedNonce = (calls[0]!.elements ?? []).find((el) => el.customData?.pt?.id === "run") as
      | { versionNonce?: number }
      | undefined;
    expect(nonce?.versionNonce).not.toBe(loadedNonce?.versionNonce);
  });

  test("undo dropping customData while keeping the applied nonce does not refill deepseek", () => {
    const { host, calls, cleared, setElements } = createFakeHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.at(-1)!.captureUpdate).toBe("IMMEDIATELY");
    expect(cleared.count).toBe(1);
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);
    const applied = host.getSceneElements().map((el) => ({ ...el }));
    const appliedNonceById = new Map(
      applied.map((el) => [el.id, (el as { versionNonce?: number }).versionNonce]),
    );
    expect([...appliedNonceById.values()].every((nonce) => typeof nonce === "number")).toBe(true);

    setElements(
      applied.map((el) => {
        const { customData: _omit, ...rest } = el;
        void _omit;
        return { ...rest } as HandleElement;
      }),
    );
    for (const el of host.getSceneElements()) {
      expect(el.customData?.pt).toBeUndefined();
      expect((el as { versionNonce?: number }).versionNonce).toBe(appliedNonceById.get(el.id));
    }
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(serializePtx(undone.document)).not.toContain("deepseek");
    expect(serializePtx(undone.document)).toContain("claude");
    expect(undone.document.pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(cleared.count).toBe(1);
  });

  test("undo restoring full pre-apply elements does not keep the applied option", () => {
    const { host, calls, cleared, setElements } = createFakeHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(board.onHostChange().echo).toBe(true);
    const preApply = host.getSceneElements().map((el) => ({
      ...el,
      customData: el.customData ? { pt: { ...el.customData.pt } } : el.customData,
    }));
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.at(-1)!.captureUpdate).toBe("IMMEDIATELY");
    const appliedModel = (calls.at(-1)!.elements ?? []).find((el) => el.customData?.pt?.id === "model");
    const preModel = preApply.find((el) => el.customData?.pt?.id === "model");
    expect(appliedModel?.customData).not.toBe(preModel?.customData);
    expect(appliedModel?.customData?.pt).not.toBe(preModel?.customData?.pt);
    expect(appliedModel?.customData?.pt?.options).not.toBe(preModel?.customData?.pt?.options);
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    setElements(preApply);
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(serializePtx(undone.document)).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(cleared.count).toBe(1);
  });

  test("undo restoring applied nonce with History-restored payload drops deepseek", () => {
    const { host, cleared, setElements } = createFakeHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(board.onHostChange().echo).toBe(true);
    const preApply = host.getSceneElements().map((el) => ({ ...el }));
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);
    const applied = host.getSceneElements();
    setElements(
      applied.map((el) => {
        const prev = preApply.find((item) => item.id === el.id);
        return { ...el, customData: prev?.customData };
      }),
    );
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(serializePtx(undone.document)).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(cleared.count).toBe(1);
  });

  test("bindHostApi restamp after restoring full pre-apply elements does not refill deepseek", () => {
    const restamp = createPtRestampState();
    let elements: HandleElement[] = [];
    let appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false as boolean | undefined };
    const host = {
      getSceneElements: () => restamp.restamp(elements),
      getAppState: () => appState,
      updateScene(opts: SceneCall) {
        if (opts.elements) {
          restamp.ingest(opts.elements);
          elements = [...opts.elements];
        }
        if (opts.appState?.viewModeEnabled !== undefined) {
          appState = { ...appState, viewModeEnabled: opts.appState.viewModeEnabled };
        }
      },
      history: { clear() {} },
    };
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(board.onHostChange().echo).toBe(true);
    const preApply = host.getSceneElements().map((el) => ({
      ...el,
      customData: el.customData ? { pt: { ...el.customData.pt } } : el.customData,
    }));
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);
    const appliedEls = host.getSceneElements().map((el) => ({ ...el }));

    elements = preApply;
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(serializePtx(undone.document)).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");

    elements = appliedEls.map((el) => {
      const prev = preApply.find((item) => item.id === el.id);
      return { ...el, customData: prev?.customData };
    });
    expect(board.extractPtx()).not.toContain("deepseek");

    const appliedNonceById = new Map(
      appliedEls.map((el) => [el.id, (el as { versionNonce?: number }).versionNonce]),
    );
    elements = appliedEls.map((el) => {
      const { customData: _omit, ...rest } = el;
      void _omit;
      return { ...rest } as HandleElement;
    });
    for (const el of elements) {
      expect(el.customData?.pt).toBeUndefined();
      expect((el as { versionNonce?: number }).versionNonce).toBe(appliedNonceById.get(el.id));
    }
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
  });

  test("official-style undo of apply uses stripped ElementsChange customData, not setElements(preApply)", () => {
    const { host, calls, cleared, undo, lastImmediateCustomDataKeys } = createStripHistoryHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.at(-1)!.captureUpdate).toBe("IMMEDIATELY");
    expect(lastImmediateCustomDataKeys).toContain("customData");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    undo();
    const raw = host.getSceneElements();
    expect(JSON.stringify(raw.map((el) => el.customData?.pt))).not.toContain("deepseek");
    expect(JSON.stringify(raw.map((el) => el.customData?.pt))).toContain("claude");

    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(serializePtx(undone.document)).not.toContain("deepseek");
    expect(cleared.count).toBe(1);
  });

  test("applyPtx IMMEDIATELY then NEVER camera does not add undo; one undo drops deepseek", () => {
    const { host, calls, cleared, undo, undoDepth, lastImmediateCustomDataKeys } = createStripHistoryHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.at(-1)!.captureUpdate).toBe("IMMEDIATELY");
    expect(lastImmediateCustomDataKeys).toContain("customData");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);
    const depthAfterApply = undoDepth();
    expect(depthAfterApply).toBe(1);
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);

    applySceneCameraNever(host, { scrollX: -80, scrollY: -40, zoom: { value: 0.8 } });
    expect(calls.at(-1)!.captureUpdate).toBe("NEVER");
    expect(calls.at(-1)!.elements).toBeUndefined();
    expect(undoDepth()).toBe(depthAfterApply);
    expect(host.getAppState().scrollX).toBe(-80);
    expect(board.extractPtx()).toContain("deepseek");

    undo();
    expect(undoDepth()).toBe(0);
    const raw = host.getSceneElements();
    expect(JSON.stringify(raw.map((el) => el.customData?.pt))).not.toContain("deepseek");
    expect(JSON.stringify(raw.map((el) => el.customData?.pt))).toContain("claude");

    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(serializePtx(undone.document)).not.toContain("deepseek");
    expect(cleared.count).toBe(1);
  });

  test("skip-ink-after-immediate: ink microtask returns while armed, then clears", async () => {
    const api = {};
    const writes: string[] = [];
    armSkipInkAfterImmediate(api);
    expect(isSkipInkAfterImmediate(api)).toBe(true);
    queueMicrotask(() => {
      if (isSkipInkAfterImmediate(api)) return;
      writes.push("elements");
      writes.push("currentItemStrokeColor");
    });
    scheduleClearSkipInkAfterImmediate(api);
    await Promise.resolve();
    expect(writes).toEqual([]);
    expect(isSkipInkAfterImmediate(api)).toBe(true);
    if (typeof requestAnimationFrame === "function") {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    } else {
      await Promise.resolve();
    }
    expect(isSkipInkAfterImmediate(api)).toBe(false);
    queueMicrotask(() => {
      if (isSkipInkAfterImmediate(api)) return;
      writes.push("later-ink");
    });
    await Promise.resolve();
    expect(writes).toEqual(["later-ink"]);
  });

  test("applyPtx IMMEDIATELY skips identical canonical XML; first deepseek still one increment", () => {
    const { host, calls, cleared, undo } = createStripHistoryHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const before = board.extractPtx();
    expect(before).toContain("claude");
    expect(before).not.toContain("deepseek");
    board.applyPtx(before, "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(0);

    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    expect(serializePtx(parsePtx(edited))).not.toBe(board.extractPtx());
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
    expect(calls.at(-1)!.captureUpdate).toBe("IMMEDIATELY");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    board.applyPtx(board.extractPtx(), "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);

    undo();
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).toContain("claude");
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(serializePtx(undone.document)).toContain("claude");
    expect(cleared.count).toBe(1);
  });

  test("synchronous two applyPtx(same xml) is one IMMEDIATELY; first deepseek writes; one undo keeps claude + ids", () => {
    const { host, calls, cleared, undo } = createStripHistoryHost();
    const innerUpdate = host.updateScene;
    let board: ReturnType<typeof createLiveBoard>;
    let edited = "";
    let reenteredBeforeCommit = false;
    let reenteredAfterPushScene = false;
    host.updateScene = (opts) => {
      // Live Excalidraw may not expose the new scene until after updateScene;
      // both applies would see extract still claude. Re-enter before commit.
      if (opts.captureUpdate === "IMMEDIATELY" && !reenteredBeforeCommit) {
        reenteredBeforeCommit = true;
        expect(board.extractPtx()).toContain("claude");
        expect(board.extractPtx()).not.toContain("deepseek");
        board.applyPtx(edited, "IMMEDIATELY");
        expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(0);
      }
      innerUpdate(opts);
      // Lock must still hold after pushScene's updateScene returns, until the
      // first applyPtx stack unwinds.
      if (opts.captureUpdate === "IMMEDIATELY" && !reenteredAfterPushScene) {
        reenteredAfterPushScene = true;
        board.applyPtx(edited, "IMMEDIATELY");
      }
    };
    board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    expect(serializePtx(parsePtx(edited))).not.toBe(board.extractPtx());
    board.applyPtx(edited, "IMMEDIATELY");
    expect(reenteredBeforeCommit).toBe(true);
    expect(reenteredAfterPushScene).toBe(true);
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
    expect(calls.at(-1)!.captureUpdate).toBe("IMMEDIATELY");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    undo();
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).toContain("claude");
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(serializePtx(undone.document)).toContain("claude");
    expect(serializePtx(undone.document)).not.toContain("deepseek");
    expect(cleared.count).toBe(1);
  });

  test("sequential applyPtx(same xml) after lock release is one IMMEDIATELY when host scene stays claude", () => {
    const { host, calls, cleared } = createStaleAfterImmediateHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    expect(serializePtx(parsePtx(edited))).not.toBe(board.extractPtx());
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
    // Host still exposes claude — extract skip cannot help. Second call is sequential.
    expect(board.extractPtx()).toContain("claude");
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
    expect(cleared.count).toBe(1);
  });

  test("sequential applyPtx on strip host writes deepseek once; one undo keeps claude and overlay ids", () => {
    const { host, calls, cleared, undo } = createStripHistoryHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    undo();
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(serializePtx(undone.document)).toContain("claude");
    expect(cleared.count).toBe(1);
  });

  test("sequential applyPtx(edited) skips second IMMEDIATELY when extract roundtrip mismatches; undo keeps claude and overlay ids", () => {
    const { host, calls, cleared, undo } = createExtractRoundtripMismatchHost();
    const board = createLiveBoard(host);
    board.loadPersist({ ptx: SEEDED_PTX });
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);
    expect(board.extractPtx()).toContain("deepseek");
    expect(serializePtx(parsePtx(edited))).not.toBe(board.extractPtx());
    expect(board.onHostChange().echo).toBe(true);
    board.applyPtx(edited, "IMMEDIATELY");
    expect(calls.filter((c) => c.captureUpdate === "IMMEDIATELY")).toHaveLength(1);

    undo();
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(serializePtx(undone.document)).toContain("claude");
    expect(undone.document.pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(cleared.count).toBe(1);
  });
});