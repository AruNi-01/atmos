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

  test("PtDesignApp uses the apply gate and persist debounce", () => {
    const src = readFileSync(new URL("./PtDesignApp.tsx", import.meta.url), "utf8");
    expect(src).toContain("createApplyGate");
    expect(src).toContain("createPersistDebouncer");
    expect(src).toContain("applyGateRef.current.consume()");
    expect(src).toContain("debouncer.flush()");
    expect(src).not.toMatch(/applyingRef\.current = false/);
  });
});
