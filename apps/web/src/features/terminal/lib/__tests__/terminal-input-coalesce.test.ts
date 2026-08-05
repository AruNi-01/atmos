import { describe, expect, test } from "bun:test";

import {
  createTerminalInputCoalesceQueue,
  shouldCoalesceTerminalInputChunk,
} from "../terminal-input-coalesce";

describe("shouldCoalesceTerminalInputChunk", () => {
  test("coalesces SGR mouse reports", () => {
    expect(shouldCoalesceTerminalInputChunk("\x1b[<64;10;12M")).toBe(true);
  });

  test("sends large blobs immediately (no coalesce flag)", () => {
    expect(shouldCoalesceTerminalInputChunk("x".repeat(5000))).toBe(false);
  });
});

describe("createTerminalInputCoalesceQueue", () => {
  test("merges consecutive mouse reports in one flush", async () => {
    const sent: string[] = [];
    const flushes: Array<() => void> = [];
    const queue = createTerminalInputCoalesceQueue({
      send: (data) => sent.push(data),
      schedule: (flush) => {
        flushes.push(flush);
      },
    });

    queue.enqueue("\x1b[<64;1;1M");
    queue.enqueue("\x1b[<64;1;2M");
    expect(sent).toEqual([]);
    expect(flushes.length).toBe(1);
    flushes[0]();
    expect(sent).toEqual(["\x1b[<64;1;1M\x1b[<64;1;2M"]);
  });

  test("sends non-coalescible large chunks immediately when queue empty", () => {
    const sent: string[] = [];
    const queue = createTerminalInputCoalesceQueue({
      send: (data) => sent.push(data),
      schedule: () => {
        /* never */
      },
    });
    const big = "y".repeat(5000);
    queue.enqueue(big);
    expect(sent).toEqual([big]);
  });
});
