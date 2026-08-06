import { describe, expect, test } from "bun:test";
import {
  orderCenterTabsByPin,
  type CenterTabDescriptor,
} from "@/app-shell/center-stage-tab-model";
import { orderTabGroupItemsByPin, type TabGroupItem } from "@/app-shell/center-stage-tabs";

describe("orderCenterTabsByPin", () => {
  test("keeps unpinned relative order and sorts pinned by pin time", () => {
    const tabs: CenterTabDescriptor[] = [
      { id: "a", value: "a", kind: "terminal", label: "A" },
      { id: "b", value: "b", kind: "file", label: "B", pinnedAt: 200 },
      { id: "c", value: "c", kind: "browser", label: "C" },
      { id: "d", value: "d", kind: "github-pr", label: "D", pinnedAt: 100 },
    ];

    expect(orderCenterTabsByPin(tabs).map((tab) => tab.id)).toEqual([
      "d",
      "b",
      "a",
      "c",
    ]);
  });

  test("returns original order when nothing is pinned", () => {
    const tabs: CenterTabDescriptor[] = [
      { id: "a", value: "a", kind: "terminal", label: "A" },
      { id: "b", value: "b", kind: "file", label: "B" },
    ];
    expect(orderCenterTabsByPin(tabs).map((tab) => tab.id)).toEqual(["a", "b"]);
  });
});

describe("orderTabGroupItemsByPin", () => {
  test("puts pinned group items first by pin time", () => {
    const tabs: TabGroupItem[] = [
      { id: "1", label: "One", value: "1", kind: "file" },
      { id: "2", label: "Two", value: "2", kind: "file", pinnedAt: 50 },
      { id: "3", label: "Three", value: "3", kind: "file", pinnedAt: 10 },
    ];
    expect(orderTabGroupItemsByPin(tabs).map((tab) => tab.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
  });
});
