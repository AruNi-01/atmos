import { describe, expect, it } from "bun:test";

import {
  buildStandaloneAutomationProject,
  isStandaloneAutomationProject,
  isStandaloneSidebarJob,
  mergeStandaloneAutomationProject,
  omitStandaloneAutomationProjectEntries,
  STANDALONE_GROUP_ID,
} from "../standalone-sidebar";
import type { AutomationSummary } from "@/features/automations/types";

function job(overrides: Partial<AutomationSummary> = {}): AutomationSummary {
  return {
    guid: "job-1",
    display_name: "Daily health",
    agent_id: "codex",
    agent_config_json: null,
    target_kind: "standalone",
    project_guid: null,
    workspace_guid: null,
    schedule_enabled: false,
    schedule_paused: false,
    schedule_kind: null,
    schedule_expr: null,
    schedule_timezone: "UTC",
    next_run_at: null,
    trigger_kind: "manual",
    trigger_enabled: false,
    trigger_status: "active",
    trigger_config_json: null,
    last_run_guid: null,
    last_status: null,
    run_count: 0,
    execute_mode: "terminal",
    ...overrides,
  };
}

describe("standalone-sidebar", () => {
  it("builds one workspace-level row per standalone job", () => {
    const project = buildStandaloneAutomationProject([
      job(),
      job({ guid: "job-2", display_name: "Nightly", target_kind: "project" }),
    ]);
    expect(project?.id).toBe(STANDALONE_GROUP_ID);
    expect(project?.name).toBe("Automations Standalone");
    expect(project?.workspaces).toHaveLength(1);
    expect(project?.workspaces[0]?.id).toBe("automation:job-1");
    expect(project?.workspaces[0]?.createSource).toBe("automation");
    expect(project?.workspaces[0]?.localPath).toBe(
      "~/.atmos/data/automations/definitions/job-1",
    );
  });

  it("returns null when there are no standalone jobs", () => {
    expect(
      buildStandaloneAutomationProject([job({ target_kind: "project" })]),
    ).toBeNull();
  });

  it("treats synthetic job rows as sidebar jobs, not hidden worktrees", () => {
    expect(isStandaloneAutomationProject(STANDALONE_GROUP_ID)).toBe(true);
    expect(isStandaloneAutomationProject("proj-1")).toBe(false);
    expect(isStandaloneSidebarJob(STANDALONE_GROUP_ID, "automation:job-1")).toBe(true);
    expect(isStandaloneSidebarJob("proj-1", "automation:job-1")).toBe(true);
    expect(isStandaloneSidebarJob("proj-1", "ws-1")).toBe(false);
    expect(
      omitStandaloneAutomationProjectEntries([
        { projectId: STANDALONE_GROUP_ID },
        { projectId: "proj-1" },
      ]),
    ).toEqual([{ projectId: "proj-1" }]);
  });

  it("appends the virtual group without duplicating", () => {
    const merged = mergeStandaloneAutomationProject(
      [
        {
          id: STANDALONE_GROUP_ID,
          name: "stale",
          isOpen: true,
          workspaces: [],
          mainFilePath: "",
          sidebarOrder: 0,
          borderColor: null,
          logoPath: null,
        },
      ],
      [job()],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe("Automations Standalone");
  });
});
