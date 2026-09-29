// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { MOBILE_CHAT_ACTIONS } from "./actions";

describe("MOBILE_CHAT_ACTIONS", () => {
  test("lists the existing agent chat actions", () => {
    expect([...MOBILE_CHAT_ACTIONS]).toEqual([
      "agent_chat_list",
      "agent_chat_create",
      "agent_chat_messages",
      "agent_chat_get",
      "agent_chat_subscribe",
      "agent_chat_backfill",
      "agent_chat_unsubscribe",
      "agent_chat_send",
      "agent_chat_steer",
      "agent_chat_queue_add",
      "agent_chat_queue_update",
      "agent_chat_queue_reorder",
      "agent_chat_queue_delete",
      "agent_chat_cancel",
      "agent_chat_permission_respond",
      "agent_chat_session_op_respond",
      "agent_chat_configure",
      "agent_options_get",
      "agent_chat_prefs_get",
      "agent_chat_prefs_set",
      "agent_chat_rename",
      "agent_chat_delete",
    ]);
  });
});
