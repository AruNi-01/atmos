import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const setup = readFileSync(
  join(import.meta.dir, "../AutomationSetup.tsx"),
  "utf8",
);
const form = readFileSync(
  join(import.meta.dir, "../../hooks/use-automation-setup-form.ts"),
  "utf8",
);
const pageState = readFileSync(
  join(import.meta.dir, "../../hooks/use-automation-page-state.ts"),
  "utf8",
);
const banner = readFileSync(
  join(import.meta.dir, "../AutomationStalePromptBanner.tsx"),
  "utf8",
);
const chip = readFileSync(
  join(import.meta.dir, "../AutomationChip.tsx"),
  "utf8",
);
const page = readFileSync(
  join(import.meta.dir, "../AutomationPage.tsx"),
  "utf8",
);
const tabMark = readFileSync(
  join(import.meta.dir, "../AutomationTabMark.tsx"),
  "utf8",
);
const tabBar = readFileSync(
  join(import.meta.dir, "../../../../app-shell/CenterStageTabBar.tsx"),
  "utf8",
);
const projectItem = readFileSync(
  join(import.meta.dir, "../../../../app-shell/sidebar/ProjectItem.tsx"),
  "utf8",
);
const groupedProjectRow = readFileSync(
  join(import.meta.dir, "../../../../app-shell/sidebar/GroupedProjectRow.tsx"),
  "utf8",
);
const workspaceContent = readFileSync(
  join(import.meta.dir, "../../../../app-shell/sidebar/WorkspaceContent.tsx"),
  "utf8",
);
const workspaceKanbanCard = readFileSync(
  join(import.meta.dir, "../../../../app-shell/sidebar/WorkspaceKanbanCard.tsx"),
  "utf8",
);
const overviewTab = readFileSync(
  join(import.meta.dir, "../../../../features/workspace/components/OverviewTab.tsx"),
  "utf8",
);
const centerStage = readFileSync(
  join(import.meta.dir, "../../../../app-shell/CenterStage.tsx"),
  "utf8",
);
const header = readFileSync(
  join(import.meta.dir, "../../../../app-shell/Header.tsx"),
  "utf8",
);
const runDetail = readFileSync(
  join(import.meta.dir, "../RunDetailPanel.tsx"),
  "utf8",
);
const chatCatalog = readFileSync(
  join(import.meta.dir, "../../hooks/use-automation-chat-agent-catalog.ts"),
  "utf8",
);
const surfaceSync = readFileSync(
  join(import.meta.dir, "../../hooks/use-automation-run-surface-sync.ts"),
  "utf8",
);
const wsProvider = readFileSync(
  join(import.meta.dir, "../../../../providers/app/websocket-provider.tsx"),
  "utf8",
);

