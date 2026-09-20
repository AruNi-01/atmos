import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { automationRunSurfacePlan } from "../automation-run-surface-plan";
import type { AutomationRunSummary } from "@/features/automations/types";

function run(
  overrides: Partial<AutomationRunSummary> = {},
): AutomationRunSummary {
  return {
    guid: "run-1",
    automation_guid: "job-1",
    agent_id: "codex",
    agent_label: "Codex",
    agent_config_json: null,
    trigger_kind: "manual",
    trigger_source_json: null,
    status: "running",
    failure_kind: null,
    error_message: null,
    target_kind: "workspace",
    project_guid: "proj-1",
    workspace_guid: "ws-1",
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
    surface_scope_id: "ws-1",
    stale_prompted_at: null,
    stale_prompt_dismissed: false,
    ...overrides,
  };
}

describe("automationRunSurfacePlan", () => {
  it("does not plan a tab for a failed start", () => {
    expect(
      automationRunSurfacePlan(
        run({ status: "failed", created_workspace_guid: "ws-new" }),
      ),
    ).toEqual({
      contextId: "ws-1",
      tabValue: null,
      kind: null,
      refreshWorkspaceSidebar: true,
    });
  });

  it("plans a chat tab from the created session", () => {
    expect(
      automationRunSurfacePlan(
        run({
          execute_mode: "chat",
          surface_kind: "chat",
          surface_session_id: "chat-9",
          surface_scope_id: "automation:job-1",
        }),
      ),
    ).toEqual({
      contextId: "automation:job-1",
      tabValue: "agent-chat:chat-9",
      kind: "chat",
      refreshWorkspaceSidebar: false,
    });
  });

  it("plans a new extra Terminal tab on the run scope", () => {
    expect(automationRunSurfacePlan(run())).toEqual({
      contextId: "ws-1",
      tabValue: "terminal-tab:auto-run-1",
      kind: "terminal",
      refreshWorkspaceSidebar: false,
    });
  });

  it("refreshes the sidebar when a new workspace is created", () => {
    expect(
      automationRunSurfacePlan(
        run({
          created_workspace_guid: "ws-created",
          surface_scope_id: "ws-created",
        }),
      ).refreshWorkspaceSidebar,
    ).toBe(true);
  });
});

describe("applyAutomationRunSurface", () => {
  it("attaches store data without activating or navigating", () => {
    const apply = readFileSync(
      join(import.meta.dir, "../apply-automation-run-surface.ts"),
      "utf8",
    );
    expect(apply).toContain("invalidateProjectBootstrap");
    expect(apply).toContain("openTab({");
    expect(apply).toContain("ensureAutomationTerminalTab(plan.contextId");
    expect(apply).toContain("automationTerminalWindowName(run.guid)");
    expect(apply).not.toContain("ensureFixedTerminalTab(plan.contextId)");
    expect(apply).toContain("offerTab(plan.contextId, ensured.id)");
    expect(apply).toContain("offerTab(plan.contextId, plan.tabValue)");
    expect(apply).not.toContain("requestActivate");
    expect(apply).not.toContain("activateCenterChromeTab");
    expect(apply).not.toContain("pushWorkspaceDeepLink");
    expect(apply).not.toContain("router.push");
  });
});
