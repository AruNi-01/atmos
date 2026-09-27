// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { planNewChatSubmit, submitStep, type MobileChatDraft } from "./new-chat-submit";

function draft(partial: Partial<MobileChatDraft> = {}): MobileChatDraft {
  return {
    scope: { workspace_id: "ws-1" },
    cwd: "/repo/ws",
    provider_id: "codex",
    model: null,
    thinking: null,
    mode: null,
    permission_mode: null,
    fast: null,
    context: null,
    text: "hello",
    ...partial,
  };
}

describe("submitStep", () => {
  test("submitting true ignores whether or not a chat id exists", () => {
    expect(submitStep(null, true)).toBe("ignore");
    expect(submitStep("chat-1", true)).toBe("ignore");
  });

  test("no id and not submitting creates", () => {
    expect(submitStep(null, false)).toBe("create");
  });

  test("id set and not submitting sends", () => {
    expect(submitStep("chat-1", false)).toBe("send");
  });
});

describe("planNewChatSubmit", () => {
  test("blank text is an error and does not build a request", () => {
    expect(planNewChatSubmit(draft({ text: "   " }))).toEqual({
      error: "Write a message to start this chat.",
    });
  });

  test("create payload contains provider_id and the workspace scope", () => {
    expect(planNewChatSubmit(draft({
      text: "  hello  ",
      model: "gpt-5",
      thinking: "high",
    }))).toEqual({
      create: {
        workspace_id: "ws-1",
        cwd: "/repo/ws",
        provider_id: "codex",
        model: "gpt-5",
        thinking: "high",
      },
      sendText: "hello",
    });
  });

  test("project scope is project_id", () => {
    const planned = planNewChatSubmit(draft({
      scope: { project_id: "project-1" },
      cwd: "/repo",
    }));
    if ("error" in planned) {
      throw new Error(planned.error);
    }
    expect(planned.create.provider_id).toBe("codex");
    expect(planned.create.project_id).toBe("project-1");
    expect(planned.create.workspace_id).toBeUndefined();
  });
});
