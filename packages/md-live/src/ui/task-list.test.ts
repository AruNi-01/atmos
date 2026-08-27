import { describe, expect, test } from "bun:test";
import {
  cycleMdLiveTaskMarker,
  mdLiveTaskMarkerOf,
  normalizeMdLiveTaskMarker,
  remarkMdLiveTasks,
} from "./task-list";

describe("md-live task markers", () => {
  test("normalizes overview markers", () => {
    expect(normalizeMdLiveTaskMarker(" ")).toBe(" ");
    expect(normalizeMdLiveTaskMarker("x")).toBe("x");
    expect(normalizeMdLiveTaskMarker("X")).toBe("x");
    expect(normalizeMdLiveTaskMarker("/")).toBe("/");
    expect(normalizeMdLiveTaskMarker("-")).toBe("-");
    expect(normalizeMdLiveTaskMarker("?")).toBeNull();
  });

  test("cycles todo -> progress -> done -> cancelled", () => {
    expect(cycleMdLiveTaskMarker(" ")).toBe("/");
    expect(cycleMdLiveTaskMarker("/")).toBe("x");
    expect(cycleMdLiveTaskMarker("x")).toBe("-");
    expect(cycleMdLiveTaskMarker("-")).toBe(" ");
  });

  test("reads marker from attrs", () => {
    expect(mdLiveTaskMarkerOf({ checked: true })).toBe("x");
    expect(mdLiveTaskMarkerOf({ checked: false })).toBe(" ");
    expect(mdLiveTaskMarkerOf({ taskMarker: "/", checked: false })).toBe("/");
  });

  test("remark lifts [/] and [-] off the list item text", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "list",
          children: [
            {
              type: "listItem",
              checked: false,
              children: [{ type: "paragraph", children: [{ type: "text", value: "plain" }] }],
            },
            {
              type: "listItem",
              children: [{ type: "paragraph", children: [{ type: "text", value: "[/] doing" }] }],
            },
            {
              type: "listItem",
              children: [{ type: "paragraph", children: [{ type: "text", value: "[-] dropped" }] }],
            },
          ],
        },
      ],
    };
    remarkMdLiveTasks()(tree);
    const items = tree.children[0]?.children ?? [];
    expect(items[0]?.taskMarker).toBe(" ");
    expect(items[1]?.taskMarker).toBe("/");
    expect((items[1]?.children?.[0] as { children: Array<{ value: string }> }).children[0]?.value).toBe("doing");
    expect(items[2]?.taskMarker).toBe("-");
    expect((items[2]?.children?.[0] as { children: Array<{ value: string }> }).children[0]?.value).toBe("dropped");
  });
});
