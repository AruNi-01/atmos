import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createApplyGate } from "./apply-gate";
import { createLiveBoard } from "./live-board";
import type { HandleElement } from "../protocol";

describe("apply gate", () => {
  test("consume ignores the first onChange after begin", () => {
    const gate = createApplyGate();
    expect(gate.consume()).toBe(false);
    gate.begin();
    expect(gate.isPending()).toBe(true);
    expect(gate.consume()).toBe(true);
    expect(gate.isPending()).toBe(false);
    expect(gate.consume()).toBe(false);
    gate.begin();
    gate.begin();
    gate.reset();
    expect(gate.isPending()).toBe(false);
    expect(gate.consume()).toBe(false);
  });

  test("live board treats programmatic apply as echo", () => {
    let elements: HandleElement[] = [];
    const board = createLiveBoard({
      getSceneElements: () => elements,
      getAppState: () => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      updateScene: (opts) => {
        if (opts.elements) elements = opts.elements;
      },
    });
    board.applyPtx(
      `<page id="p"><button id="run" label="Run" x="10" y="10" width="80" height="32"/></page>`,
      "IMMEDIATELY",
    );
    const echo = board.onHostChange();
    expect(echo.echo).toBe(true);
    expect(echo.document.pages[0]?.nodes[0]?.id).toBe("run");
    expect(board.onHostChange().echo).toBe(false);
  });

  test("PtDesignApp uses the live board and persist debounce", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("createLiveBoard");
    expect(src).toContain("createPersistDebouncer");
    expect(src).toContain("board.onHostChange()");
    expect(src).toContain("syncOverlay");
    expect(src).toContain("persistDebouncer");
    expect(src).not.toContain("createBoardSync");
    expect(src).not.toContain("createPtDesignSession");
    expect(src).not.toContain("replaceSession");
  });

  test("PtDesignApp does not push the scene from the Excalidraw API callback", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("setBoardReady");
    expect(src).toContain("onApi={attachHost}");
    expect(src).not.toMatch(/onApi=\{\(api\) => \{[\s\S]*pushScene\(\)/);
  });
});
