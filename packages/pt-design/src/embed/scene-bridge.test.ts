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
});
