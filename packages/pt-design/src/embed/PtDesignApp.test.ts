import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { memoryPersistence } from "../host/adapters";
import type { HandleElement } from "../protocol";
import { OverlayHost } from "./overlay";
import { keepOverlayThroughEmptyLoad, sameOverlayDocument, sameOverlayViewport, toExcalidrawCompatElements } from "./scene-bridge";
import { createLiveBoard, type Capture } from "./live-board";

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

function createRestoreDropApi() {
  let elements: HandleElement[] = [];
  let appState = {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    width: 800,
    height: 600,
    viewBackgroundColor: "#ffffff",
    selectedElementIds: {} as Record<string, boolean>,
    viewModeEnabled: false as boolean | undefined,
  };
  const api = {
    updateScene(input: {
      elements?: readonly unknown[];
      appState?: Record<string, unknown>;
      captureUpdate?: Capture;
    }) {
      if (input.elements) {
        const converted = toExcalidrawCompatElements(input.elements);
        elements = converted.map((el) => {
          const { customData: _drop, ...rest } = el;
          void _drop;
          return { ...rest } as HandleElement;
        });
      }
      if (input.appState) appState = { ...appState, ...input.appState };
    },
    getSceneElements: () => elements.filter((el) => !el.isDeleted).map((el) => ({ ...el })),
    getSceneElementsIncludingDeleted: () => elements.map((el) => ({ ...el })),
    getAppState: () => appState,
    history: { clear() {} },
  };
  return {
    host: api,
    wipe() {
      elements = [];
    },
    storedWithoutPt() {
      return elements.length > 0 && elements.every((el) => el.customData?.pt === undefined);
    },
  };
}

function createFakeApi(initial: HandleElement[] = []) {
  let elements: HandleElement[] = [...initial];
  let appState = {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    width: 800,
    height: 600,
    viewBackgroundColor: "#ffffff",
    selectedElementIds: {} as Record<string, boolean>,
    viewModeEnabled: false as boolean | undefined,
  };
  const captures: Capture[] = [];
  const cleared = { count: 0 };
  const api = {
    updateScene(input: {
      elements?: readonly unknown[];
      appState?: Record<string, unknown>;
      captureUpdate?: Capture;
    }) {
      if (input.captureUpdate) captures.push(input.captureUpdate);
      if (input.elements) elements = [...(input.elements as HandleElement[])];
      if (input.appState) appState = { ...appState, ...input.appState };
    },
    getSceneElements: () => elements.filter((el) => !el.isDeleted),
    getSceneElementsIncludingDeleted: () => elements,
    getAppState: () => appState,
    history: {
      clear() {
        cleared.count += 1;
      },
    },
  };
  return {
    api,
    captures,
    cleared,
    setElements(next: HandleElement[]) {
      elements = next;
    },
  };
}

