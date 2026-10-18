// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { canResumeAgentChatSession } from "./session-resume";

describe("canResumeAgentChatSession", () => {
  const client = { id: "ws" };
  const other = { id: "other" };

  test("resumes only the same chat on the same client", () => {
    expect(
      canResumeAgentChatSession({
        chatId: "c1",
        client,
        loadedChatId: "c1",
        loadedClient: client,
      }),
    ).toBe(true);
    expect(
      canResumeAgentChatSession({
        chatId: "c1",
        client,
        loadedChatId: "c2",
        loadedClient: client,
      }),
    ).toBe(false);
    expect(
      canResumeAgentChatSession({
        chatId: "c1",
        client,
        loadedChatId: "c1",
        loadedClient: other,
      }),
    ).toBe(false);
    expect(
      canResumeAgentChatSession({
        chatId: "c1",
        client: null,
        loadedChatId: "c1",
        loadedClient: client,
      }),
    ).toBe(false);
  });
});
