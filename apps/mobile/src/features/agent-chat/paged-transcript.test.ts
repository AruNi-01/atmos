// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  mergePagedMessages,
  patchToolParts,
  prependOlderMessages,
  restoreToolDetailsOnMessage,
} from "./paged-transcript";

function msg(id: string, extra?: Partial<AgentMessage>): AgentMessage {
  return { id, role: "user", parts: [{ type: "text", text: id }], ...extra };
}

function toolMessage(
  id: string,
  tool: Partial<Extract<AgentPart, { type: "tool_call" }>> & { tool_call_id: string },
): AgentMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: "tool_call",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
        ...tool,
      },
    ],
  };
}

describe("mergePagedMessages", () => {
  test("keeps loaded older rows when a last-20 snapshot arrives", () => {
    const local = Array.from({ length: 40 }, (_, index) => msg(`m${index + 1}`));
    const window = [...Array.from({ length: 20 }, (_, index) => msg(`m${index + 21}`)), msg("m41")];
    const merged = mergePagedMessages(local, window);
    expect(merged.map((message) => message.id)).toEqual(
      Array.from({ length: 41 }, (_, index) => `m${index + 1}`),
    );
  });

  test("restores expanded tool bodies onto a lean window", () => {
    const local = [
      toolMessage("a1", {
        tool_call_id: "edit-1",
        result: { type: "diff", path: "a.ts", old_content: "a", new_content: "b" },
      }),
    ];
    const window = [
      toolMessage("a1", {
        tool_call_id: "edit-1",
        detail_omitted: true,
        result: { type: "diff_stats", path: "a.ts", additions: 1, deletions: 1 },
      }),
    ];
    const merged = mergePagedMessages(local, window);
    const part = merged[0]?.parts[0];
    expect(part?.type).toBe("tool_call");
    if (part?.type !== "tool_call") return;
    expect(part.detail_omitted).toBe(false);
    expect(part.result).toEqual({
      type: "diff",
      path: "a.ts",
      old_content: "a",
      new_content: "b",
    });
  });
});

describe("prependOlderMessages", () => {
  test("inserts unique older ids at the front", () => {
    const local = [msg("m6"), msg("m7")];
    const older = [msg("m1"), msg("m6")];
    expect(prependOlderMessages(local, older).map((message) => message.id)).toEqual([
      "m1",
      "m6",
      "m7",
    ]);
  });
});

describe("patchToolParts", () => {
  test("replaces omitted tools with full parts in request order", () => {
    const messages = [
      toolMessage("a1", {
        tool_call_id: "edit-1",
        detail_omitted: true,
        result: { type: "diff_stats", path: "a.ts", additions: 1, deletions: 0 },
      }),
    ];
    const patched = patchToolParts(messages, [
      {
        type: "tool_call",
        tool_call_id: "edit-1",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
        result: { type: "diff", path: "a.ts", old_content: "a", new_content: "b" },
      },
    ]);
    const part = patched[0]?.parts[0];
    expect(part?.type).toBe("tool_call");
    if (part?.type !== "tool_call") return;
    expect(part.detail_omitted).toBe(false);
    expect(part.result).toMatchObject({ type: "diff", new_content: "b" });
  });
});

describe("restoreToolDetailsOnMessage", () => {
  test("leaves a full incoming part alone", () => {
    const incoming = toolMessage("a1", {
      tool_call_id: "edit-1",
      result: { type: "diff", path: "a.ts", new_content: "new" },
    });
    expect(restoreToolDetailsOnMessage(incoming).parts).toEqual(incoming.parts);
  });
});
