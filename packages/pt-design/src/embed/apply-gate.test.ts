import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createPtDesignSession } from "../core/session";
import { createApplyGate } from "./apply-gate";
import {
  excalidrawElementsToScene,
  sceneFingerprint,
  sceneToExcalidrawElements,
  type ExcalidrawCompatElement,
  type ExcalidrawHostApi,
} from "./scene-bridge";

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

  test("async updateScene onChange does not replace the pushed session", async () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const before = sceneFingerprint(session.getScene());
    const gate = createApplyGate();
    let stored: ExcalidrawCompatElement[] = [];
    const onChange = (elements: readonly ExcalidrawCompatElement[]) => {
      if (gate.consume()) return;
      session.dispatch({
        type: "replaceScene",
        scene: excalidrawElementsToScene(elements, { viewBackgroundColor: "#ffffff" }, "light"),
      });
    };
    const api: Pick<ExcalidrawHostApi, "updateScene"> = {
      updateScene({ elements }) {
        stored = (elements ?? []).map((el) => ({ ...el, roughness: 99 }));
        queueMicrotask(() => onChange(stored));
      },
    };
    gate.begin();
    api.updateScene({ elements: sceneToExcalidrawElements(session.getScene(), "light") });
    await Promise.resolve();
    expect(sceneFingerprint(session.getScene())).toBe(before);
    expect(session.getScene().elements.every((el) => el.roughness !== 99)).toBe(true);
  });

  test("two programmatic updates each consume one async onChange", async () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const before = sceneFingerprint(session.getScene());
    const gate = createApplyGate();
    const queued: Array<() => void> = [];
    const onChange = (elements: readonly ExcalidrawCompatElement[]) => {
      if (gate.consume()) return;
      session.dispatch({
        type: "replaceScene",
        scene: excalidrawElementsToScene(elements, { viewBackgroundColor: "#ffffff" }, "light"),
      });
    };
    const api: Pick<ExcalidrawHostApi, "updateScene"> = {
      updateScene({ elements }) {
        const mutated = (elements ?? []).map((el) => ({ ...el, roughness: 99 }));
        queued.push(() => onChange(mutated));
      },
    };
    gate.begin();
    api.updateScene({ elements: sceneToExcalidrawElements(session.getScene(), "light") });
    gate.begin();
    api.updateScene({ elements: sceneToExcalidrawElements(session.getScene(), "light") });
    expect(queued).toHaveLength(2);
    queued[0]?.();
    queued[1]?.();
    expect(sceneFingerprint(session.getScene())).toBe(before);
    expect(session.getScene().elements.every((el) => el.roughness !== 99)).toBe(true);
  });

  test("PtDesignApp does not echo board strokes back into Excalidraw", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("echoFromBoardRef.current = true");
    expect(src).toContain("if (echoFromBoardRef.current) return;");
  });

  test("PtDesignApp uses the apply gate and persist debounce", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("createBoardSync");
    expect(src).toContain("createPersistDebouncer");
    expect(src).toContain("boardSync.runHeld");
    expect(src).toContain("boardSync.commit");
    expect(src).toContain("boardSync.drain");
    expect(src).toContain("boardSync.onBoardChange");
    expect(src).toContain("debouncer.flush()");
    expect(src).not.toContain("applyGateRef.current.consume()");
    expect(src).not.toMatch(/applyingRef\.current = false/);
  });

  test("PtDesignApp does not push the scene from the Excalidraw API callback", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("setBoardReady");
    expect(src).toContain("onApi={handleApi}");
    expect(src).not.toMatch(/onApi=\{\(api\) => \{[\s\S]*pushScene\(\)/);
    expect(src).not.toMatch(/setCameraTick\(\(n\) => n \+ 1\);\s*\n\s*\n\s*if \(applyGateRef/);
  });
});
