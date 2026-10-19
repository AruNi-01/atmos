// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "../../../../..");
const thread = readFileSync(join(here, "use-agent-chat-thread.ts"), "utf8");
const card = readFileSync(join(here, "cards/queue-card.tsx"), "utf8");
const webApi = readFileSync(join(workspace, "apps/web/src/api/ws/agent-chat-api.ts"), "utf8");
const mobileActions = readFileSync(join(here, "../../api/ws-actions.ts"), "utf8");

describe("queue edit, reorder, and remove", () => {
  test("phone wrappers send the same wire fields as web", () => {
    for (const action of [
      "agent_chat_queue_update",
      "agent_chat_queue_reorder",
      "agent_chat_queue_delete",
    ]) {
      expect(webApi).toContain(action);
      expect(mobileActions).toContain(action);
    }
    expect(thread).toContain("agentChatQueueUpdate");
    expect(thread).toContain("item_id: itemId");
    expect(thread).toContain("text,");
    expect(thread).toContain("agentChatQueueDelete");
    expect(thread).toContain("agentChatQueueReorder");
    expect(thread).toContain("item_ids: itemIds");
    expect(webApi).toContain("text: patch.text");
    expect(webApi).toContain("item_ids");
    expect(webApi).toContain("item_id");
  });

  test("the queue card passes the edited text, the item id, and the reordered ids", () => {
    expect(card).toContain("onUpdate(item.id, draft)");
    expect(card).toContain("onDelete(item.id)");
    expect(card).toContain("onReorder(next)");
    expect(card).toContain("theme.colors.label");
    expect(card).toContain("theme.colors.secondaryLabel");
    expect(card).toContain("ListOrderedIcon");
    expect(card).toContain("fontSize: 12");
    expect(card).not.toContain("chatForeground");
  });
});
