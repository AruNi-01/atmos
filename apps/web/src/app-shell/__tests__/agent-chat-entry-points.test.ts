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

    const empty = readFileSync(join(ROOT, "center-pane/CenterPaneEmptyState.tsx"), "utf8");
    expect(empty).toContain("onCreateAgentChat");
    expect(empty).toContain('id: "agent-chat"');

    const sidebar = readFileSync(join(ROOT, "LeftSidebar.tsx"), "utf8");
    expect(sidebar).toContain("⌘N");
    expect(sidebar).toContain("newWorkspace");
    expect(sidebar).not.toContain("dedicated New Chat hotkey");

    const welcome = readFileSync(join(ROOT, "NewWorkspaceWelcomeOverlay.tsx"), "utf8");
    expect(welcome).toContain("onStartAgentChat");

    const session = readFileSync(
      join(ROOT, "../features/agent/hooks/use-conversation-chat-session.ts"),
      "utf8",
    );
    expect(session).toContain("cwd: cwd || null");
    expect(session).toContain("workspace_id: workspaceId");
    expect(session).toContain("project_id: projectId");

    const centerStage = readFileSync(join(ROOT, "CenterStage.tsx"), "utf8");
    expect(centerStage).toContain("openDraftTab");
    expect(centerStage).not.toContain("conversationApi.create");

    const workspaceFrame = readFileSync(join(ROOT, "workspace-center-frame.tsx"), "utf8");
    expect(workspaceFrame).toContain('variant="center"');
    expect(workspaceFrame).toContain("instanceKey={tab.value}");

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
    expect(panel).toContain("instanceKey || liveConversationId || conversationId || null");

    const activate = readFileSync(join(ROOT, "center-stage-activate.ts"), "utf8");
    expect(activate).toContain("isAgentChatTabValue");

    expect(tabBar).toContain("max-w-[180px] truncate whitespace-nowrap");
    expect(tabBar).not.toContain("truncate text-pretty");

    const header = readFileSync(
      join(ROOT, "../features/agent/components/AgentChatHeader.tsx"),
      "utf8",
    );
    expect(header).toContain("constrainWidth && \"mx-auto w-full max-w-3xl\"");
  });
});
