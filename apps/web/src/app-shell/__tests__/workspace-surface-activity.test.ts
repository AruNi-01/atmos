import { describe, expect, it, beforeEach } from "bun:test";
import {
  getVisualActivePaintId,
  isPaintContextVisuallyActive,
  publishVisualActivePaintId,
  resetVisualActivePaintIdForTests,
  subscribeVisualActivePaintId,
} from "../workspace-surface-activity";

describe("workspace surface activity bus", () => {
  beforeEach(() => {
    resetVisualActivePaintIdForTests();
  });

  it("treats every paint id as active before the first visual publish", () => {
    expect(isPaintContextVisuallyActive("ws-a")).toBe(true);
    expect(isPaintContextVisuallyActive("ws-b")).toBe(true);
  });

  it("notifies listeners only when the paint id changes", () => {
    const seen: Array<string | null> = [];
    const off = subscribeVisualActivePaintId((id) => {
      seen.push(id);
    });
    publishVisualActivePaintId("ws-a");
    publishVisualActivePaintId("ws-a");
    publishVisualActivePaintId("ws-b");
    off();
    expect(getVisualActivePaintId()).toBe("ws-b");
    expect(seen).toEqual(["ws-a", "ws-b"]);
    expect(isPaintContextVisuallyActive("ws-a")).toBe(false);
    expect(isPaintContextVisuallyActive("ws-b")).toBe(true);
  });
});
