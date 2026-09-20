import { describe, expect, test } from "bun:test";
import {
  cycleMdLiveTaskMarker,
  matchTypedTaskMarker,
  mdLiveTaskMarkerOf,
  mdLiveTaskToneClass,
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

  test("uses overview status tones", () => {
    expect(mdLiveTaskToneClass(" ")).toBe("md-live-task-check--todo");
    expect(mdLiveTaskToneClass("/")).toBe("md-live-task-check--progress");
    expect(mdLiveTaskToneClass("x")).toBe("md-live-task-check--done");
    expect(mdLiveTaskToneClass("-")).toBe("md-live-task-check--cancelled");
  });

  test("cycles todo -> progress -> done -> cancelled", () => {
    expect(cycleMdLiveTaskMarker(" ")).toBe("/");
    expect(cycleMdLiveTaskMarker("/")).toBe("x");
    expect(cycleMdLiveTaskMarker("x")).toBe("-");
    expect(cycleMdLiveTaskMarker("-")).toBe(" ");
  });

  test("detects typed checkbox prefixes after a bullet list", () => {
    expect(matchTypedTaskMarker("[ ] ")?.marker).toBe(" ");
    expect(matchTypedTaskMarker("[x] ")?.marker).toBe("x");
    expect(matchTypedTaskMarker("[/] todo")?.marker).toBe("/");
    expect(matchTypedTaskMarker("[-] ")?.marker).toBe("-");
    expect(matchTypedTaskMarker("[link]")).toBeNull();
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
