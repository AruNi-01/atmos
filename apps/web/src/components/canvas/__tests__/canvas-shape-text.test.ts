// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { Editor, TLShape } from "tldraw";

import {
  formatShapeTextForCopy,
  getSortedChildShapes,
  plainTextFromShapeProps,
  stripAnsi,
  truncateText,
} from "../canvas-shape-text";

function mockEditor(shapes: TLShape[]): Editor {
  return {
    getShape: (id: string) => shapes.find((shape) => shape.id === id),
    getCurrentPageShapes: () => shapes,
    getCurrentPageShapesSorted: () => shapes,
  } as unknown as Editor;
}

describe("canvas-shape-text", () => {
  it("extracts richText paragraphs", () => {
    const text = plainTextFromShapeProps({
      richText: {
        content: [
          {
            content: [{ text: "Hello" }, { text: " world" }],
          },
          {
            content: [{ text: "Line 2" }],
          },
        ],
      },
    });
    expect(text).toBe("Hello world\nLine 2");
  });

  it("strips ANSI escape codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  it("truncates with ellipsis", () => {
    const { text, truncated } = truncateText("abcdefghij", 6);
    expect(truncated).toBe(true);
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(6);
  });

  it("includes nested frame children in copy export", () => {
    const frameId = "shape:frame" as TLShape["id"];
    const innerFrameId = "shape:inner" as TLShape["id"];
    const noteId = "shape:note" as TLShape["id"];

    const shapes = [
      {
        id: frameId,
        type: "frame",
        parentId: "page:page",
        props: { name: "Outer" },
      },
      {
        id: innerFrameId,
        type: "frame",
        parentId: frameId,
        props: { name: "Inner" },
      },
      {
        id: noteId,
        type: "note",
        parentId: innerFrameId,
        props: {
          richText: {
            content: [{ content: [{ text: "Nested note" }] }],
          },
        },
      },
    ] as TLShape[];

    const editor = mockEditor(shapes);
    const children = getSortedChildShapes(editor, frameId);
    expect(children.map((shape) => shape.id)).toEqual([innerFrameId]);

    const exported = formatShapeTextForCopy(editor, shapes[0]!);
    expect(exported).toContain("### frame (shape:frame)");
    expect(exported).toContain("Outer");
    expect(exported).toContain("#### frame (shape:inner)");
    expect(exported).toContain("Inner");
    expect(exported).toContain("##### note (shape:note)");
    expect(exported).toContain("Nested note");
  });
});
