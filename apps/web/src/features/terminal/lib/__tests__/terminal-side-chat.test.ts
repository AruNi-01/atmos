// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import { mergeSideChatRecords, type LocalSideChatRecord } from "../terminal-side-chat";

function sideChatRecord(
  overrides: Partial<LocalSideChatRecord> & Pick<LocalSideChatRecord, "side_chat_id" | "workspace_id">,
): LocalSideChatRecord {
  return {
    side_chat_id: overrides.side_chat_id,
    workspace_id: overrides.workspace_id,
    project_name: null,
    workspace_name: null,
    source_pane_id: "pane-1",
    source_tmux_window_name: "window-1",
    source_surface_kind: "terminal_pane",
    source_surface_ref_json: null,
    side_tmux_window_name: "side-window-1",
    agent_ref_json: null,
    color_hex: "#06b6d4",
    status: "open",
    created_at: null,
    updated_at: null,
    isNew: false,
    sessionId: "session-server",
    ...overrides,
  };
}

describe("mergeSideChatRecords", () => {
  it("does not preserve local side chat state across workspace id collisions", () => {
    const current = sideChatRecord({
      side_chat_id: "side-collision",
      workspace_id: "workspace-old",
      hasSentInitialCommand: true,
      initialCommand: "old prompt\r",
      isNew: true,
      sessionId: "session-old",
    });
    const incoming = sideChatRecord({
      side_chat_id: "side-collision",
      workspace_id: "workspace-new",
      hasSentInitialCommand: false,
      initialCommand: undefined,
      isNew: false,
      sessionId: "session-new",
    });

    expect(mergeSideChatRecords([current], [incoming], "workspace-new")).toEqual([incoming]);
  });

  it("preserves local side chat state within the same workspace", () => {
    const current = sideChatRecord({
      side_chat_id: "side-stable",
      workspace_id: "workspace-1",
      hasSentInitialCommand: true,
      initialCommand: "local prompt\r",
      isNew: true,
      sessionId: "session-local",
    });
    const incoming = sideChatRecord({
      side_chat_id: "side-stable",
      workspace_id: "workspace-1",
      hasSentInitialCommand: false,
      initialCommand: undefined,
      isNew: false,
      sessionId: "session-server",
    });

    expect(mergeSideChatRecords([current], [incoming], "workspace-1")).toEqual([
      {
        ...incoming,
        hasSentInitialCommand: true,
        initialCommand: "local prompt\r",
        isNew: true,
        sessionId: "session-local",
      },
    ]);
  });
});
