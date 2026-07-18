// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  buildLintFixSuggestions,
  computeCanvasLints,
  estimateGeoTextOverflow,
  suggestOverlapSeparation,
  summarizeLints,
} from "../lib/canvas-agent-lint";

const CANVAS_TERMINAL_SHAPE_TYPE = "canvas-terminal";
const CANVAS_WIDGET_SHAPE_TYPE = "canvas-widget";

type FakeShape = {
  id: string;
  type: string;
  x: number;
  y: number;
  parentId: string;
  props: Record<string, unknown>;
};

function makeEditor(shapes: FakeShape[]) {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  return {
    getCurrentPageShapes: () => shapes,
    getShape: (id: string) => byId.get(id),
    getShapePageBounds: (id: string | FakeShape) => {
      const s = typeof id === "string" ? byId.get(id) : id;
      if (!s) return null;
      const w = Number(s.props.w ?? 100);
      const h = Number(s.props.h ?? 100);
      return {
        minX: s.x,
        minY: s.y,
        maxX: s.x + w,
        maxY: s.y + h,
        width: w,
        height: h,
        midX: s.x + w / 2,
        midY: s.y + h / 2,
      };
    },
  };
}

function richText(text: string) {
  return {
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("canvas-agent-lint", () => {
  it("flags content-on-content overlap as error", () => {
    const editor = makeEditor([
      {
        id: "shape:a",
        type: "geo",
        x: 0,
        y: 0,
        parentId: "page:main",
        props: { w: 200, h: 100 },
      },
      {
        id: "shape:b",
        type: "geo",
        x: 50,
        y: 20,
        parentId: "page:main",
        props: { w: 200, h: 100 },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lints = computeCanvasLints(editor as any);
    const overlaps = lints.filter((l) => l.type === "overlap");
    expect(overlaps.length).toBe(1);
    expect(overlaps[0]!.severity).toBe("error");
  });

  it("does not flag non-overlapping neighbours", () => {
    const editor = makeEditor([
      {
        id: "shape:a",
        type: "geo",
        x: 0,
        y: 0,
        parentId: "page:main",
        props: { w: 100, h: 100 },
      },
      {
        id: "shape:b",
        type: "geo",
        x: 140,
        y: 0,
        parentId: "page:main",
        props: { w: 100, h: 100 },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lints = computeCanvasLints(editor as any);
    expect(lints.filter((l) => l.type === "overlap")).toHaveLength(0);
  });

  it("ignores arrow vs content AABB collision", () => {
    const editor = makeEditor([
      {
        id: "shape:a",
        type: "geo",
        x: 0,
        y: 0,
        parentId: "page:main",
        props: { w: 100, h: 100 },
      },
      {
        id: "shape:arr",
        type: "arrow",
        x: 20,
        y: 20,
        parentId: "page:main",
        props: { w: 80, h: 80 },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lints = computeCanvasLints(editor as any);
    expect(lints.filter((l) => l.type === "overlap")).toHaveLength(0);
  });

  it("ignores atmos chrome widgets in overlap checks", () => {
    const editor = makeEditor([
      {
        id: "shape:a",
        type: "geo",
        x: 0,
        y: 0,
        parentId: "page:main",
        props: { w: 200, h: 200 },
      },
      {
        id: "shape:term",
        type: CANVAS_TERMINAL_SHAPE_TYPE,
        x: 50,
        y: 50,
        parentId: "page:main",
        props: { w: 400, h: 300 },
      },
      {
        id: "shape:widget",
        type: CANVAS_WIDGET_SHAPE_TYPE,
        x: 10,
        y: 10,
        parentId: "page:main",
        props: { w: 300, h: 200 },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lints = computeCanvasLints(editor as any);
    expect(lints.filter((l) => l.type === "overlap")).toHaveLength(0);
  });

  it("ignores frame containing a child content shape", () => {
    const editor = makeEditor([
      {
        id: "shape:frame",
        type: "frame",
        x: 0,
        y: 0,
        parentId: "page:main",
        props: { w: 400, h: 300 },
      },
      {
        id: "shape:card",
        type: "geo",
        x: 40,
        y: 60,
        parentId: "shape:frame",
        props: { w: 120, h: 80 },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lints = computeCanvasLints(editor as any);
    // frame is not content; no pairwise content overlap
    expect(lints.filter((l) => l.type === "overlap")).toHaveLength(0);
  });

  it("detects geo text overflow heuristically", () => {
    const tight = {
      id: "shape:t",
      type: "geo",
      x: 0,
      y: 0,
      parentId: "page:main",
      props: {
        w: 80,
        h: 40,
        richText: richText(
          "This is a very long label that cannot possibly fit in a tiny box at all",
        ),
      },
    } as FakeShape;
    expect(estimateGeoTextOverflow(tight)).toBe(true);

    const roomy = {
      ...tight,
      props: { w: 400, h: 200, richText: richText("Short") },
    };
    expect(estimateGeoTextOverflow(roomy)).toBe(false);
  });

  it("summarizeLints counts severities", () => {
    const summary = summarizeLints([
      {
        type: "overlap",
        severity: "error",
        shape_ids: ["a", "b"],
        message: "x",
      },
      {
        type: "unbound_arrow",
        severity: "warn",
        shape_ids: ["c"],
        message: "y",
      },
    ]);
    expect(summary).toEqual({ error_count: 1, warn_count: 1, clean: false });
  });

  it("suggestOverlapSeparation pushes the cheaper axis with gap", () => {
    const a = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
      width: 100,
      height: 100,
      midX: 50,
      midY: 50,
    };
    // B overlaps A on the right by 20px
    const b = {
      minX: 80,
      minY: 10,
      maxX: 180,
      maxY: 110,
      width: 100,
      height: 100,
      midX: 130,
      midY: 60,
    };
    const { dx, dy } = suggestOverlapSeparation(a, b, 24);
    expect(dy).toBe(0);
    expect(dx).toBe(20 + 24);
  });

  it("suggestOverlapSeparation separates touching boxes with gap", () => {
    const a = {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
      width: 100,
      height: 100,
      midX: 50,
      midY: 50,
    };
    // B touches A on the right edge (penX = 0)
    const b = {
      minX: 100,
      minY: 0,
      maxX: 200,
      maxY: 100,
      width: 100,
      height: 100,
      midX: 150,
      midY: 50,
    };
    const { dx, dy } = suggestOverlapSeparation(a, b, 24);
    expect(dy).toBe(0);
    expect(dx).toBe(24);
  });

  it("buildLintFixSuggestions emits move for overlaps", () => {
    const editor = makeEditor([
      {
        id: "shape:a",
        type: "geo",
        x: 0,
        y: 0,
        parentId: "page:main",
        props: { w: 100, h: 100 },
      },
      {
        id: "shape:b",
        type: "geo",
        x: 50,
        y: 20,
        parentId: "page:main",
        props: { w: 100, h: 100 },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { fix_suggestions, lints } = buildLintFixSuggestions(editor as any);
    expect(lints.some((l) => l.type === "overlap")).toBe(true);
    const move = fix_suggestions.find((s) => s.command === "move");
    expect(move).toBeDefined();
    expect(move!.args.ids).toEqual(["shape:b"]);
    expect(typeof move!.args.dx).toBe("number");
    expect(typeof move!.args.dy).toBe("number");
  });

  it("buildLintFixSuggestions emits update_shape for text overflow", () => {
    const editor = makeEditor([
      {
        id: "shape:t",
        type: "geo",
        x: 0,
        y: 0,
        parentId: "page:main",
        props: {
          w: 60,
          h: 30,
          richText: richText(
            "This label is intentionally much too long for the tiny box and will overflow",
          ),
        },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { fix_suggestions } = buildLintFixSuggestions(editor as any);
    const update = fix_suggestions.find((s) => s.command === "update_shape");
    expect(update).toBeDefined();
    expect(update!.args.id).toBe("shape:t");
    const patch = update!.args.patch as { h: number };
    expect(patch.h).toBeGreaterThan(30);
  });
});