describe("overlay identity guards", () => {
  test("same overlay document and viewport do not count as a change", () => {
    const empty = { version: "ptx/1", pages: [{ id: "page", nodes: [] }] };
    expect(sameOverlayDocument(empty, { version: "ptx/1", pages: [{ id: "page", nodes: [] }] })).toBe(true);
    expect(
      sameOverlayViewport(
        { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
        { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false },
      ),
    ).toBe(true);
    expect(
      sameOverlayViewport(
        { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
        { scrollX: 1, scrollY: 0, zoom: { value: 1 } },
      ),
    ).toBe(false);
  });

  test("PtDesignApp skips overlay setState when document and viewport are unchanged", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("syncOverlay");
    expect(src).toContain("sameOverlayDocument");
    expect(src).toContain("sameOverlayViewport");
    expect(src).toContain("overlay={overlay}");
    expect(src).toContain("React.useMemo");
    expect(src).toContain("loadPersist");
    expect(src).toContain("keepOverlayThroughEmptyLoad");
    expect(src).toContain("loadSettledRef");
    expect(src).toContain("disarmLoadRecover");
    expect(src).toContain("if (!loaded?.ptx)");
    expect(src).toContain('board.applyPtx(ptx, "IMMEDIATELY")');
    expect(src).toContain("ptxApplyRequests");
    expect(src).toContain("ptxApplyRequests.has(dispatch.request_id)");
    expect(src).toContain("ptxApplyRequests.add(dispatch.request_id)");
    expect(src).toContain("ptxApplyRequests.delete(dispatch.request_id)");
    expect(src).toMatch(/} finally \{[\s\S]*ptxApplyRequests\.delete\(dispatch\.request_id\)/);
    expect(src).not.toContain("focusEditBoard");
    expect(src).not.toContain("scrollToContent");
    expect(src).not.toContain("isMutatingTool");
    expect(src).toContain('viewModeEnabled={mode === "interact"}');
  });
});

describe("ptx-only persist/load → overlay ids", () => {
  test("ptx-only persist load projects extract and OverlayHost ids including run", async () => {
    const persist = memoryPersistence({ ptx: SEEDED_PTX });
    const loaded = await persist.load();
    expect(loaded && "canvas" in loaded).toBe(false);

    const { api, captures, cleared } = createFakeApi();
    const board = createLiveBoard({
      getSceneElements: () => api.getSceneElementsIncludingDeleted(),
      getAppState: () => api.getAppState(),
      updateScene: (opts) => {
        api.updateScene(opts);
      },
      history: api.history,
    });

    board.loadPersist(loaded);
    expect(cleared.count).toBe(1);
    expect(captures.every((c) => c === "NEVER")).toBe(true);

    const extracted = board.extract();
    const ids = extracted.pages[0]?.nodes.map((n) => n.id) ?? [];
    expect(ids).toContain("model");
    expect(ids).toContain("prompt");
    expect(ids).toContain("run");

    const html = renderToStaticMarkup(
      createElement(OverlayHost, {
        document: extracted,
        mode: "edit",
        appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
        onCommit: () => {},
      }),
    );
    expect(html).toContain('data-pt-overlay-id="model"');
    expect(html).toContain('data-pt-overlay-id="prompt"');
    expect(html).toContain('data-pt-overlay-id="run"');
  });

  test("restore-drop hydrate path still renders OverlayHost ids including run", async () => {
    const persist = memoryPersistence({ ptx: SEEDED_PTX });
    const loaded = await persist.load();
    const { host, storedWithoutPt } = createRestoreDropApi();
    const board = createLiveBoard({
      getSceneElements: () => host.getSceneElementsIncludingDeleted(),
      getAppState: () => host.getAppState(),
      updateScene: (opts) => {
        host.updateScene(opts);
      },
      history: host.history,
    });
    board.loadPersist(loaded);
    expect(storedWithoutPt()).toBe(true);
    const extracted = board.extract();
    const html = renderToStaticMarkup(
      createElement(OverlayHost, {
        document: extracted,
        mode: "edit",
        appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
        onCommit: () => {},
      }),
    );
    expect(html).toContain('data-pt-overlay-id="model"');
    expect(html).toContain('data-pt-overlay-id="prompt"');
    expect(html).toContain('data-pt-overlay-id="run"');
  });

  test("delayed empty onChange after ptx-only load does not persist empty ptx over the seed", async () => {
    const persist = memoryPersistence({ ptx: SEEDED_PTX });
    const saves: Array<{ ptx?: string }> = [];
    const wrapped = {
      load: persist.load,
      async save(doc: { ptx: string }) {
        saves.push(doc);
        return persist.save(doc);
      },
    };
    const loaded = await wrapped.load();
    const { host, wipe } = createRestoreDropApi();
    const board = createLiveBoard({
      getSceneElements: () => host.getSceneElementsIncludingDeleted(),
      getAppState: () => host.getAppState(),
      updateScene: (opts) => {
        host.updateScene(opts);
      },
      history: host.history,
    });
    let loading = true;
    const loadSettled = true;
    let overlay = board.extract();
    board.loadPersist(loaded);
    overlay = board.extract();
    expect(overlay.pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);

    wipe();
    const { echo, document } = board.onHostChange();
    if (!keepOverlayThroughEmptyLoad(overlay, document, loading)) overlay = document;
    if (echo || loading) {
      if (!echo && loadSettled) loading = false;
      if (echo || loading) {
        /* persist skipped — same as PtDesignApp handleBoardChange */
      } else {
        await wrapped.save({ ptx: board.extractPtx() });
      }
    } else {
      await wrapped.save({ ptx: board.extractPtx() });
    }

    expect(overlay.pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    const html = renderToStaticMarkup(
      createElement(OverlayHost, {
        document: overlay,
        mode: "edit",
        appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
        onCommit: () => {},
      }),
    );
    expect(html).toContain('data-pt-overlay-id="run"');
    expect(saves).toEqual([]);
    const stored = await persist.load();
    expect(stored?.ptx).toContain('id="run"');
    expect(echo).toBe(true);
  });

  test("after ptx load, live x/y extract follows host geometry; apply IMMEDIATELY does not clear history", async () => {
    const persist = memoryPersistence({ ptx: SEEDED_PTX });
    const loaded = await persist.load();
    const { api, captures, cleared } = createFakeApi();
    const board = createLiveBoard({
      getSceneElements: () => api.getSceneElementsIncludingDeleted(),
      getAppState: () => api.getAppState(),
      updateScene: (opts) => {
        api.updateScene(opts);
      },
      history: api.history,
    });
    board.loadPersist(loaded);
    expect(cleared.count).toBe(1);
    const live = api.getSceneElementsIncludingDeleted();
    const run = live.find((el) => el.customData?.pt?.id === "run");
    expect(run).toBeDefined();
    run!.x = 400;
    run!.y = 360;
    const moved = board.extract().pages[0]!.nodes.find((n) => n.id === "run");
    expect(moved?.x).toBe(400);
    expect(moved?.y).toBe(360);

    const edited = board.extractPtx().replace("claude", "deepseek");
    board.applyPtx(edited, "IMMEDIATELY");
    expect(captures.at(-1)).toBe("IMMEDIATELY");
    expect(captures.filter((c) => c === "IMMEDIATELY")).toHaveLength(1);
    expect(cleared.count).toBe(1);
    expect(board.extractPtx()).toContain("deepseek");
  });

  test("host undo dropping customData while keeping the applied nonce does not refill deepseek", async () => {
    const persist = memoryPersistence({ ptx: SEEDED_PTX });
    const loaded = await persist.load();
    const { api, captures, cleared, setElements } = createFakeApi();
    const board = createLiveBoard({
      getSceneElements: () => api.getSceneElementsIncludingDeleted(),
      getAppState: () => api.getAppState(),
      updateScene: (opts) => {
        api.updateScene(opts);
      },
      history: api.history,
    });
    board.loadPersist(loaded);
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(captures.at(-1)).toBe("IMMEDIATELY");
    expect(cleared.count).toBe(1);
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    const applied = api.getSceneElementsIncludingDeleted().map((el) => ({ ...el }));
    const appliedNonceById = new Map(
      applied.map((el) => [el.id, (el as { versionNonce?: number }).versionNonce]),
    );
    setElements(
      applied.map((el) => {
        const { customData: _omit, ...rest } = el;
        void _omit;
        return { ...rest } as HandleElement;
      }),
    );
    for (const el of api.getSceneElementsIncludingDeleted()) {
      expect(el.customData?.pt).toBeUndefined();
      expect((el as { versionNonce?: number }).versionNonce).toBe(appliedNonceById.get(el.id));
    }
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(cleared.count).toBe(1);
  });

  test("host undo restoring full pre-apply elements does not keep the applied option", async () => {
    const persist = memoryPersistence({ ptx: SEEDED_PTX });
    const loaded = await persist.load();
    const { api, captures, cleared, setElements } = createFakeApi();
    const board = createLiveBoard({
      getSceneElements: () => api.getSceneElementsIncludingDeleted(),
      getAppState: () => api.getAppState(),
      updateScene: (opts) => {
        api.updateScene(opts);
      },
      history: api.history,
    });
    board.loadPersist(loaded);
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const preApply = api.getSceneElementsIncludingDeleted().map((el) => ({
      ...el,
      customData: el.customData ? { pt: { ...el.customData.pt } } : el.customData,
    }));
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(captures.at(-1)).toBe("IMMEDIATELY");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    setElements(preApply);
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(cleared.count).toBe(1);
  });

  test("host undo restoring applied nonce with History-restored payload drops the applied option", async () => {
    const persist = memoryPersistence({ ptx: SEEDED_PTX });
    const loaded = await persist.load();
    const { api, captures, cleared, setElements } = createFakeApi();
    const board = createLiveBoard({
      getSceneElements: () => api.getSceneElementsIncludingDeleted(),
      getAppState: () => api.getAppState(),
      updateScene: (opts) => {
        api.updateScene(opts);
      },
      history: api.history,
    });
    board.loadPersist(loaded);
    expect(cleared.count).toBe(1);
    expect(board.onHostChange().echo).toBe(true);
    const preApply = api.getSceneElementsIncludingDeleted().map((el) => ({ ...el }));
    const edited = board.extractPtx().replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    board.applyPtx(edited, "IMMEDIATELY");
    expect(captures.at(-1)).toBe("IMMEDIATELY");
    expect(board.extractPtx()).toContain("deepseek");
    expect(board.onHostChange().echo).toBe(true);

    const applied = api.getSceneElementsIncludingDeleted();
    setElements(
      applied.map((el) => {
        const prev = preApply.find((item) => item.id === el.id);
        return { ...el, customData: prev?.customData };
      }),
    );
    const undone = board.onHostChange();
    expect(undone.echo).toBe(false);
    expect(board.extractPtx()).not.toContain("deepseek");
    expect(board.extractPtx()).toContain("claude");
    expect(board.extract().pages[0]?.nodes.map((n) => n.id)).toEqual(["model", "prompt", "run"]);
    expect(cleared.count).toBe(1);
  });

  test("palette insert uses clear placement instead of stacking at a fixed origin", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("catalogPlaceAt");
    expect(src).toContain("sceneViewportRect");
    expect(src).toContain("PLACE_VIEWPORT_CHROME");
    expect(src).toContain("SelectionPropsRail");
    expect(src).toContain("selectedNodeIdFromBoardSelection");
    expect(src).not.toContain("72 / zoom");
    expect(src).not.toContain("96 / zoom");
  });
});
