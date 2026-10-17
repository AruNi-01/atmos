// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { THINKING_AUTO_CLOSE_MS, thinkingRailColor, thinkingStreamAction } from "./thinking-stream";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("thinking stream", () => {
  test("forces open while streaming and closes once after it ends", () => {
    expect(THINKING_AUTO_CLOSE_MS).toBe(1000);
    const base = {
      autoClosed: false,
      everStreamed: false,
      open: false,
      storedOpen: undefined as boolean | undefined,
      streaming: false,
    };
    expect(thinkingStreamAction({ ...base, streaming: true })).toBe("force-open");
    expect(
      thinkingStreamAction({
        ...base,
        everStreamed: true,
        open: true,
        storedOpen: true,
        streaming: true,
      }),
    ).toBe("hold");
    expect(
      thinkingStreamAction({
        ...base,
        everStreamed: true,
        storedOpen: false,
        streaming: true,
      }),
    ).toBe("force-open");
    expect(
      thinkingStreamAction({
        ...base,
        everStreamed: true,
        open: true,
        storedOpen: true,
      }),
    ).toBe("schedule-close");
    expect(
      thinkingStreamAction({
        ...base,
        autoClosed: true,
        everStreamed: true,
        open: true,
        storedOpen: true,
      }),
    ).toBe("hold");
    expect(thinkingStreamAction({ ...base, open: true, storedOpen: true })).toBe("hold");
    expect(thinkingStreamAction({ ...base, everStreamed: true })).toBe("hold");
  });

  test("rail is the web border token", () => {
    expect(thinkingRailColor(false)).toBe("rgba(0, 0, 0, 0.1)");
    expect(thinkingRailColor(true)).toBe("rgba(255, 255, 255, 0.1)");
  });

  test("the block uses the web trigger and keeps hostname chips", () => {
    const source = read("thinking-block.tsx");
    expect(source).toContain("chipHttpUrls");
    expect(source).toContain('tone="thinking"');
    expect(source).toContain("<Brain ");
    expect(source).toContain("<ExpandChevron ");
    expect(source).toContain("toolTriggerMetrics");
    expect(source).toContain("thinkingStreamAction");
    expect(source).toContain("agentChatThinkingExpandKey");
    expect(source).toContain("thinkingRailColor");
    expect(source).toContain("fontSize={metrics.fontSize}");
    expect(source).toContain("lineHeight={metrics.lineHeight}");
    expect(source).toContain("width: 1");
    const transcript = read("AgentChatTranscript.tsx");
    expect(transcript).toContain("origIndex={origIndex}");
    expect(transcript).toContain("origIndex={segment.origIndex}");
    expect(transcript).toContain("origIndex={index}");
  });
});
