import { describe, expect, it } from "bun:test";

import {
  automationChatTabValue,
  automationTabTooltip,
  automationTerminalTabValue,
  automationTerminalWindowName,
  isStandaloneAutomationScope,
  parseExecuteMode,
  parseStandaloneScope,
  runEnvironmentContextId,
  runEnvironmentHref,
  runFollowUpKind,
  runLandingHref,
  runSurfaceMode,
  shouldShowOverviewGitWidgets,
  standaloneDefinitionDir,
  standaloneJobHref,
  standaloneScopeId,
} from "../automation-run-landing";

describe("automation-run-landing", () => {
  it("defaults unknown modes to headless", () => {
    expect(parseExecuteMode(undefined)).toBe("headless");
    expect(parseExecuteMode("spawn")).toBe("headless");
    expect(parseExecuteMode("chat")).toBe("chat");
  });

  it("builds tooltip as job · short run id", () => {
    expect(automationTabTooltip("Daily health", "abcdefghijkl")).toBe(
      "Daily health · abcdefgh",
    );
  });

  it("rejects the group id as a job scope", () => {
    expect(standaloneScopeId("job-1")).toBe("automation:job-1");
    expect(parseStandaloneScope("automation:job-1")).toBe("job-1");
    expect(parseStandaloneScope("automation:standalone")).toBeNull();
    expect(isStandaloneAutomationScope("automation:job-1")).toBe(true);
    expect(isStandaloneAutomationScope("automation:job-1::space::extra")).toBe(true);
    expect(isStandaloneAutomationScope("automation:standalone")).toBe(true);
    expect(isStandaloneAutomationScope("ws-1")).toBe(false);
  });

  it("omits Overview git widgets for standalone automation context", () => {
    expect(shouldShowOverviewGitWidgets("automation:job-1")).toBe(false);
    expect(shouldShowOverviewGitWidgets("automation:job-1::space::extra")).toBe(false);
    expect(shouldShowOverviewGitWidgets("automation:standalone")).toBe(false);
    expect(shouldShowOverviewGitWidgets("ws-1")).toBe(true);
    expect(shouldShowOverviewGitWidgets("proj-1")).toBe(true);
  });

  it("lands headless on run detail", () => {
    expect(
      runLandingHref({
        guid: "run-1",
        execute_mode: "headless",
        surface_kind: "none",
        surface_scope_id: null,
        target_kind: "standalone",
        project_guid: null,
        workspace_guid: null,
        created_workspace_guid: null,
        automation_guid: "auto-1",
        surface_session_id: null,
      }),
    ).toBe("/automations?run=run-1");
  });

  it("lands project terminal on the created session", () => {
    expect(automationTerminalWindowName("run-2xxxx")).toBe("auto-run-2xxx");
    expect(automationTerminalTabValue("run-2xxxx")).toBe("terminal-tab:auto-run-2xxx");
    expect(
      runLandingHref({
        guid: "run-2xxxx",
        execute_mode: "terminal",
        surface_kind: "terminal",
        surface_scope_id: "proj-1",
        surface_session_id: "sess-2",
        target_kind: "project",
        project_guid: "proj-1",
        workspace_guid: null,
        created_workspace_guid: null,
        automation_guid: "auto-1",
      }),
    ).toBe("/project?id=proj-1&tab=terminal-tab%3Aauto-run-2xxx");
  });

  it("lands standalone chat on the created chat tab", () => {
    expect(automationChatTabValue("chat-9")).toBe("agent-chat:chat-9");
    expect(standaloneJobHref("auto-1")).toBe("/automation?id=auto-1");
    expect(standaloneDefinitionDir("auto-1")).toBe(
      "~/.atmos/data/automations/definitions/auto-1",
    );
    expect(
      runLandingHref({
        guid: "run-3",
        execute_mode: "chat",
        surface_kind: "chat",
        surface_scope_id: "automation:auto-1",
        surface_session_id: "chat-9",
        target_kind: "standalone",
        project_guid: null,
        workspace_guid: null,
        created_workspace_guid: null,
        automation_guid: "auto-1",
      }),
    ).toBe("/automation?id=auto-1&tab=agent-chat%3Achat-9");
  });

  it("lands on the live surface even if execute_mode is still headless", () => {
    expect(
      runLandingHref({
        guid: "run-4xxxx",
        execute_mode: "headless",
        surface_kind: "terminal",
        surface_scope_id: "ws-9",
        surface_session_id: null,
        target_kind: "workspace",
        project_guid: "proj-1",
        workspace_guid: "ws-9",
        created_workspace_guid: null,
        automation_guid: "auto-1",
      }),
    ).toBe("/workspace?id=ws-9&tab=terminal-tab%3Aauto-run-4xxx");
  });

  it("classifies follow-up from surface then execute mode", () => {
    expect(runFollowUpKind({ execute_mode: "headless", surface_kind: "none" })).toBe(
      "continue-menu",
    );
    expect(runFollowUpKind({ execute_mode: "headless" })).toBe("continue-menu");
    expect(runFollowUpKind({ execute_mode: "terminal", surface_kind: "none" })).toBe(
      "open-terminal",
    );
    expect(runFollowUpKind({ execute_mode: "chat", surface_kind: null })).toBe("open-chat");
    expect(
      runFollowUpKind({ execute_mode: "headless", surface_kind: "terminal" }),
    ).toBe("open-terminal");
    expect(runSurfaceMode({ execute_mode: "headless", surface_kind: "chat" })).toBe(
      "chat",
    );
  });

  it("builds a continue terminal href without the original tmux window", () => {
    expect(
      runEnvironmentHref(
        {
          guid: "run-2xxxx",
          execute_mode: "headless",
          surface_kind: "none",
          surface_scope_id: "automation:auto-1",
          surface_session_id: null,
          target_kind: "standalone",
          project_guid: null,
          workspace_guid: null,
          created_workspace_guid: null,
          automation_guid: "auto-1",
        },
        "tab=terminal",
      ),
    ).toBe("/automation?id=auto-1&tab=terminal");
    expect(
      runEnvironmentContextId({
        guid: "run-2xxxx",
        execute_mode: "headless",
        surface_kind: "none",
        surface_scope_id: "automation:auto-1",
        surface_session_id: null,
        target_kind: "standalone",
        project_guid: null,
        workspace_guid: null,
        created_workspace_guid: null,
        automation_guid: "auto-1",
      }),
    ).toBe("automation:auto-1");
  });
});
