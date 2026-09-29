import { describe, expect, it } from "bun:test";
import {
  hasCollapsibleAssistantProcess,
  shouldAutoCollapseProcessOnSettle,
  shouldCollapseAssistantProcess,
  splitAssistantProcessParts,
} from "@/features/agent/lib/assistant-process-parts";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

describe("assistant process collapse", () => {
  it("puts tools and thinking above the final answer even if history stored them last", () => {
    const parts: AgentPart[] = [
      { type: "text", text: "final answer" },
      { type: "thinking", text: "hmm" },
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "a.ts" },
      },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part.type)).toEqual(["thinking", "tool_call"]);
    expect(tailParts.map((item) => item.part.type)).toEqual(["text"]);
    expect(tailParts[0]?.part).toMatchObject({ type: "text", text: "final answer" });
  });

  it("keeps mid-turn commentary in process and only the trailing text as the answer", () => {
    const parts: AgentPart[] = [
      { type: "text", text: "looking" },
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "a.ts" },
      },
      { type: "text", text: "mid commentary" },
      {
        type: "tool_call",
        tool_call_id: "t2",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
      },
      { type: "text", text: "final" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) =>
      item.part.type === "text" ? item.part.text : item.part.type,
    )).toEqual(["looking", "tool_call", "mid commentary", "tool_call"]);
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "final" }]);
  });

  it("keeps the grok chrome spawn tool in the parent message and hides nested chrome work", () => {
    const parts: AgentPart[] = [
      {
        type: "tool_call",
        tool_call_id: "sa-a",
        name: "grok_chrome",
        kind: "subagent",
        status: "running",
        params: { type: "subagent", description: "goal achievement skeptic", agent_type: "general-purpose" },
      },
      { type: "text", text: "only-a", parent_tool_call_id: "sa-a" },
      {
        type: "tool_call",
        tool_call_id: "child-read",
        name: "Read",
        kind: "read",
        status: "completed",
        parent_tool_call_id: "sa-a",
        params: { type: "read", path: "a.ts" },
      },
      { type: "text", text: "parent reply" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part.type)).toEqual(["tool_call"]);
    expect(processParts[0]?.part).toMatchObject({ tool_call_id: "sa-a", name: "grok_chrome" });
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "parent reply" }]);
  });

  it("hides grok chrome that duplicates a user spawn from the parent process fold", () => {
    const parts: AgentPart[] = [
      {
        type: "tool_call",
        tool_call_id: "tc_rust",
        name: "spawn_subagent",
        kind: "subagent",
        status: "running",
        params: { type: "subagent", description: "Explore Rust backend layers", agent_type: "explore" },
      },
      {
        type: "tool_call",
        tool_call_id: "sa-rust",
        name: "grok_chrome",
        kind: "subagent",
        status: "running",
        params: { type: "subagent", description: "Explore Rust backend layers", agent_type: "explore", task_id: "sa-rust" },
      },
      { type: "text", text: "parent reply" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part)).toEqual([parts[0]]);
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "parent reply" }]);
  });

  it("does not treat grok child final text with a parent id as the parent answer", () => {
    const parts: AgentPart[] = [
      {
        type: "tool_call",
        tool_call_id: "sub",
        name: "spawn_subagent",
        kind: "subagent",
        status: "completed",
        params: { type: "subagent", description: "Read hello2.txt", agent_type: "explore" },
        result: { type: "text", text: "hello from child" },
      },
      { type: "text", text: "hello from child", parent_tool_call_id: "sub" },
    ];
    const { tailParts } = splitAssistantProcessParts(parts);
    expect(tailParts).toEqual([]);
  });

  it("does not treat nested subagent text as the parent answer", () => {
    const parts: AgentPart[] = [
      {
        type: "tool_call",
        tool_call_id: "parent",
        name: "Task",
        kind: "subagent",
        status: "completed",
        params: { type: "subagent", description: "Inspect tests" },
      },
      { type: "text", text: "nested hello", parent_tool_call_id: "parent" },
      { type: "text", text: "final" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "final" }]);
    expect(processParts.map((item) => item.part.type)).toEqual(["tool_call", "text"]);
  });

  it("does not promote leading commentary to the answer when the turn ends on tools", () => {
    const parts: AgentPart[] = [
      { type: "text", text: "looking" },
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Read",
        kind: "read",
        status: "completed",
        params: { type: "read", path: "a.ts" },
      },
      { type: "text", text: "still working" },
      {
        type: "tool_call",
        tool_call_id: "t2",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
      },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(tailParts).toEqual([]);
    expect(processParts).toHaveLength(4);
  });

  it("keeps thinking that immediately precedes the first text after tools inside the process fold", () => {
    const parts: AgentPart[] = [
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
      },
      { type: "thinking", text: "wrap up" },
      { type: "text", text: "done" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part.type)).toEqual(["tool_call", "thinking"]);
    expect(tailParts.map((item) => item.part)).toEqual([{ type: "text", text: "done" }]);
  });

  it("keeps the whole closing stretch visible after the last tool, including extra text and thinking", () => {
    const parts: AgentPart[] = [
      { type: "thinking", text: "work" },
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
      },
      { type: "thinking", text: "draft the summary" },
      { type: "text", text: "## 验证\n\n- 浏览器实测通过。" },
      { type: "thinking", text: "The reminder says the todo list still has open items." },
      {
        type: "plan",
        plan: { entries: [{ content: "Rename tab", priority: "high", status: "completed" }] },
      },
      { type: "text", text: "one more note" },
      { type: "thinking", text: "ack" },
      { type: "text", text: "Plan is up-to-date." },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) => item.part.type)).toEqual(["thinking", "tool_call", "thinking"]);
    expect(tailParts.map((item) =>
      item.part.type === "text" ? item.part.text : item.part.type,
    )).toEqual([
      "## 验证\n\n- 浏览器实测通过。",
      "thinking",
      "plan",
      "one more note",
      "thinking",
      "Plan is up-to-date.",
    ]);
    expect(
      hasCollapsibleAssistantProcess({
        id: "m-droid",
        role: "assistant",
        streaming: false,
        completed_at: "2026-09-10T09:08:24.000Z",
        worked_ms: 567206,
        parts,
      } as AgentMessage),
    ).toBe(true);
  });

  it("treats a new tool after a reply as continued work, not a closing stretch", () => {
    const parts: AgentPart[] = [
      {
        type: "tool_call",
        tool_call_id: "t1",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "a.ts" },
      },
      { type: "text", text: "## 验证\n\n- 浏览器实测通过。" },
      {
        type: "tool_call",
        tool_call_id: "t2",
        name: "Edit",
        kind: "edit",
        status: "completed",
        params: { type: "edit", path: "b.ts" },
      },
      { type: "text", text: "also patched b.ts" },
    ];
    const { processParts, tailParts } = splitAssistantProcessParts(parts);
    expect(processParts.map((item) =>
      item.part.type === "text" ? item.part.text : item.part.type,
    )).toEqual(["tool_call", "## 验证\n\n- 浏览器实测通过。", "tool_call"]);
    expect(tailParts.map((item) => item.part)).toEqual([
      { type: "text", text: "also patched b.ts" },
    ]);
  });

  it("does not collapse while the turn is still streaming or only between text and tools", () => {
    expect(shouldCollapseAssistantProcess({ streaming: true }, false, true, true)).toBe(false);
    expect(shouldCollapseAssistantProcess({ streaming: false }, false, true, true)).toBe(false);
    expect(shouldCollapseAssistantProcess({ streaming: false, completed_at: null }, true, true, true)).toBe(false);
  });

  it("collapses process only after the turn has fully settled", () => {
    expect(shouldCollapseAssistantProcess(
      { streaming: false, completed_at: "2026-08-29T00:00:00.000Z" },
      false,
      true,
      true,
    )).toBe(true);
    expect(shouldCollapseAssistantProcess(
      { streaming: false, worked_ms: 3200 },
      false,
      true,
      true,
    )).toBe(false);
  });

  it("skips auto-collapse on settle when the user is inspecting expanded tools", () => {
    expect(shouldAutoCollapseProcessOnSettle(false)).toBe(true);
    expect(shouldAutoCollapseProcessOnSettle(true)).toBe(false);
  });

  it("collapses process above the answer after the turn has settled", () => {
    expect(
      hasCollapsibleAssistantProcess({
        id: "m1",
        role: "assistant",
        streaming: false,
        completed_at: "2026-08-29T00:00:00.000Z",
        worked_ms: 98000,
        parts: [
          { type: "thinking", text: "plan" },
          { type: "text", text: "done" },
        ],
      } as AgentMessage),
    ).toBe(true);
    expect(
      hasCollapsibleAssistantProcess({
        id: "m2",
        role: "assistant",
        streaming: false,
        worked_ms: 1200,
        parts: [{ type: "text", text: "only answer" }],
      } as AgentMessage),
    ).toBe(false);
    expect(
      hasCollapsibleAssistantProcess({
        id: "m3",
        role: "assistant",
        streaming: false,
        completed_at: "2026-08-29T00:00:00.000Z",
        worked_ms: 4_000,
        parts: [
          {
            type: "tool_call",
            tool_call_id: "t1",
            name: "Read",
            kind: "read",
            status: "completed",
            params: { type: "read", path: "a.ts" },
          },
        ],
      } as AgentMessage),
    ).toBe(true);
  });
});
