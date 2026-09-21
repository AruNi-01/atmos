// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { AgentActivity, AgentChildActivity } from "@atmos/api-types/ws/dto/events";

import {
  activityToConversation,
  childToConversation,
  isObserverChromeToolName,
} from "../observer-conversation";

function activity(partial: Partial<AgentActivity> & { session_id: string }): AgentActivity {
  return {
    tool: "grok-build",
    last_state: "running",
    todos: [],
    children: [],
    turns: [],
    turns_omitted: 0,
    started_at: "t",
    last_event_at: "t",
    ...partial,
  };
}

describe("observer conversation", () => {
  it("treats spawn and wait-poll names as chrome", () => {
    expect(isObserverChromeToolName("spawn_subagent")).toBe(true);
    expect(isObserverChromeToolName("get_command_or_subagent_output")).toBe(true);
    expect(isObserverChromeToolName("read_file")).toBe(false);
  });

  it("renders parent turns as user then assistant tool groups and drops child prompts", () => {
    const record = activity({
      session_id: "s1",
      current_tool: {
        name: "read_file",
        detail: "lib.rs",
        state: "pending",
        started_at: "t",
        repeat: 1,
      },
      children: [
        {
          child_id: "c1",
          name: "general-purpose",
          state: "running",
          recent_tools: [],
          prompt: "You are exploring the Atmos monorepo at /Users/aarynlu/OpenSource/atmos",
          started_at: "t",
          last_event_at: "t",
        },
      ],
      turns: [
        {
          turn_id: 1,
          prompt: "启动多个 subagent 探索一下这个项目",
          started_at: "t",
          tools: [
            {
              name: "spawn_subagent",
              detail: "",
              state: "ok",
              started_at: "t",
              repeat: 1,
            },
          ],
          todos: [],
          spawned_child_ids: ["c1"],
        },
        {
          turn_id: 2,
          prompt: "You are exploring the Atmos monorepo at /Users/aarynlu/OpenSource/atmos",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: [],
        },
        {
          turn_id: 3,
          prompt: "",
          started_at: "t",
          tools: [
            {
              name: "get_command_or_subagent_output",
              detail: "",
              state: "pending",
              started_at: "t",
              repeat: 1,
            },
          ],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    });
    const messages = activityToConversation(record);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0]?.parts).toEqual([
      { type: "text", text: "启动多个 subagent 探索一下这个项目" },
    ]);
    const tools = messages[1]?.parts.filter((part) => part.type === "tool_call") ?? [];
    expect(tools).toHaveLength(1);
    expect(tools[0] && tools[0].type === "tool_call" ? tools[0].name : null).toBe("read_file");
  });

  it("renders a subagent prompt plus its tools", () => {
    const child: AgentChildActivity = {
      child_id: "c1",
      name: "general-purpose",
      state: "running",
      prompt: "You are exploring the Atmos monorepo",
      current_tool: {
        name: "grep",
        detail: "topics::",
        state: "pending",
        started_at: "t",
        repeat: 1,
      },
      recent_tools: [
        {
          name: "read_file",
          detail: "Cargo.toml",
          state: "ok",
          started_at: "t",
          repeat: 1,
        },
      ],
      started_at: "t",
      last_event_at: "t",
    };
    const messages = childToConversation(child);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    const tools = messages[1]?.parts.filter((part) => part.type === "tool_call") ?? [];
    expect(tools.map((part) => (part.type === "tool_call" ? part.name : ""))).toEqual([
      "read_file",
      "grep",
    ]);
  });
});
