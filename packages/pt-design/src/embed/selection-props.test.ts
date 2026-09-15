import { describe, expect, test } from "bun:test";
import type { PtNode, PtNodeType } from "../protocol";
import {
  applySelectionNodePatch,
  FALLBACK_MOBILE_BOTTOM,
  FALLBACK_MOBILE_RIGHT,
  railAnchorFromLayout,
  selectedNodeIdFromBoardSelection,
  selectionPropGroups,
  selectionPropPatch,
} from "./selection-props";

function node(
  type: PtNodeType,
  props: PtNode["props"] = {},
  extra: Partial<Pick<PtNode, "checked" | "value">> = {},
): PtNode {
  return {
    id: "n",
    type,
    props,
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    rotation: 0,
    ...extra,
  };
}

describe("selectionPropGroups", () => {
  test("button exposes variant and size, not text props", () => {
    const groups = selectionPropGroups(node("button", { variant: "outline", size: "lg", label: "Save" }));
    expect(groups.map((group) => group.id)).toEqual(["variant", "size", "radius"]);
    expect(groups[0]?.value).toBe("outline");
    expect(groups[0]?.options.map((opt) => opt.id)).toEqual([
      "default",
      "secondary",
      "outline",
      "ghost",
      "destructive",
      "link",
    ]);
    expect(groups[1]?.value).toBe("lg");
    expect(groups[1]?.options.map((opt) => opt.label)).toEqual(["S", "M", "L"]);
    expect(groups[2]?.value).toBe("default");
    expect(groups[2]?.options.map((opt) => opt.label)).toEqual(["Default", "None", "Small", "Medium", "Large"]);
  });

  test("checkbox exposes size and checked, not a single default variant", () => {
    const groups = selectionPropGroups(node("checkbox", { label: "On" }, { checked: true }));
    expect(groups.map((group) => group.id)).toEqual(["size", "radius", "prop:checked"]);
    expect(groups[2]?.value).toBe("true");
    expect(groups[2]?.label).toBe("Checked");
  });

  test("typography includes extra size steps", () => {
    const groups = selectionPropGroups(node("typography", { size: "xl" }));
    const size = groups.find((group) => group.id === "size");
    expect(size?.value).toBe("xl");
    expect(size?.options.map((opt) => opt.id)).toEqual(["xs", "sm", "default", "lg", "xl"]);
  });

  test("unknown size falls back to default", () => {
    const groups = selectionPropGroups(node("badge", { size: "huge" }));
    expect(groups.find((group) => group.id === "size")?.value).toBe("default");
  });
});

describe("selectionPropPatch", () => {
  test("maps option ids onto node patches", () => {
    const button = selectionPropGroups(node("button", { variant: "default" }));
    const variant = button.find((group) => group.id === "variant")!;
    const size = button.find((group) => group.id === "size")!;
    const radius = button.find((group) => group.id === "radius")!;
    expect(selectionPropPatch(variant, "ghost")).toEqual({ type: "variant", variant: "ghost" });
    expect(selectionPropPatch(size, "sm")).toEqual({ type: "size", size: "sm" });
    expect(selectionPropPatch(radius, "lg")).toEqual({ type: "radius", radius: "lg" });

    const toggle = selectionPropGroups(node("toggle", { label: "Bold" }, { checked: false }));
    const pressed = toggle.find((group) => group.id === "prop:pressed")!;
    expect(selectionPropPatch(pressed, "true")).toEqual({ type: "prop", key: "pressed", value: true });
  });
});

describe("applySelectionNodePatch", () => {
  test("writes variant and size into props and boolean into checked", () => {
    const base = node("button", { label: "Go" });
    expect(applySelectionNodePatch(base, { type: "variant", variant: "ghost" }).props.variant).toBe("ghost");
    expect(applySelectionNodePatch(base, { type: "size", size: "sm" }).props.size).toBe("sm");
    expect(applySelectionNodePatch(base, { type: "radius", radius: "none" }).props.radius).toBe("none");
    expect(applySelectionNodePatch(node("checkbox", {}, { checked: false }), { type: "prop", key: "checked", value: true }).checked).toBe(
      true,
    );
  });
});

describe("selectedNodeIdFromBoardSelection", () => {
  const elements = [
    { id: "root", customData: { pt: { id: "card-1" } } },
    { id: "label" },
  ];

  test("reads the live selected node", () => {
    expect(
      selectedNodeIdFromBoardSelection({
        elements,
        selectedIds: ["root"],
        previousNodeId: null,
      }),
    ).toBe("card-1");
  });

  test("clears when the user deselects", () => {
    expect(
      selectedNodeIdFromBoardSelection({
        elements,
        selectedIds: [],
        previousNodeId: "card-1",
      }),
    ).toBe(null);
  });

  test("clears when a non-component shape is selected", () => {
    expect(
      selectedNodeIdFromBoardSelection({
        elements,
        selectedIds: ["label"],
        previousNodeId: "card-1",
      }),
    ).toBe(null);
  });

  test("keeps the node across a handle rebuild that rotates ids", () => {
    expect(
      selectedNodeIdFromBoardSelection({
        elements,
        selectedIds: ["old-root"],
        previousNodeId: "card-1",
      }),
    ).toBe("card-1");
  });
});

describe("railAnchorFromLayout", () => {
  const host = { top: 0, left: 0, right: 400, bottom: 800, width: 400, height: 800 };

  test("docks to the left of the mobile color tool and shares its baseline", () => {
    const colorTool = { top: 720, left: 348, right: 388, bottom: 760, width: 40, height: 40 };
    expect(
      railAnchorFromLayout({
        host,
        mobile: true,
        stylePanel: null,
        colorTool,
      }),
    ).toEqual({ placement: "bottom", right: 60, bottom: 40 });
  });

  test("falls back to the bottom-right chrome band without a color tool", () => {
    expect(
      railAnchorFromLayout({
        host,
        mobile: true,
        stylePanel: null,
        colorTool: null,
      }),
    ).toEqual({
      placement: "bottom",
      right: FALLBACK_MOBILE_RIGHT,
      bottom: FALLBACK_MOBILE_BOTTOM,
    });
  });

  test("desktop still docks to the right of the left style panel", () => {
    const stylePanel = { top: 80, left: 16, right: 200, bottom: 400, width: 184, height: 320 };
    expect(
      railAnchorFromLayout({
        host,
        mobile: false,
        stylePanel,
        colorTool: null,
      }),
    ).toEqual({ placement: "side", top: 90, left: 208 });
  });
});
