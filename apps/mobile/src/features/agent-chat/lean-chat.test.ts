// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  leanChatGetRequest,
  leanChatSubscribeRequest,
  MOBILE_CHAT_MESSAGE_PAGE_SIZE,
  olderPageAfterFailure,
  olderPageRequest,
  shouldFetchToolDetail,
  shouldRefetchLeanCompleted,
  toolDetailPhase,
} from "./lean-chat";

const here = dirname(fileURLToPath(import.meta.url));

describe("lean chat requests", () => {
  test("first paint get is 20 messages without tool bodies", () => {
    expect(leanChatGetRequest("chat-1")).toEqual({
      chat_id: "chat-1",
      message_limit: MOBILE_CHAT_MESSAGE_PAGE_SIZE,
      include_tool_detail: false,
    });
    expect(MOBILE_CHAT_MESSAGE_PAGE_SIZE).toBe(20);
  });

  test("subscribe stays lean", () => {
    expect(leanChatSubscribeRequest("chat-1", 9)).toEqual({
      chat_id: "chat-1",
      after_sequence: 9,
      include_tool_detail: false,
    });
  });

  test("older page uses exclusive before_message_id", () => {
    expect(olderPageRequest("chat-1", "m6")).toEqual({
      chat_id: "chat-1",
      limit: 20,
      before_message_id: "m6",
      include_tool_detail: false,
    });
  });

  test("older page retries three times then shows the header error", () => {
    expect(olderPageAfterFailure(0)).toEqual({ retries: 1, showError: false, retry: true });
    expect(olderPageAfterFailure(1)).toEqual({ retries: 2, showError: false, retry: true });
    expect(olderPageAfterFailure(2)).toEqual({ retries: 3, showError: true, retry: false });
  });
});

describe("tool detail phases", () => {
  test("open omitted tool shows loading then retry", () => {
    expect(toolDetailPhase({ open: true, detailOmitted: true, status: "idle" })).toBe("loading");
    expect(toolDetailPhase({ open: true, detailOmitted: true, status: "loading" })).toBe("loading");
    expect(toolDetailPhase({ open: true, detailOmitted: true, status: "error" })).toBe("retry");
    expect(toolDetailPhase({ open: true, detailOmitted: true, status: "ready" })).toBe("body");
    expect(toolDetailPhase({ open: true, detailOmitted: false, status: "idle" })).toBe("body");
  });

  test("fetch starts on first expand of an omitted tool", () => {
    expect(shouldFetchToolDetail({ open: true, detailOmitted: true, status: "idle" })).toBe(true);
    expect(shouldFetchToolDetail({ open: true, detailOmitted: true, status: "error" })).toBe(false);
    expect(shouldFetchToolDetail({ open: false, detailOmitted: true, status: "idle" })).toBe(false);
  });

  test("web get stays a full snapshot of { chat_id }", () => {
    const web = readFileSync(join(here, "../../../../web/src/api/ws/agent-chat-api.ts"), "utf8");
    expect(web).toContain('wsRequest("agent_chat_get", { chat_id })');
    expect(web).not.toContain("message_limit");
    expect(web).not.toContain("include_tool_detail");
  });

  test("thread transcript loads older pages at the top", () => {
    const screen = readFileSync(join(here, "AgentChatThreadScreen.tsx"), "utf8");
    const transcript = readFileSync(join(here, "AgentChatTranscript.tsx"), "utf8");
    expect(screen).toContain("onStartReached");
    expect(screen).toContain("loadOlder");
    expect(screen).not.toContain("wsActions.agentChatGet(client, { chat_id: chatId })");
    expect(transcript).toContain("onStartReached={onStartReached}");
    expect(transcript).toContain("expandResetForChat");
  });

  test("tool row shows loading while omitted detail is in flight", () => {
    const body = readFileSync(join(here, "tool-body.tsx"), "utf8");
    expect(body).toContain("ActivityIndicator");
    expect(body).toContain("toolDetailPhase");
    expect(body).toContain("shouldFetchToolDetail");
  });

  test("expanded lean completed refetches once", () => {
    expect(
      shouldRefetchLeanCompleted({
        expanded: true,
        detailOmitted: true,
        status: "completed",
      }),
    ).toBe(true);
    expect(
      shouldRefetchLeanCompleted({
        expanded: true,
        detailOmitted: true,
        status: "running",
      }),
    ).toBe(false);
  });
});
