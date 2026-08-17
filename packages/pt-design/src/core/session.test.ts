import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPtDesignSession } from "./session";
import { initDesignDocument, openDesignDocument, saveDesignDocument } from "./document";
import { encodeDesignIR, normalizeIR } from "../ir/encode";
import { applyDesignIR } from "../ir/apply";
import { HANDOFF_INSTRUCTIONS } from "../ir/handoff";
import { PT_ERROR_CODES, isPtDesignError } from "../agent/errors";
import { emptyScene } from "./types";

describe("session + IR", () => {
  test("place update delete and frame membership", () => {
    const session = createPtDesignSession();
    const { frameId } = session.dispatch({
      type: "createFrame",
      name: "Login",
      bbox: { x: 0, y: 0, w: 400, h: 300 },
    });
    const { instanceId: inputId } = session.dispatch({
      type: "place",
      componentType: "input",
      at: { x: 20, y: 20 },
      frameId,
    });
    const { instanceId: buttonId } = session.dispatch({
      type: "place",
      componentType: "button",
      at: { x: 20, y: 80 },
      props: { label: "Save" },
    });
    session.dispatch({
      type: "update",
      instanceId: buttonId!,
      props: { label: "Publish" },
    });
    const afterUpdate = session.getIR();
    const btn = afterUpdate.freeNodes.find((n) => n.instanceId === buttonId);
    expect(btn?.props.label).toBe("Publish");
    expect(btn?.instanceId).toBe(buttonId);
    expect(btn?.componentType).toBe("button");

    session.dispatch({ type: "delete", instanceIds: [inputId!] });
    const ir = session.getIR({ frameId: "Login" });
    expect(ir.frames).toHaveLength(1);
    expect(ir.frames[0]?.name).toBe("Login");
    expect(ir.frames[0]?.nodes.some((n) => n.instanceId === inputId)).toBe(false);
  });

  test("place with a missing frame does not change the scene", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const before = session.getScene().elements.length;
    try {
      session.dispatch({
        type: "place",
        componentType: "input",
        at: { x: 8, y: 8 },
        frameId: "Missing",
      });
      throw new Error("should have thrown");
    } catch (error) {
      expect(isPtDesignError(error)).toBe(true);
      if (isPtDesignError(error)) expect(error.code).toBe(PT_ERROR_CODES.NOT_FOUND);
    }
    expect(session.getScene().elements.length).toBe(before);
    expect(session.getIR().freeNodes.some((n) => n.componentType === "input")).toBe(false);
  });

  test("unknown type and unknown id reject", () => {
    const session = createPtDesignSession();
    try {
      session.dispatch({ type: "place", componentType: "not-a-real-type", at: { x: 0, y: 0 } });
      throw new Error("should have thrown");
    } catch (error) {
      expect(isPtDesignError(error)).toBe(true);
      if (isPtDesignError(error)) expect(error.code).toBe(PT_ERROR_CODES.UNKNOWN_COMPONENT_TYPE);
    }
    try {
      session.dispatch({ type: "update", instanceId: "missing", props: { label: "x" } });
      throw new Error("should have thrown");
    } catch (error) {
      expect(isPtDesignError(error)).toBe(true);
      if (isPtDesignError(error)) expect(error.code).toBe(PT_ERROR_CODES.NOT_FOUND);
    }
  });

  test("handoff document has instructions", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const payload = session.buildHandoff({ scope: "document" });
    expect(payload.version).toBe(1);
    expect(payload.ir.version).toBe("pt-design-ir/1");
    expect(payload.instructions).toBe(HANDOFF_INSTRUCTIONS);
    expect(payload.instructions.length).toBeGreaterThan(40);
  });

  test("scene file round-trip keeps types", () => {
    const dir = mkdtempSync(join(tmpdir(), "pt-design-"));
    const path = join(dir, "app.ptdesign.json");
    const session = createPtDesignSession();
    session.dispatch({
      type: "place",
      componentType: "button",
      at: { x: 10, y: 10 },
      props: { label: "Go" },
    });
    const saved = saveDesignDocument(path, initDesignDocument(path));
    const rewritten = saveDesignDocument(path, { ...saved, scene: session.getScene() });
    const loaded = openDesignDocument(path);
    expect(rewritten.format).toBe("pt-design-file/1");
    const next = createPtDesignSession(loaded.scene);
    const ir = next.getIR();
    expect(ir.freeNodes.some((n) => n.componentType === "button")).toBe(true);
  });

  test("applyIR merge does not delete unspecified", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const other = createPtDesignSession();
    other.dispatch({ type: "place", componentType: "input", at: { x: 10, y: 80 } });
    const merged = applyDesignIR(session.getScene(), encodeDesignIR(other.getScene()), "merge");
    const ir = encodeDesignIR(merged);
    const types = ir.freeNodes.map((n) => n.componentType).sort();
    expect(types).toEqual(["button", "input"]);
  });

  test("variant update keeps instanceId", () => {
    const session = createPtDesignSession();
    const { instanceId } = session.dispatch({
      type: "place",
      componentType: "button",
      at: { x: 0, y: 0 },
      variant: "default",
    });
    session.dispatch({ type: "update", instanceId: instanceId!, variant: "outline" });
    const node = session.getIR().freeNodes[0];
    expect(node?.instanceId).toBe(instanceId);
    expect(node?.variant).toBe("outline");
  });

  test("normalizeIR drops clocks and ids", () => {
    const a = createPtDesignSession();
    const b = createPtDesignSession();
    a.dispatch({ type: "place", componentType: "button", at: { x: 8, y: 8 }, props: { label: "A" } });
    b.dispatch({ type: "place", componentType: "button", at: { x: 8, y: 8 }, props: { label: "A" } });
    expect(normalizeIR(a.getIR())).toEqual(normalizeIR(b.getIR()));
  });

  test("freehand does not crash encode", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const scene = session.getScene();
    scene.elements.push({
      id: "stroke1",
      type: "freedraw",
      x: 1,
      y: 1,
      width: 10,
      height: 10,
      angle: 0,
      strokeColor: "#000",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      locked: false,
    });
    const ir = encodeDesignIR(scene);
    expect(ir.freeNodes.some((n) => n.componentType === "button")).toBe(true);
  });

  test("applyIR replace materializes frames onto an empty scene", () => {
    const session = createPtDesignSession();
    const { frameId } = session.dispatch({
      type: "createFrame",
      name: "Login",
      bbox: { x: 10, y: 20, w: 400, h: 300 },
    });
    session.dispatch({
      type: "place",
      componentType: "button",
      at: { x: 30, y: 50 },
      frameId,
      props: { label: "Go" },
    });
    const ir = session.getIR();
    expect(ir.frames[0]?.name).toBe("Login");
    const scene = applyDesignIR(emptyScene(), ir, "replace");
    const encoded = encodeDesignIR(scene);
    const next = createPtDesignSession(scene).getIR();
    expect(scene.elements.some((el) => el.type === "frame" && el.id === frameId)).toBe(true);
    expect(encoded.frames).toHaveLength(1);
    expect(encoded.frames[0]?.id).toBe(frameId);
    expect(encoded.frames[0]?.name).toBe("Login");
    expect(encoded.frames[0]?.bbox).toEqual({ x: 10, y: 20, w: 400, h: 300 });
    expect(encoded.frames[0]?.nodes.some((n) => n.componentType === "button")).toBe(true);
    expect(encoded.freeNodes).toEqual([]);
    expect(next.frames[0]?.name).toBe("Login");
    expect(next.frames[0]?.nodes.some((n) => n.componentType === "button")).toBe(true);
  });

  test("applyIR replace drops leftover children when swapping types", () => {
    const session = createPtDesignSession();
    session.dispatch({
      type: "place",
      componentType: "button",
      at: { x: 0, y: 0 },
      instanceId: "swap",
      props: { label: "Button" },
    });
    expect(session.getScene().elements.filter((el) => !el.isDeleted).length).toBeGreaterThan(1);

    const incoming = createPtDesignSession();
    incoming.dispatch({
      type: "place",
      componentType: "input",
      at: { x: 0, y: 0 },
      instanceId: "swap",
    });
    const replaced = applyDesignIR(session.getScene(), encodeDesignIR(incoming.getScene()), "replace");
    const live = replaced.elements.filter((el) => !el.isDeleted);
    const inputLive = incoming.getScene().elements.filter((el) => !el.isDeleted);
    expect(live.length).toBe(inputLive.length);
    expect(live.some((el) => el.customData?.pt?.componentType === "button")).toBe(false);
    expect(live.some((el) => el.customData?.pt?.componentType === "input")).toBe(true);
    expect(live.some((el) => el.type === "text" && el.text === "Button")).toBe(false);
  });

  test("applyIR replace keeps non-pt decoration", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "button", at: { x: 0, y: 0 } });
    const scene = session.getScene();
    scene.elements.push({
      id: "stroke1",
      type: "freedraw",
      x: 1,
      y: 1,
      width: 10,
      height: 10,
      angle: 0,
      strokeColor: "#000",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      locked: false,
    });
    const other = createPtDesignSession();
    other.dispatch({ type: "place", componentType: "input", at: { x: 8, y: 8 } });
    const replaced = applyDesignIR(scene, encodeDesignIR(other.getScene()), "replace");
    expect(replaced.elements.some((el) => el.id === "stroke1")).toBe(true);
    expect(encodeDesignIR(replaced).freeNodes.some((n) => n.componentType === "input")).toBe(true);
    expect(encodeDesignIR(replaced).freeNodes.some((n) => n.componentType === "button")).toBe(false);
  });
});
