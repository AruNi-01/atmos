// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { deleteRequest, renameRequest } from "./rename";

describe("rename requests", () => {
  test("rename payload carries chat id and title", () => {
    expect(renameRequest("chat-1", "Release notes")).toEqual({
      action: "agent_chat_rename",
      input: { chat_id: "chat-1", title: "Release notes" },
    });
  });

  test("delete payload carries chat id", () => {
    expect(deleteRequest("chat-1")).toEqual({
      action: "agent_chat_delete",
      input: { chat_id: "chat-1" },
    });
  });
});
