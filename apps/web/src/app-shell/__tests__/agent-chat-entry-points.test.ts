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
  });
});
