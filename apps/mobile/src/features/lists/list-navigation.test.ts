// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  formatListNavLine,
  lastListNavSample,
  markListNavigation,
  reportListFirstFrame,
  resetListNavForTests,
  setListNavClockForTests,
  setListNavSink,
} from "./list-navigation";

describe("list navigation timing", () => {
  test("a mismatched target does not consume the mark", () => {
    resetListNavForTests();
    const lines: string[] = [];
    setListNavSink((line) => lines.push(line));
    markListNavigation("session-bucket", "running");
    expect(reportListFirstFrame("workspace-activity")).toBeNull();
    expect(lines).toEqual([]);
    const ms = reportListFirstFrame("session-bucket");
    expect(ms).not.toBeNull();
    expect(lines).toEqual([
      formatListNavLine({ target: "session-bucket", ms: ms ?? 0, detail: "running" }),
    ]);
    expect(lines[0]?.startsWith("[list-nav] click-to-first-frame target=session-bucket ms=")).toBe(
      true,
    );
    expect(lines[0]).toContain(" detail=running");
    expect(lastListNavSample()?.target).toBe("session-bucket");
    expect(reportListFirstFrame("session-bucket")).toBeNull();
    resetListNavForTests();
  });

  test("dev logging stays off when a sink is absent and __DEV__ is false", () => {
    resetListNavForTests();
    const devGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
    const previous = devGlobal.__DEV__;
    devGlobal.__DEV__ = false;
    let called = 0;
    const original = console.info;
    console.info = () => {
      called += 1;
    };
    try {
      markListNavigation("workspace-activity", "ws-1");
      reportListFirstFrame("workspace-activity");
      expect(called).toBe(0);
      expect(lastListNavSample()?.detail).toBe("ws-1");
    } finally {
      console.info = original;
      devGlobal.__DEV__ = previous;
      resetListNavForTests();
    }
  });

  test("an expired or mismatched detail does not consume the mark", () => {
    resetListNavForTests();
    setListNavClockForTests(() => 1_000);
    markListNavigation("session-bucket", "running");
    expect(reportListFirstFrame("session-bucket", "done")).toBeNull();
    setListNavClockForTests(() => 1_000 + 3_001);
    expect(reportListFirstFrame("session-bucket", "running")).toBeNull();
    expect(lastListNavSample()).toBeNull();
    resetListNavForTests();
  });
});
