import { describe, expect, test } from "bun:test";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "./shadcn-list";
import { getComponentTemplate, listComponentTypes } from "./registry";
import { createPtDesignSession } from "../core/session";
import { encodeDesignIR } from "../ir/encode";

describe("catalog completeness", () => {
  test("every pinned basic id is registered", () => {
    const types = new Set(listComponentTypes().map((e) => e.componentType));
    const missing = SHADCN_BASIC_IDS.filter((id) => !types.has(id));
    expect(missing).toEqual([]);
  });

  test("required blocks are registered", () => {
    const types = new Set(listComponentTypes().map((e) => e.componentType));
    for (const id of REQUIRED_BLOCKS) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("every basic id and block can be placed into IR", () => {
    const session = createPtDesignSession();
    let x = 0;
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS]) {
      session.dispatch({ type: "place", componentType: id, at: { x, y: 0 } });
      x += 40;
    }
    const ir = encodeDesignIR(session.getScene());
    const types = new Set([
      ...ir.freeNodes.map((n) => n.componentType),
      ...ir.frames.flatMap((f) => f.nodes.map((n) => n.componentType)),
    ]);
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS]) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("button template uses bare componentType", () => {
    const built = getComponentTemplate("button", {
      x: 0,
      y: 0,
      props: { label: "Save" },
    });
    const root = built.elements.find((el) => el.id === built.rootId);
    expect(root?.customData?.pt?.componentType).toBe("button");
    expect(root?.customData?.pt?.componentType).not.toBe("pt.button");
  });
});
