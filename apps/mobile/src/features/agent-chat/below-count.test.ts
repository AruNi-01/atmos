// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import { countMessagesBelowViewport as countFromPackage } from "@atmos/agent-transcript/agent-chat-below-count";
import { countMessagesBelowViewport as countFromWeb } from "../../../../web/src/features/agent/lib/agent-chat-below-count";

const measurements = [
  { start: 0, size: 80 },
  { start: 92, size: 240 },
  { start: 344, size: 88 },
  { start: 444, size: 200 },
  { start: 656, size: 120 },
];

describe("countMessagesBelowViewport", () => {
  test("the phone helper is the web helper", () => {
    expect(countFromPackage).toBe(countFromWeb);
  });

  test("matches the web measurements", () => {
    const views = [
      { scrollTop: 0, height: 400, expected: 2 },
      { scrollTop: 400, height: 200, expected: 1 },
      { scrollTop: 700, height: 400, expected: 0 },
    ];
    for (const view of views) {
      const input = { scrollTop: view.scrollTop, height: view.height };
      expect(countFromPackage(measurements, 5, input)).toBe(view.expected);
      expect(countFromWeb(measurements, 5, input)).toBe(view.expected);
    }
    const partial = [
      { start: 0, size: 80 },
      { start: 92, size: 120 },
    ];
    expect(countFromPackage(partial, 4, { scrollTop: 0, height: 300 })).toBe(2);
    expect(countFromPackage([], 0, { scrollTop: 0, height: 400 })).toBe(0);
  });
});
