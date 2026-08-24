import { describe, expect, test } from "bun:test";
import { getCatalogEntry } from "../catalog/registry";
import {
  instanceIdFromBoardSelection,
  selectionPropGroups,
  selectionPropPatch,
} from "./selection-props";

describe("selectionPropGroups", () => {
  test("button exposes variant and size, not text props", () => {
    const groups = selectionPropGroups(getCatalogEntry("button"), {
      variant: "outline",
      size: "lg",
      props: { label: "Save" },
    });
    expect(groups.map((group) => group.id)).toEqual(["variant", "size"]);
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
  });

  test("checkbox exposes size and checked, not a single default variant", () => {
    const groups = selectionPropGroups(getCatalogEntry("checkbox"), {
      variant: "default",
      props: { checked: true, label: "On" },
    });
    expect(groups.map((group) => group.id)).toEqual(["size", "prop:checked"]);
    expect(groups[1]?.value).toBe("true");
    expect(groups[1]?.label).toBe("Checked");
  });

  test("typography includes extra size steps", () => {
    const groups = selectionPropGroups(getCatalogEntry("typography"), { size: "xl" });
    const size = groups.find((group) => group.id === "size");
    expect(size?.value).toBe("xl");
    expect(size?.options.map((opt) => opt.id)).toEqual(["xs", "sm", "default", "lg", "xl"]);
  });

  test("unknown size falls back to default", () => {
    const groups = selectionPropGroups(getCatalogEntry("badge"), { size: "huge" });
    expect(groups.find((group) => group.id === "size")?.value).toBe("default");
  });
});

describe("selectionPropPatch", () => {
  test("maps option ids onto session update patches", () => {
    const button = selectionPropGroups(getCatalogEntry("button"), { variant: "default" });
    const variant = button.find((group) => group.id === "variant")!;
    const size = button.find((group) => group.id === "size")!;
    expect(selectionPropPatch(variant, "ghost")).toEqual({ type: "variant", variant: "ghost" });
    expect(selectionPropPatch(size, "sm")).toEqual({ type: "size", size: "sm" });

    const toggle = selectionPropGroups(getCatalogEntry("toggle"), { props: { pressed: false } });
    const pressed = toggle.find((group) => group.id === "prop:pressed")!;
    expect(selectionPropPatch(pressed, "true")).toEqual({ type: "prop", key: "pressed", value: true });
  });
});

describe("instanceIdFromBoardSelection", () => {
  const elements = [
    { id: "root", customData: { pt: { instanceId: "inst-1" } } },
    { id: "label" },
  ];

  test("reads the live selected instance", () => {
    expect(
      instanceIdFromBoardSelection({
        elements,
        selectedIds: ["root"],
        previousInstanceId: null,
      }),
    ).toBe("inst-1");
  });

  test("clears when the user deselects", () => {
    expect(
      instanceIdFromBoardSelection({
        elements,
        selectedIds: [],
        previousInstanceId: "inst-1",
      }),
    ).toBe(null);
  });

  test("clears when a non-component shape is selected", () => {
    expect(
      instanceIdFromBoardSelection({
        elements,
        selectedIds: ["label"],
        previousInstanceId: "inst-1",
      }),
    ).toBe(null);
  });

  test("keeps the instance across a template rebuild that rotates ids", () => {
    expect(
      instanceIdFromBoardSelection({
        elements,
        selectedIds: ["old-root"],
        previousInstanceId: "inst-1",
      }),
    ).toBe("inst-1");
  });
});
