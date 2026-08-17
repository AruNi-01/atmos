import { describe, expect, test } from "bun:test";
import { createPtDesignSession } from "../core/session";
import { encodeDesignIR } from "../ir/encode";
import {
  excalidrawElementsToScene,
  sceneFingerprint,
  sceneToExcalidrawElements,
} from "./scene-bridge";

describe("excalidraw scene bridge", () => {
  test("round-trip keeps component metadata and required fields", () => {
    const session = createPtDesignSession();
    session.dispatch({
      type: "place",
      componentType: "button",
      at: { x: 12, y: 24 },
      props: { label: "Save" },
    });
    const scene = session.getScene();
    const elements = sceneToExcalidrawElements(scene);
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.strokeStyle).toBe("solid");
      expect(typeof el.version).toBe("number");
      expect(el.link).toBeNull();
      expect(el.index).toBeNull();
    }
    const root = elements.find((el) => el.customData?.pt?.componentType === "button");
    expect(root?.customData?.pt?.props.label).toBe("Save");

    const moved = elements.map((el) =>
      el.customData?.pt?.componentType === "button" ? { ...el, x: el.x + 40 } : el,
    );
    const next = excalidrawElementsToScene(moved, { viewBackgroundColor: "#ffffff" });
    const ir = encodeDesignIR(next);
    expect(ir.freeNodes[0]?.componentType).toBe("button");
    expect(ir.freeNodes[0]?.bbox.x).toBe(52);
    expect(sceneFingerprint(next)).not.toBe(sceneFingerprint(scene));
  });

  test("dark theme remaps fills and text so labels stay readable", () => {
    const session = createPtDesignSession();
    session.dispatch({
      type: "place",
      componentType: "alert-dialog",
      at: { x: 0, y: 0 },
      variant: "open",
    });
    const dark = sceneToExcalidrawElements(session.getScene(), "dark");
    const title = dark.find((el) => el.type === "text" && el.text === "Alert Dialog");
    const panel = dark.find((el) => el.customData?.pt?.componentType === "alert-dialog");
    expect(title?.fontFamily).toBe(2);
    expect(title?.lineHeight).toBe(1.25);
    expect(title?.strokeColor).toBe("#f4f4f5");
    expect(panel?.backgroundColor).toBe("#2e2e33");
    const continueLabel = dark.find((el) => el.type === "text" && el.text === "Continue");
    expect(continueLabel?.strokeColor).toBe("#18181b");
    const back = excalidrawElementsToScene(dark, { viewBackgroundColor: "#242428" }, "dark");
    const canonical = back.elements.find((el) => el.customData?.pt?.componentType === "alert-dialog");
    expect(canonical?.backgroundColor).toBe("#ffffff");
    const canonicalTitle = back.elements.find((el) => el.type === "text" && el.text === "Alert Dialog");
    expect(canonicalTitle?.strokeColor).toBe("#18181b");
  });

  test("tall unbound labels are recentered when pushed to the board", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 }, props: { label: "Save" } });
    const scene = session.getScene();
    const withTall = {
      ...scene,
      elements: scene.elements.map((el) =>
        el.type === "text" ? { ...el, y: 0, height: 32, verticalAlign: "middle" as const } : el,
      ),
    };
    const shown = sceneToExcalidrawElements(withTall, "light");
    const label = shown.find((el) => el.type === "text");
    expect(label?.height).toBe(16);
    expect(label?.y).toBe(8);
  });

  test("Virgil text is coerced to local Helvetica so labels do not depend on font assets", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const scene = session.getScene();
    const withVirgil = {
      ...scene,
      elements: scene.elements.map((el) => (el.type === "text" ? { ...el, fontFamily: 1 } : el)),
    };
    const shown = sceneToExcalidrawElements(withVirgil, "light");
    expect(shown.filter((el) => el.type === "text").every((el) => el.fontFamily === 2)).toBe(true);
    const stored = excalidrawElementsToScene(shown, { viewBackgroundColor: "#ffffff" }, "light");
    expect(stored.elements.filter((el) => el.type === "text").every((el) => el.fontFamily === 2)).toBe(true);
  });
});

