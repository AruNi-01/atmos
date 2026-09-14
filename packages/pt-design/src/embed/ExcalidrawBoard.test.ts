import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { editModeHandlesKeyboardGlobally } from "./live-board";

describe("ExcalidrawBoard live hydrate", () => {
  test("hands the host API over on first onChange after initialData restore", () => {
    const src = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    expect(src).toContain("handleSceneChange");
    expect(src).toContain("onApiRef.current(bindHostApi(api))");
    expect(src).not.toContain("bindHostApi(api, () => boardRef.current)");
    expect(src).toContain("hydrateHandleElements");
    expect(src).toContain("prepareLiveHandle");
    expect(src).toContain("createPtRestampState");
    expect(src).toContain("cloneScenePtCustomData");
    expect(src).toContain("stampPtCustomData");
    expect(src).toContain("clearWitnesses");
    expect(src).toContain("alreadyLive");
    expect(src).toContain("focus({ preventScroll: true })");
    expect(src).toContain("onPointerDownCapture");
    expect(src).toContain("onFocusCapture");
    expect(src).toContain("onKeyDownCapture");
    expect(src).toContain("captureEditUndoHotkey");
    expect(src).toContain('data-testid="button-undo"');
    expect(src).toContain("stopImmediatePropagation");
    expect(src).toContain("stealEditFocusFromOverlay");
    expect(src).not.toMatch(/lastHydrated = ptPayloadSource/);
    expect(src).toContain("shouldWriteElements");
    expect(src).toContain("inked.length > 0");
    expect(src).toContain("inkEpochRef");
    expect(src).toContain("inkedNow");
    expect(src).not.toContain("bumpImmediateHandleElements");
    expect(src).not.toContain("newElementWith");
    expect(src).not.toContain("peelImmediateHistoryDecoy");
    expect(src).not.toContain("trimImmediateHistoryDecoy");
    expect(src).not.toContain("rec.version = 1");
    expect(src).not.toContain("bumpVersion(");
    expect(src).toContain('captureUpdate: "NEVER"');
    expect(src).toContain("followUpImmediateCapture");
    expect(src).toContain("undoThroughSelectionDecoy");
    expect(src).toContain("sceneExtractPtx");
    expect(src).toContain("recentlyImmediate = true");
    expect(src).not.toContain("bumpHandleVersions");
    expect(src).toContain("applySceneCameraNever");
    expect(src).toContain("armSkipInkAfterImmediate");
    expect(src).toContain("isSkipInkAfterImmediate");
    expect(src).toContain("scheduleClearSkipInkAfterImmediate");
    expect(src).toContain("skipInkAfterImmediate");
    expect(src).toMatch(/if \(isSkipInkAfterImmediate\(liveApi\)\) return;/);
    expect(src).not.toContain("api.scrollToContent(target");
    expect(src).not.toMatch(/React\.useEffect\(\(\) => \{\s*const api = apiRef\.current;\s*if \(!api \|\| handedOffRef\.current\) return;/);
  });
});

describe("ExcalidrawBoard keyboard → History", () => {
  test("Edit shortcuts reach Excalidraw globally; Interact does not", () => {
    expect(editModeHandlesKeyboardGlobally(false)).toBe(true);
    expect(editModeHandlesKeyboardGlobally(true)).toBe(false);
    const src = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    expect(src).toContain("handleKeyboardGlobally={editModeHandlesKeyboardGlobally(viewModeEnabled)}");
    expect(src).not.toContain("handleKeyboardGlobally={false}");
    expect(src).toContain("onFocusCapture={viewModeEnabled ? undefined : stealEditFocusFromOverlay}");
    expect(src).toContain("onKeyDownCapture={viewModeEnabled ? undefined : captureEditUndoHotkey}");
    expect(src).toContain("[data-pt-overlay-id]");
    const app = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(app).toContain('viewModeEnabled={mode === "interact"}');
  });

  test("IMMEDIATELY apply does not focus the board after updateScene", () => {
    const src = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    const bindHost = src.slice(
      src.indexOf("function bindHostApi"),
      src.indexOf("export default function ExcalidrawBoard"),
    );
    expect(bindHost).toContain("followUpImmediateCapture");
    expect(bindHost).toContain("hydrateHandleElements");
    expect(bindHost).toContain("armSkipInkAfterImmediate(api)");
    expect(src).toContain("cloneScenePtCustomData");
    expect(bindHost).not.toContain("bumpImmediateHandleElements");
    expect(bindHost).not.toContain("newElementWith");
    expect(bindHost).not.toContain("peelImmediateHistoryDecoy");
    expect(bindHost).not.toContain("trimImmediateHistoryDecoy");
    expect(bindHost).not.toContain("undoThroughSelectionDecoy");
    expect(bindHost).not.toContain("clickExcalidrawHistoryControl");
    expect(bindHost).not.toContain("sceneExtractPtx");
    expect(bindHost).not.toContain("focusEditBoard");
    expect(bindHost).not.toContain(".focus(");
    expect(src).toContain("function bindHostApi(api: ExcalidrawApi): ExcalidrawHostApi");
    expect(src).toContain("onApiRef.current(bindHostApi(api))");
    expect(src).not.toContain("onApiRef.current(bindHostApi(api, () => boardRef.current))");
    expect(src).toContain("stealEditFocusFromOverlay");
    expect(src).toContain("handleKeyboardGlobally={editModeHandlesKeyboardGlobally(viewModeEnabled)}");
    expect(src).toContain('data-testid="button-undo"');
    const hotkey = src.slice(
      src.indexOf("const captureEditUndoHotkey"),
      src.indexOf("handleSceneChange"),
    );
    expect(hotkey).toContain("undoThroughSelectionDecoy");
    expect(hotkey).toContain("sceneExtractPtx");
    expect(hotkey).toContain("api.getSceneElements()");
    expect(hotkey).toContain("queryUndoControl");
    expect(hotkey).toContain("excalidrawHistoryButton(boardRef.current, \"button-undo\")");
    expect(hotkey).toContain("requestAnimationFrame");
    expect(hotkey).toContain("stopImmediatePropagation");
    expect(hotkey).not.toContain("peelImmediateHistoryDecoy");
    expect(hotkey).not.toContain("trimImmediateHistoryDecoy");
    expect(hotkey).not.toContain("restamp");
  });

  test("bindHost demotes follow-up IMMEDIATELY after the first real write arms recentlyImmediate", () => {
    const src = readFileSync(new URL("./ExcalidrawBoard.tsx", import.meta.url), "utf8");
    const bindHost = src.slice(
      src.indexOf("function bindHostApi"),
      src.indexOf("export default function ExcalidrawBoard"),
    );
    expect(bindHost).toContain("followUpImmediateCapture");
    expect(bindHost).toContain("let recentlyImmediate = false");
    expect(bindHost).toContain("recentlyImmediate = true");
    expect(bindHost).toContain("queueMicrotask");
    expect(bindHost).toContain("requestAnimationFrame");
    expect(bindHost).not.toContain("peelImmediateHistoryDecoy");
    expect(bindHost).not.toContain("trimImmediateHistoryDecoy");
    expect(bindHost).not.toContain("undoThroughSelectionDecoy");
    expect(bindHost).not.toContain("bumpImmediateHandleElements");
    expect(bindHost).not.toContain("clickExcalidrawHistoryControl");
    expect(bindHost).not.toContain("historyButton(");
    const followUpAt = bindHost.indexOf("followUpImmediateCapture");
    const realImmediateAt = bindHost.indexOf('captureUpdate === "IMMEDIATELY"');
    const armAt = bindHost.indexOf("recentlyImmediate = true");
    const updateAt = bindHost.indexOf("api.updateScene({");
    expect(followUpAt).toBeGreaterThan(-1);
    expect(realImmediateAt).toBeGreaterThan(followUpAt);
    expect(armAt).toBeGreaterThan(realImmediateAt);
    expect(updateAt).toBeGreaterThan(armAt);
    const rafAt = bindHost.indexOf("requestAnimationFrame");
    const lastImmediateAt = bindHost.lastIndexOf('captureUpdate === "IMMEDIATELY"');
    const clearAt = bindHost.lastIndexOf("recentlyImmediate = false");
    expect(lastImmediateAt).toBeGreaterThan(updateAt);
    expect(rafAt).toBeGreaterThan(updateAt);
    expect(rafAt).toBeGreaterThan(lastImmediateAt);
    expect(clearAt).toBeGreaterThan(rafAt);
    expect(bindHost.slice(updateAt, clearAt)).toContain("requestAnimationFrame");
    expect(bindHost.slice(updateAt).match(/requestAnimationFrame\(/g)?.length).toBe(1);
    expect(bindHost.slice(updateAt, clearAt)).toContain("queueMicrotask");
    expect(bindHost.slice(updateAt, clearAt)).not.toMatch(
      /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(/,
    );
    expect(bindHost.slice(updateAt, clearAt)).not.toMatch(/queueMicrotask\(\(\) => \{[\s\S]*queueMicrotask\(/);
    const deferredEnd = bindHost.indexOf("scrollToContent:");
    const deferred = bindHost.slice(lastImmediateAt, deferredEnd);
    expect(deferred).toContain("recentlyImmediate = false");
    expect(deferred).toContain("requestAnimationFrame");
    expect(deferred).toContain("queueMicrotask");
    expect(deferred).not.toContain("peelImmediateHistoryDecoy");
    expect(deferred).not.toContain("undoThroughSelectionDecoy");
    expect(deferred).not.toContain("afterPaint");
    expect(deferred).not.toContain("clickExcalidrawHistoryControl");
    expect(deferred).not.toContain("sceneExtractPtx");
    expect(deferred).not.toContain("historyButton(");
    expect(deferred).not.toContain('historyButton("button-undo")');
    expect(deferred).not.toContain('historyButton("button-redo")');
    expect(src).toContain('querySelector(\'[data-testid="button-undo"]\')');
    expect(deferred).not.toContain("undoDisabled");
    expect(deferred).not.toMatch(/api\.updateScene\(\{[\s\S]*hydrateHandleElements/);
    expect(deferred).not.toContain("getSceneElementsIncludingDeleted");
    expect(deferred).not.toContain('followUpImmediateCapture("NEVER"');
    expect(deferred).not.toMatch(/elements: synced/);
    expect(deferred).not.toContain("hydrateHandleElements");
  });
});
