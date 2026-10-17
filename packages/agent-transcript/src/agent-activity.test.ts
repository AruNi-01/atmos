import { describe, expect, it } from "bun:test";
import type { AgentMessage, AgentPart, AgentTool } from "@atmos/api-types/ws/dto/agent-chat";
import { deriveAgentActivityState } from "./agent-activity";

function assistant(parts: AgentPart[], streaming = true): AgentMessage {
  return { id: "a", parts, role: "assistant", streaming };
}

function tool(overrides: Partial<AgentTool> & Pick<AgentTool, "kind" | "tool_call_id">): AgentPart {
  return {
    name: overrides.name ?? overrides.kind,
    params: overrides.params ?? { type: "other", value: null },
    status: overrides.status ?? "running",
    type: "tool_call",
    ...overrides,
  };
}

describe("deriveAgentActivityState", () => {
  it("stays idle until a turn is open", () => {
    expect(deriveAgentActivityState([], false)).toEqual({ busy: false });
    expect(
      deriveAgentActivityState(
        [{ id: "u", parts: [{ text: "hi", type: "text" }], role: "user" }],
        false,
      ),
    ).toEqual({ busy: false });
  });

  it("generates while the host turn is open and nothing is streaming yet", () => {
    expect(deriveAgentActivityState([], true)).toMatchObject({
      busy: true,
      kind: "working",
      label: { type: "generating" },
      trail: "ellipsis",
    });
    expect(
      deriveAgentActivityState([assistant([{ text: "done", type: "text" }], false)], true),
    ).toMatchObject({ label: { type: "generating" }, trail: "ellipsis" });
  });

  it("names the live session, thought, and answer", () => {
    expect(
      deriveAgentActivityState(
        [assistant([{ action: "create", status: "running", type: "session_lifecycle" }])],
        false,
      ),
    ).toMatchObject({ label: { type: "creatingSession" }, trail: "ellipsis" });
    expect(
      deriveAgentActivityState(
        [assistant([{ action: "resume", status: "running", type: "session_lifecycle" }])],
        false,
      ),
    ).toMatchObject({ label: { type: "resumingSession" } });
    expect(
      deriveAgentActivityState([assistant([{ text: "consider", type: "thinking" }])], false),
    ).toMatchObject({ kind: "thinking", label: { type: "thinking" }, trail: "ellipsis" });
    expect(
      deriveAgentActivityState([assistant([{ text: "answer", type: "text" }])], false),
    ).toMatchObject({ label: { type: "streaming" }, trail: "ellipsis" });
  });

  it("prefers the latest parent tool and skips a live background command", () => {
    const state = deriveAgentActivityState(
      [
        assistant([
          tool({
            kind: "read",
            params: { path: "src/theme.ts", type: "read" },
            title: "src/theme.ts",
            tool_call_id: "read",
          }),
          tool({
            kind: "execute",
            params: { background: true, command: "bun test", type: "execute" },
            tool_call_id: "bg",
          }),
        ]),
      ],
      false,
    );
    expect(state).toMatchObject({
      label: { type: "tool" },
      trail: "none",
    });
    if (state.busy && state.label.type === "tool") {
      expect(state.label.part.tool_call_id).toBe("read");
    }
  });

  it("counts active wait polls and ignores nested child work", () => {
    const waiting = deriveAgentActivityState(
      [
        assistant([
          tool({
            kind: "subagent",
            name: "Task",
            params: { agent_type: "explore", description: "Explore", type: "subagent" },
            tool_call_id: "one",
          }),
          tool({
            kind: "other",
            name: "TaskOutput",
            tool_call_id: "wait",
          }),
        ]),
      ],
      false,
    );
    expect(waiting).toMatchObject({
      label: { count: 1, type: "waiting" },
      trail: "none",
    });

    const nested = deriveAgentActivityState(
      [
        assistant([
          tool({
            kind: "read",
            params: { path: "hidden.ts", type: "read" },
            parent_tool_call_id: "parent",
            tool_call_id: "child",
          }),
        ]),
      ],
      false,
    );
    expect(nested).toMatchObject({ label: { type: "generating" } });
  });
});
