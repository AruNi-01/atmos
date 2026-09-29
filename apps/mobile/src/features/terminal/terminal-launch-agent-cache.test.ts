// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { terminalLaunchAgentCacheKey } from "./terminal-launch-agents";

describe("terminalLaunchAgentCacheKey", () => {
  test("keeps each Computer's commands in its own cache", () => {
    expect(terminalLaunchAgentCacheKey(null)).toBeNull();
    expect(terminalLaunchAgentCacheKey("  ")).toBeNull();
    expect(terminalLaunchAgentCacheKey("studio")).not.toBe(terminalLaunchAgentCacheKey("laptop"));
  });
});
