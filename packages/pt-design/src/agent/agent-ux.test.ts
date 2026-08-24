import { describe, expect, test } from "bun:test";
import { createPtDesignSession } from "../core/session";
import { getComponentTemplate } from "../catalog/registry";
import { estimateTextWidth } from "../catalog/primitives";
import { runSessionTool } from "./session-tools";
import { isPtDesignError } from "./errors";

describe("agent drawing UX", () => {
  test("catalog list tells the truth about size and props", () => {
    const session = createPtDesignSession();
    const listed = runSessionTool(session, { name: "pt_catalog_list", args: {} }) as {
      items: Array<{
        componentType: string;
        label: string;
        kind: string;
        propKeys: string[];
        defaultVariant: string;
        defaultBBox: { w: number; h: number };
      }>;
      total: number;
      has_more: boolean;
    };
    const card = listed.items.find((item) => item.componentType === "card");
    const dialog = listed.items.find((item) => item.componentType === "dialog");
    const accordion = listed.items.find((item) => item.componentType === "accordion");
    expect(listed.has_more).toBe(false);
    expect(listed.total).toBeGreaterThan(60);
    expect(card?.label).toBe("Card");
    expect(card?.kind).toBe("basic");
    expect(card?.propKeys).toEqual(["title", "description", "action"]);
    expect(card?.defaultBBox).toEqual({ w: 280, h: 168 });
    expect(dialog?.defaultVariant).toBe("trigger");
    expect(accordion?.propKeys).toEqual(["title", "description"]);
  });

  test("CJK labels get a wider button than latin of the same length", () => {
    const latin = getComponentTemplate("button", { x: 0, y: 0, props: { label: "abcd" } });
    const cjk = getComponentTemplate("button", { x: 0, y: 0, props: { label: "开始使用" } });
    expect(estimateTextWidth("开始使用")).toBeGreaterThan(estimateTextWidth("abcd"));
    expect(cjk.width).toBeGreaterThan(latin.width);
    expect(cjk.width).toBeGreaterThan(72);
  });

  test("accordion and tabs render agent props instead of locked copy", () => {
    const accordion = getComponentTemplate("accordion", {
      x: 0,
      y: 0,
      variant: "expanded",
      props: { title: "What is Atmos?", description: "A local-first agent workspace." },
    });
    const texts = accordion.elements.map((el) => el.text).filter(Boolean);
    expect(texts).toContain("What is Atmos?");
    expect(texts).toContain("A local-first agent workspace.");
    expect(texts.some((text) => text?.includes("Is it accessible?"))).toBe(false);

    const tabs = getComponentTemplate("tabs", {
      x: 0,
      y: 0,
      props: { title: "Overview, Pricing", description: "Plans start free." },
    });
    const tabTexts = tabs.elements.map((el) => el.text).filter(Boolean);
    expect(tabTexts).toContain("Overview");
    expect(tabTexts).toContain("Pricing");
    expect(tabTexts).toContain("Plans start free.");
  });

  test("agent place without variant puts a single overlay trigger", () => {
    const session = createPtDesignSession();
    const placed = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "dialog", at: { x: 0, y: 0 } },
    }) as { instanceIds: string[]; bbox: { w: number } };
    const nodes = session.getIR().freeNodes.filter((n) => n.componentType === "dialog");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.variant).toBe("trigger");
    expect(placed.instanceIds).toHaveLength(1);
    expect(placed.bbox.w).toBeLessThan(200);
  });

  test("showcase mode still dumps overlay variants", () => {
    const session = createPtDesignSession();
    runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "dialog", at: { x: 0, y: 0 }, mode: "showcase" },
    });
    const nodes = session.getIR().freeNodes.filter((n) => n.componentType === "dialog");
    expect(nodes.map((n) => n.variant).sort()).toEqual(["open", "trigger"]);
  });

  test("place at is relative to the frame origin", () => {
    const session = createPtDesignSession();
    const created = runSessionTool(session, {
      name: "pt_frame_create",
      args: { name: "Desktop", preset: "desktop", x: 100, y: 80 },
    }) as { frameId: string };
    const frame = session.getIR().frames[0];
    expect(frame?.bbox).toEqual({ x: 100, y: 80, w: 1440, h: 1024 });
    const placed = runSessionTool(session, {
      name: "pt_place",
      args: {
        componentType: "button",
        frameId: created.frameId,
        at: { x: 20, y: 40 },
        props: { label: "Go" },
      },
    }) as { bbox: { x: number; y: number }; warnings: Array<{ code: string }> };
    expect(placed.bbox).toMatchObject({ x: 120, y: 120 });
    expect(placed.warnings.some((w) => w.code === "OUTSIDE_FRAME")).toBe(false);
    const ignored = runSessionTool(session, {
      name: "pt_place",
      args: {
        componentType: "button",
        frameId: created.frameId,
        at: { x: 20, y: 80 },
        props: { title: "not a button prop", label: "Ok" },
      },
    }) as { warnings: Array<{ code: string }> };
    expect(ignored.warnings.some((w) => w.code === "PROP_IGNORED")).toBe(true);
  });

  test("below inherits the anchor frame and stacks with a gap", () => {
    const session = createPtDesignSession();
    const { frameId } = runSessionTool(session, {
      name: "pt_frame_create",
      args: { name: "Page", x: 0, y: 0, w: 800, h: 600 },
    }) as { frameId: string };
    const first = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "card", frameId, at: { x: 24, y: 24 } },
    }) as { instanceId: string; bbox: { x: number; y: number; h: number } };
    const second = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "card", below: { instanceId: first.instanceId, gap: 16 } },
    }) as { bbox: { x: number; y: number } };
    expect(second.bbox.x).toBe(first.bbox.x);
    expect(second.bbox.y).toBe(first.bbox.y + first.bbox.h + 16);
    expect(session.getIR().frames[0]?.nodes).toHaveLength(2);
  });

  test("frame update moves children and delete removes them", () => {
    const session = createPtDesignSession();
    const { frameId } = runSessionTool(session, {
      name: "pt_frame_create",
      args: { name: "A", x: 10, y: 20, w: 400, h: 300 },
    }) as { frameId: string };
    const placed = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "button", frameId, at: { x: 8, y: 8 } },
    }) as { instanceId: string; bbox: { x: number; y: number } };
    expect(placed.bbox).toMatchObject({ x: 18, y: 28 });
    runSessionTool(session, { name: "pt_frame_update", args: { frameId, x: 50, y: 60, w: 500, h: 400 } });
    const moved = session.getIR().frames[0];
    expect(moved?.bbox).toEqual({ x: 50, y: 60, w: 500, h: 400 });
    expect(moved?.nodes[0]?.bbox).toMatchObject({ x: 58, y: 68 });
    runSessionTool(session, { name: "pt_frame_delete", args: { frameId } });
    expect(session.getIR().frames).toHaveLength(0);
    expect(session.getIR().freeNodes).toHaveLength(0);
  });

  test("pt_update moves bbox in scene coordinates", () => {
    const session = createPtDesignSession();
    const placed = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "button", at: { x: 10, y: 10 } },
    }) as { instanceId: string };
    runSessionTool(session, {
      name: "pt_update",
      args: { instanceId: placed.instanceId, bbox: { x: 80, y: 40 } },
    });
    expect(session.getIR().freeNodes[0]?.bbox).toMatchObject({ x: 80, y: 40 });
  });

  test("pt_update bbox w/h is stored in IR", () => {
    const session = createPtDesignSession();
    const placed = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "card", at: { x: 0, y: 0 } },
    }) as { instanceId: string };
    runSessionTool(session, {
      name: "pt_update",
      args: { instanceId: placed.instanceId, bbox: { w: 420, h: 176 } },
    });
    expect(session.getIR().freeNodes[0]?.bbox).toMatchObject({ w: 420, h: 176 });
  });

  test("layout grid spreads cards by width plus gap", () => {
    const session = createPtDesignSession();
    const ids = [0, 1, 2].map((index) => {
      const placed = runSessionTool(session, {
        name: "pt_place",
        args: { componentType: "card", at: { x: 0, y: 0 } },
      }) as { instanceId: string };
      void index;
      return placed.instanceId;
    });
    runSessionTool(session, {
      name: "pt_layout_grid",
      args: { instanceIds: ids, columns: 3, gap: 24 },
    });
    const nodes = session.getIR().freeNodes.sort((l, r) => l.bbox.x - r.bbox.x);
    expect(nodes[1]!.bbox.x).toBe(nodes[0]!.bbox.x + nodes[0]!.bbox.w + 24);
    expect(nodes[2]!.bbox.x).toBe(nodes[1]!.bbox.x + nodes[1]!.bbox.w + 24);
  });

  test("layout row and lint catch overlap", () => {
    const session = createPtDesignSession();
    const a = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "card", at: { x: 0, y: 0 } },
    }) as { instanceId: string };
    const b = runSessionTool(session, {
      name: "pt_place",
      args: { componentType: "card", at: { x: 10, y: 0 } },
    }) as { instanceId: string };
    const before = runSessionTool(session, { name: "pt_lint", args: {} }) as {
      issues: Array<{ code: string }>;
    };
    expect(before.issues.some((issue) => issue.code === "OVERLAP")).toBe(true);
    runSessionTool(session, {
      name: "pt_layout_row",
      args: { instanceIds: [a.instanceId, b.instanceId], gap: 24 },
    });
    const after = session.getIR().freeNodes.sort((l, r) => l.bbox.x - r.bbox.x);
    expect(after[1]!.bbox.x).toBe(after[0]!.bbox.x + after[0]!.bbox.w + 24);
    const lint = runSessionTool(session, { name: "pt_lint", args: {} }) as {
      issues: Array<{ code: string }>;
    };
    expect(lint.issues.some((issue) => issue.code === "OVERLAP")).toBe(false);
  });

  test("batch atomic rollback leaves the scene unchanged", () => {
    const session = createPtDesignSession();
    const result = runSessionTool(session, {
      name: "pt_batch",
      args: {
        atomic: true,
        ops: [
          { tool: "pt_place", args: { componentType: "button", at: { x: 0, y: 0 } } },
          { tool: "pt_place", args: { componentType: "not-real", at: { x: 10, y: 10 } } },
        ],
      },
    }) as { rolledBack: boolean; results: Array<{ ok: boolean }> };
    expect(result.rolledBack).toBe(true);
    expect(result.results.some((row) => !row.ok)).toBe(true);
    expect(session.getIR().freeNodes).toHaveLength(0);
  });

  test("pt_screenshot is live-board only on the headless runner", () => {
    const session = createPtDesignSession();
    try {
      runSessionTool(session, { name: "pt_screenshot", args: {} });
      throw new Error("should have thrown");
    } catch (error) {
      expect(isPtDesignError(error)).toBe(true);
      expect(String(error)).toContain("open Prototype Design tab");
    }
  });

  test("unknown tool lists legal names and tools_list returns them", () => {
    const session = createPtDesignSession();
    const listed = runSessionTool(session, { name: "pt_tools_list", args: {} }) as {
      live: string[];
      tools: Array<{ name: string; args: string }>;
    };
    expect(listed.live).toContain("pt_place");
    expect(listed.live).not.toContain("pt_doc_init");
    expect(listed.tools.some((tool) => tool.name === "pt_batch")).toBe(true);
    try {
      runSessionTool(session, { name: "pt_help" as never, args: {} });
      throw new Error("should have thrown");
    } catch (error) {
      expect(isPtDesignError(error)).toBe(true);
      expect(String(error)).toContain("Unknown tool: pt_help");
      expect(String(error)).toContain("pt_catalog_list");
      expect(String(error)).toContain("pt_batch");
    }
  });

  test("typography lg is large enough for a hero title", () => {
    const hero = getComponentTemplate("typography", {
      x: 0,
      y: 0,
      size: "lg",
      props: { title: "Build with agents", description: "Local-first workspace." },
    });
    expect(hero.width).toBeGreaterThanOrEqual(560);
    expect(hero.height).toBeGreaterThanOrEqual(140);
    expect(hero.elements.some((el) => el.text === "Build with agents")).toBe(true);
  });
});