describe("automation execute modes", () => {
  test("setup exposes three execute-agent tabs above instructions", () => {
    expect(setup.indexOf("executeAgent.label")).toBeLessThan(
      setup.indexOf("instructions.label"),
    );
    expect(setup).toContain("CenterStageTabList");
    expect(setup).toContain("CenterStageTab");
    expect(setup).toContain("WelcomeAgentSelector");
    expect(setup).toContain('variant="panel"');
    expect(setup).toContain("ChatAgentConfigInput");
    expect(setup).toContain("configOnly");
    expect(setup).toContain("menuInline");
    expect(setup).not.toContain("menuSide");
    expect(setup).toContain("permissionOption={null}");
    expect(setup).toContain("modeOption={null}");
    expect(setup).toContain("chatAgents");
    expect(setup).not.toContain("ChatAgentConfigPicker");
    expect(setup).not.toContain("ChatAgentPicker");
    expect(setup).toContain("mergeInstalledAgents");
    expect(setup).not.toContain('variant="popover"');
    expect(setup).not.toContain("AutomationAgentPicker");
    expect(setup).toContain("execute_mode: executeMode");
    expect(setup).toContain("handleTryRun");
    expect(setup).toContain("applyAutomationRunSurface(run)");
    expect(setup).not.toContain("pushWorkspaceDeepLink");
    expect(setup).not.toContain("runLandingHref");
    expect(setup).toContain('run.status === "failed"');
    expect(setup).not.toContain("toastManager");
  });

  test("execute agent heading matches instructions chrome and shows the selected agent", () => {
    expect(setup).toContain('<Bot className="size-4 text-muted-foreground" />');
    expect(setup).toContain('<Sparkles className="size-4 text-muted-foreground" />');
    expect(setup).toContain('<Brain className="size-4 text-muted-foreground" />');
    expect(setup).toContain("justify-between");
    expect(setup).toContain("AgentIcon");
    expect(setup).toContain("selectedExecuteOption");
    expect(setup).toContain("selectedExecuteDetail");
    expect(setup).toContain("agentConfigTriggerText");
  });

  test("create/edit setup uses the settings-style push-page slide", () => {
    expect(page).toContain("PushPageStack");
    expect(page).toContain("usePushPageTransition");
    expect(page).toContain("closeSetupPush");
    expect(page).toContain("openSetupPush");
  });

  test("form hydrates execute mode and allows chat without terminal support", () => {
    expect(form).toContain('useState<AutomationExecuteMode>("headless")');
    expect(form).toContain("parseExecuteMode");
    expect(form).toContain("shouldAutofillTerminalAgent");
    expect(form).toContain("shouldAutofillChatAgent");
    expect(form).toContain("isChatAgentSelected");
    expect(form).toContain("chatProviderIds");
    expect(form).toContain("chatModel");
    expect(form).toContain("setChatModel");
    expect(form).toContain("nextChatConfig?.model");
    expect(setup).toContain("useAutomationChatAgentCatalog");
    expect(setup).toContain("composerConfigOptions");
    expect(setup).toContain("defaultOptionsModelId");
    expect(chatCatalog).toContain(".optionsGet(");
    expect(chatCatalog).toContain(".prefsGet()");
    expect(chatCatalog).toContain("hydrateFavoriteModelsFromPrefs");
    expect(chatCatalog).toContain("rememberComposerOptions");
    expect(form).not.toContain("if (!agentId && supportedAgents.length > 0)");
    expect(setup).not.toContain('setAgentId("")');
  });

  test("run now attaches the surface without navigating away", () => {
    expect(pageState).toContain("applyAutomationRunSurface(run)");
    expect(pageState).not.toContain("toasts.runStarted");
    expect(surfaceSync).toContain("applyAutomationRunSurface");
    expect(surfaceSync).not.toContain("pushWorkspaceDeepLink");
    const runNowBlock = pageState.slice(
      pageState.indexOf('if (action === "run")'),
      pageState.indexOf('} else if (action === "pause")'),
    );
    expect(runNowBlock).toContain("applyAutomationRunSurface(run)");
    expect(runNowBlock).not.toContain("pushWorkspaceDeepLink");
    expect(runNowBlock).not.toContain("runLandingHref");
    expect(wsProvider).toContain("useAutomationRunSurfaceSync");
  });

  test("headless continue is a menu; live surfaces open the existing session", () => {
    expect(runDetail).toContain("runFollowUpKind");
    expect(runDetail).toContain('"continue-menu"');
    expect(runDetail).toContain("continueInTerminal");
    expect(runDetail).toContain("continueInChat");
    expect(runDetail).toContain("openTerminal");
    expect(runDetail).toContain("openChat");
    expect(runDetail).toContain("DropdownMenu");
    expect(runDetail).toContain("onOpenRunSurface");
    expect(pageState).toContain("handleOpenRunSurface");
    expect(pageState).toContain("handleContinueInChat");
    expect(pageState).toContain("pushWorkspaceDeepLink");
    expect(pageState).toContain("openDraftTab");
    const continueTerminal = pageState.slice(
      pageState.indexOf("handleContinueInTerminal"),
      pageState.indexOf("handleContinueInChat"),
    );
    expect(continueTerminal).not.toContain("setStandaloneChatRunGuid");
    expect(continueTerminal).toContain("tab=terminal");
    const continueChat = pageState.slice(
      pageState.indexOf("handleContinueInChat"),
      pageState.indexOf("handleOpenRunSurface"),
    );
    expect(continueChat).toContain("setStandaloneChatRunGuid");
    expect(continueChat).toContain("openDraftTab");
  });

  test("create/list/edit flip automationView in one query write", () => {
    expect(pageState).toContain("automationsCreateQuery");
    expect(pageState).toContain("automationsListQuery");
    expect(pageState).toContain("automationsEditQuery");
    expect(pageState).toContain("automationsViewFromLocation");
    expect(pageState).not.toContain('void setPageView("create")');
  });

  test("stale prompt dismisses without changing status", () => {
    expect(banner).toContain("automation_run_stale_dismiss");
    expect(banner).toContain("automation_stale_prompt");
    expect(banner).toContain('t("dismiss")');
    expect(banner).not.toContain("toastManager");
    expect(chip).toContain('t("label")');
    expect(chip).not.toContain("uppercase");
  });

  test("S4 — unsupported headless agents stay disabled with unavailable_reason", () => {
    expect(setup).toContain("disabledReason: agent.automation_supported");
    expect(setup).toContain("agent.unavailable_reason");
    expect(setup).toContain('executeMode === "headless"');
    expect(setup).toContain("terminalAgentOptions");
    expect(form).toContain("shouldAutofillTerminalAgent");
    expect(form).toContain("shouldAutofillChatAgent");
    expect(form).toContain("isChatAgentSelected");
  });

  test("S26 — empty name blocks try-run before automation_run_now", () => {
    expect(form).toContain("displayName.trim().length > 0");
    expect(setup).toContain("if (!formValid || !githubTriggerValid || submitting)");
    expect(setup).toContain("const saved = await saveAutomation()");
    expect(setup).toContain("if (!saved) return;");
    expect(setup).toContain("onRunNow(saved.guid)");
  });

  test("S20/S21 — sidebar and tab marks use sentence-case Automation chip", () => {
    expect(tabMark).toContain("AutomationChip");
    expect(tabMark).toContain("resolveAutomationTabMark");
    expect(tabMark).not.toContain("surface_scope_id === contextId");
    expect(tabBar).toContain("AutomationTabMark");
    const extraTab = tabBar.slice(
      tabBar.indexOf("function TerminalExtraTab"),
      tabBar.indexOf("const PLUS_MENU_TAB_EASE"),
    );
    expect(extraTab.indexOf("displayTitle")).toBeLessThan(extraTab.indexOf("AutomationTabMark"));
    const specialTab = tabBar.slice(tabBar.indexOf("function SpecialTerminalTab"));
    expect(specialTab.indexOf("{label}</span>")).toBeLessThan(specialTab.indexOf("{mark}"));
    expect(tabBar).toContain('kind: "terminal"');
    expect(tabBar).toContain('kind: "chat"');
    expect(projectItem).toContain("isStandaloneGroup");
    expect(projectItem).toContain("<Timer className=\"size-3.5\" />");
    expect(projectItem).toContain("!isStandaloneGroup && (onAddProjectToGroup");
    expect(projectItem).not.toContain("AutomationChip");
    expect(groupedProjectRow).toContain("isStandaloneGroup");
    expect(groupedProjectRow).toContain("<Timer className=\"size-3\" />");
    expect(groupedProjectRow).toContain("if (isStandaloneGroup) return");
    expect(workspaceContent).toContain("AutomationChip");
    expect(workspaceContent).toContain("<AutomationChip compact className=\"group-hover/ws:hidden\" />");
    const workspaceTitleRow = workspaceContent.slice(
      workspaceContent.indexOf("{/* Title takes remaining width"),
      workspaceContent.indexOf("{/* Trailing slot stays in flow"),
    );
    expect(workspaceTitleRow).not.toContain("AutomationChip");
    expect(workspaceKanbanCard).toContain("<AutomationChip compact");
    expect(workspaceContent).toContain("standaloneJobHref");
    expect(chip).not.toContain("uppercase");
    expect(chip).not.toContain("AUTOMATION");
  });

  test("S22 — Overview omits git/PR/code-review widgets on standalone jobs", () => {
    expect(overviewTab).toContain("shouldShowOverviewGitWidgets");
    expect(overviewTab).toContain("const hideGitChrome = !shouldShowOverviewGitWidgets(contextId)");
    expect(overviewTab).toContain("enabled: active && !hideGitChrome");
    expect(overviewTab).toContain("{hideGitChrome ? null : (");
    expect(overviewTab).toContain("t('codeReviews.title')");
    expect(overviewTab).toContain("t('pullRequests.title')");
    expect(overviewTab).toContain("t('actionsSection.title')");
    const codeReviewsBlock = overviewTab.slice(
      overviewTab.lastIndexOf("hideGitChrome ? null", overviewTab.indexOf("t('codeReviews.title')")),
      overviewTab.indexOf("t('codeReviews.title')"),
    );
    expect(codeReviewsBlock).toContain("hideGitChrome ? null");
    const pullRequestsBlock = overviewTab.slice(
      overviewTab.lastIndexOf("hideGitChrome ? null", overviewTab.indexOf("t('pullRequests.title')")),
      overviewTab.indexOf("t('pullRequests.title')"),
    );
    expect(pullRequestsBlock).toContain("hideGitChrome ? null");
    expect(centerStage).toContain("!hideStandaloneGitChrome && namedCodeReviewTabVisible");
    expect(centerStage).toContain("hideGitChrome: hideStandaloneGitChrome");
    expect(centerStage).toContain("waitingForTerminalTab");
    expect(centerStage).toContain("if (terminalTmux?.trim()) return;");
    expect(centerStage).toContain("ensureFixedTerminalTab");
    expect(centerStage).toContain(
      "existingTabs.length === 0\n        ? ensureFixedTerminalTab(contextId)",
    );
    expect(header).toContain("hideStandaloneGitChrome");
    expect(tabBar).toContain("hideGitChrome");
  });
});
