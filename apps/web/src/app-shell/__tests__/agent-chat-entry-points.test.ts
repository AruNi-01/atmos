import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

describe("S2 Agent Chat entry points", () => {
  it("plus menu and empty launcher can start Chat; ⌘N stays New Workspace", () => {
    const tabBar = readFileSync(join(ROOT, "CenterStageTabBar.tsx"), "utf8");
    expect(tabBar).toContain("onCreateAgentChat");
    expect(tabBar.indexOf("id=\"create-terminal\"")).toBeLessThan(
      tabBar.indexOf("id=\"create-agent-chat\""),
    );
    expect(tabBar).toContain("id=\"create-agent-chat\"");
    expect(tabBar).toContain('tab.kind === "agent-chat"');

    const empty = readFileSync(join(ROOT, "center-pane/CenterPaneEmptyState.tsx"), "utf8");
    expect(empty).toContain("onCreateAgentChat");
    expect(empty).toContain('id: "agent-chat"');

    const sidebar = readFileSync(join(ROOT, "LeftSidebar.tsx"), "utf8");
    expect(sidebar).toContain("⌘N");
    expect(sidebar).toContain("newWorkspace");
    expect(sidebar).not.toContain("dedicated New Chat hotkey");

    const welcome = readFileSync(join(ROOT, "NewWorkspaceWelcomeOverlay.tsx"), "utf8");
    expect(welcome).toContain("onStartAgentChat");

    const footer = readFileSync(join(ROOT, "Footer.tsx"), "utf8");
    expect(footer).toContain("useAgentChatUrl");
    expect(footer).toContain("setAgentChatOpen(true)");
    expect(footer).not.toContain('router.push("/agent-chat")');

    const modal = readFileSync(
      join(ROOT, "../features/agent/components/ModalAgentChatPanel.tsx"),
      "utf8",
    );
    expect(modal).toContain('variant="modal"');
    expect(modal).toContain("useAgentChatUrl");
    expect(modal).toContain("FOOTER_MODAL_CHAT_INSTANCE_KEY");
    expect(modal).toContain("effectiveContextId: null");

    const session = readFileSync(
      join(ROOT, "../features/agent/hooks/use-agent-chat-session.ts"),
      "utf8",
    );
    expect(session).toContain("cwd: cwd || null");
    expect(session).toContain("workspace_id: workspaceId");
    expect(session).toContain("project_id: projectId");
    expect(session).toContain("spaceIdForChatCreate");

    const centerStage = readFileSync(join(ROOT, "CenterStage.tsx"), "utf8");
    expect(centerStage).toContain("openDraftTab");
    expect(centerStage).not.toContain("agentChatApi.create");
    expect(centerStage).toContain("agentChatTabs");
    expect(centerStage).toContain('tab.kind === "agent-chat"');

    const tabGroups = readFileSync(join(ROOT, "use-center-stage-tab-groups.ts"), "utf8");
    expect(tabGroups).toContain("collectAgentChatGroupTabs");
    expect(tabGroups).toContain('key: "chat"');
    expect(tabGroups).toContain("groups.chat");

    const groupContent = readFileSync(join(ROOT, "center-stage-shared-tabs.tsx"), "utf8");
    expect(groupContent).toContain('tab.kind === "agent-chat"');
    expect(groupContent).toContain("AgentChatTabStatusIndicator");

    const workspaceFrame = readFileSync(join(ROOT, "workspace-center-frame.tsx"), "utf8");
    expect(workspaceFrame).toContain('variant="center"');
    expect(workspaceFrame).toContain("instanceKey={tab.value}");
    expect(workspaceFrame).toContain("paintContextId={contextId}");

    const panel = readFileSync(
      join(ROOT, "../features/agent/components/AgentChatPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain('variant === "center"');
    expect(panel).toContain("flex h-full min-h-0 min-w-0 w-full flex-1 flex-col");
    expect(panel).toContain("isEmbeddedPausedForStandalone");
    expect(panel).toContain('variant !== "standalone" && isStandaloneChatOpen');
    expect(panel).toContain('data-agent-chat-standalone-paused="true"');
    expect(panel).toContain("header.standaloneWindow.returnHere");
    expect(panel).toContain("border-dashed");
    expect(panel).toContain("if (!active || (variant === \"modal\" && !layoutLoaded)) return null");
    expect(panel).not.toContain("if (!session.isPanelOpen || (variant === \"modal\" && !layoutLoaded)) return null");
    expect(panel).toContain("instanceKey || liveChatId || chatId || null");
    expect(panel).toContain("onPointerEnter={ackVisibleChatAttention}");
    expect(panel).toContain("onPointerDown={ackVisibleChatAttention}");
    expect(panel).toContain("ackAgentChatAttention(liveChatId || chatId)");

    const activate = readFileSync(join(ROOT, "center-stage-activate.ts"), "utf8");
    expect(activate).toContain("isAgentChatTabValue");
    expect(activate).toContain("openTab({ contextId, chatId })");
    expect(activate).toContain("notifyPaneFocused(`chat:${chatId}`");

    expect(tabBar).toContain("max-w-[180px] truncate whitespace-nowrap");
    expect(tabBar).not.toContain("truncate text-pretty");

    const header = readFileSync(
      join(ROOT, "../features/agent/components/AgentChatHeader.tsx"),
      "utf8",
    );
    expect(header).toContain("constrainWidth && \"mx-auto w-full max-w-3xl\"");
    expect(header).toContain("truncate text-sm font-medium");
    expect(header).toContain("flex min-w-0 flex-col gap-1");
    expect(header).not.toContain("displayedAgentName");
    expect(header).not.toContain("AgentIcon");
    expect(panel).toContain("{variant !== \"center\" ? (");
    expect(panel).not.toContain("hideCwdChip");
  });
});
