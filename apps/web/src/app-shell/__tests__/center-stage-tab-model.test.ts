import { describe, expect, test } from "bun:test";
import {
  orderCenterTabsBySavedOrder,
  type CenterTabDescriptor,
} from "@/app-shell/center-stage-tab-model";

describe("orderCenterTabsBySavedOrder", () => {
  test("applies saved order and appends new tabs", () => {
    const tabs: CenterTabDescriptor[] = [
      { id: "a", value: "a", kind: "file", label: "A" },
      { id: "b", value: "b", kind: "file", label: "B" },
      { id: "c", value: "c", kind: "terminal", label: "C" },
    ];
    expect(orderCenterTabsBySavedOrder(tabs, ["c", "a"]).map((tab) => tab.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("returns original order when no saved order", () => {
    const tabs: CenterTabDescriptor[] = [
      { id: "a", value: "a", kind: "file", label: "A" },
      { id: "b", value: "b", kind: "file", label: "B" },
    ];
    expect(orderCenterTabsBySavedOrder(tabs).map((tab) => tab.id)).toEqual(["a", "b"]);
  });
});
