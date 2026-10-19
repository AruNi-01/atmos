// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  AGENT_CHAT_RESYNC_RETRY_BASE_MS,
  AGENT_CHAT_RESYNC_RETRY_MAX,
  nextAgentChatResyncDelayMs,
  shouldAbandonAgentChatHydrate,
} from "./hydrate-recovery";

describe("shouldAbandonAgentChatHydrate", () => {
  test("abandons on error and cancel, not on success", () => {
    expect(shouldAbandonAgentChatHydrate("success")).toBe(false);
    expect(shouldAbandonAgentChatHydrate("error")).toBe(true);
    expect(shouldAbandonAgentChatHydrate("cancelled")).toBe(true);
  });
});

describe("nextAgentChatResyncDelayMs", () => {
  test("backs off then stops", () => {
    expect(nextAgentChatResyncDelayMs(0)).toBe(AGENT_CHAT_RESYNC_RETRY_BASE_MS);
    expect(nextAgentChatResyncDelayMs(1)).toBe(AGENT_CHAT_RESYNC_RETRY_BASE_MS * 2);
    expect(nextAgentChatResyncDelayMs(2)).toBe(AGENT_CHAT_RESYNC_RETRY_BASE_MS * 4);
    expect(nextAgentChatResyncDelayMs(AGENT_CHAT_RESYNC_RETRY_MAX)).toBeNull();
  });
});
