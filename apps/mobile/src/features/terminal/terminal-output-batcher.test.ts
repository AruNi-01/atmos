// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { createTerminalOutputBatcher } from "./terminal-output-batcher";

describe("terminal output batcher", () => {
  test("flushes multiple base64 chunks together on one timer", () => {
    const timers: Array<() => void> = [];
    const flushed: string[][] = [];
    const batcher = createTerminalOutputBatcher({
      flush: (chunks) => flushed.push(chunks),
      setTimeout: (callback) => {
        timers.push(callback);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: () => {},
    });

    batcher.enqueue("YWJj");
    batcher.enqueue("ZGVm");

    expect(flushed).toEqual([]);
    expect(timers).toHaveLength(1);

    timers[0]!();
    expect(flushed).toEqual([["YWJj", "ZGVm"]]);
  });

  test("does not flush after clear", () => {
    const timers: Array<() => void> = [];
    const flushed: string[][] = [];
    const batcher = createTerminalOutputBatcher({
      flush: (chunks) => flushed.push(chunks),
      setTimeout: (callback) => {
        timers.push(callback);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: () => {},
    });

    batcher.enqueue("YWJj");
    batcher.clear();
    timers[0]!();

    expect(flushed).toEqual([]);
  });
});
