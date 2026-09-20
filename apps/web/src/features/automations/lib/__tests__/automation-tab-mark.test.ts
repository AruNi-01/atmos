import { describe, expect, it } from "bun:test";

import { resolveAutomationTabMark } from "../automation-tab-mark";
import type { AutomationRunSummary } from "@/features/automations/types";

function run(overrides: Partial<AutomationRunSummary> = {}): AutomationRunSummary {
  return {
    guid: "abcdefghijkl",
    automation_guid: "job-1",
    agent_id: "codex",
    agent_label: "Codex",
    agent_config_json: null,
    trigger_kind: "manual",
    trigger_source_json: null,
    status: "running",
    failure_kind: null,
    error_message: null,
    target_kind: "project",
    project_guid: "proj-1",
    workspace_guid: null,
    created_workspace_guid: null,
    run_dir: "/tmp",
    result_path: "/tmp/final.md",
    terminal_display_name: "Daily health",
    tmux_session_name: null,
    tmux_window_name: null,
    tmux_window_index: null,
    started_at: "",
    completed_at: null,
    exit_code: null,
    execute_mode: "terminal",
    surface_kind: "terminal",
    surface_session_id: "sess-1",
    surface_scope_id: "proj-1",
    stale_prompted_at: null,
    stale_prompt_dismissed: false,
    ...overrides,
  };
}

describe("automation-tab-mark", () => {
  it("does not mark a tab just because it shares the project scope", () => {
    expect(
      resolveAutomationTabMark(
        {
          kind: "terminal",
          panes: [{ sessionId: "other", tmuxWindowName: "1" }],
        },
        [run()],
      ),
    ).toBeNull();
    expect(
      resolveAutomationTabMark(
        { kind: "chat", chatId: "chat-other" },
        [run({ execute_mode: "chat", surface_kind: "chat", surface_session_id: "chat-1" })],
      ),
    ).toBeNull();
  });

  it("marks a terminal tab from origin run id or automation window name", () => {
    expect(
      resolveAutomationTabMark(
        {
          kind: "terminal",
          panes: [{ origin: "automation", runGuid: "abcdefghijkl" }],
        },
        [run()],
      )?.tooltip,
    ).toBe("Daily health · abcdefgh");
    expect(
      resolveAutomationTabMark(
        {
          kind: "terminal",
          panes: [{ tmuxWindowName: "auto-abcdefgh" }],
        },
        [run()],
      )?.run.guid,
    ).toBe("abcdefghijkl");
  });

  it("marks a chat tab from source run guid or chat id", () => {
    const chatRun = run({
      execute_mode: "chat",
      surface_kind: "chat",
      surface_session_id: "chat-9",
    });
    expect(
      resolveAutomationTabMark(
        { kind: "chat", chatId: "chat-9", source: "automation" },
        [chatRun],
      )?.run.guid,
    ).toBe("abcdefghijkl");
    expect(
      resolveAutomationTabMark(
        { kind: "chat", automationRunGuid: "abcdefghijkl" },
        [chatRun],
      )?.tooltip,
    ).toBe("Daily health · abcdefgh");
  });
});
