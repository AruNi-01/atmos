import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_FOOTER_HEIGHT_PX,
  APP_HEADER_HEIGHT_CLASS,
  APP_HEADER_HEIGHT_PX,
  APP_SHELL_CENTER_COLUMN_ATTR,
  APP_SHELL_PANEL_LAYOUT_ATTR,
  CENTER_STAGE_CARD_CLASS,
  CENTER_STAGE_CARD_CLIP_CLASS,
  CENTER_STAGE_GUTTER_CLASS,
  CENTER_STAGE_GUTTER_X_PX,
  CENTER_STAGE_GUTTER_Y_PX,
  LEFT_SIDEBAR_DIVIDER_GUTTER_MR_CLASS,
  LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS,
  LEFT_SIDEBAR_DIVIDER_GUTTER_PX,
  CENTER_STAGE_RADIUS_CLASS,
  CENTER_STAGE_RADIUS_CSS,
  RESIZE_HAIRLINE_CORNER_INSET_CSS,
  ROOT_RESIZE_HAIRLINE_BOTTOM_CSS,
  ROOT_RESIZE_HAIRLINE_TOP_CSS,
  SIDEBAR_PEEK_CONTENT_PT_CLASS,
  SIDEBAR_PEEK_INSET_BOTTOM_PX,
  SIDEBAR_PEEK_INSET_TOP_PX,
} from "@/app-shell/sidebar-layout-constants";

function read(rel: string) {
  return readFileSync(join(import.meta.dir, rel), "utf8");
}

describe("center-stage chrome", () => {
  test("shared card uses the center-stage radius token", () => {
    expect(CENTER_STAGE_RADIUS_CLASS).toBe("rounded-xl");
    expect(CENTER_STAGE_RADIUS_CSS).toBe("var(--radius-xl)");
    expect(CENTER_STAGE_CARD_CLASS).toContain(CENTER_STAGE_RADIUS_CLASS);
    expect(CENTER_STAGE_CARD_CLASS).toContain("ring-1");
    expect(CENTER_STAGE_CARD_CLASS).toContain("desktop-no-drag");
    // Ring and overflow-hidden must not share a node — that double-paints
    // the rounded left edge in light mode as stacked shadow lines.
    expect(CENTER_STAGE_CARD_CLASS).not.toContain("overflow-hidden");
    expect(CENTER_STAGE_CARD_CLIP_CLASS).toContain("overflow-hidden");
    expect(CENTER_STAGE_CARD_CLIP_CLASS).toContain("rounded-[inherit]");
  });

  test("launchpad overlay keeps a previously mounted workspace instead of unmounting it", () => {
    const stage = read("../CenterStage.tsx");
    expect(stage).toContain("keepAliveCenterContextId");
    expect(stage).toContain("isLaunchpadCenter");
    expect(stage).toContain("data-launchpad-center-overlay");
    expect(stage).toContain("CenterStageNoContextView");
    // Cold launchpad (no prior workspace) still early-returns. A warm workspace
    // must fall through so Terminal grids stay mounted under the overlay.
    expect(stage).toContain("if (!paintContextId)");
    expect(stage).not.toContain("if (!liveHostContextId || !paintContextId)");

    const support = read("../center-stage-support.tsx");
    expect(support).toContain("shouldPromoteWorkspaceSurface");
  });

  test("every no-context center view goes through CenterStageSurface", () => {
    const support = read("../center-stage-support.tsx");
    expect(support).toContain("CenterStageSurface");
    expect(support).toContain("<WorkspacesManagementView />");
    expect(support).toContain("<SkillsView />");
    expect(support).toContain("<TerminalsView />");
    expect(support).toContain("<AgentManagerView />");
    expect(support).toContain("<AutomationPage />");
    expect(support).toContain("<DiskAnalyzerPage />");
    expect(support).toContain("<TokenUsagePage />");
    expect(support).toContain("<TaskManagementView />");
    expect(support).toContain("<HostedWelcomeGate");
    expect(support).toContain("<PtDesignStandaloneStage />");
    expect(support).not.toContain('className="h-full overflow-hidden"');
  });

  test("center panel surfaces defer until after tab chrome paints", () => {
    const stage = read("../CenterStage.tsx");
    expect(stage).toContain("useDeferredValue");
    const panels = read("../CenterStagePanels.tsx");
    expect(panels).toContain("resolveWorkspaceFrameLiveBinding");
    expect(panels).toContain("lastLiveGeometryRef");
    expect(panels).toContain("paneSlotBoxCache");
    expect(stage).toContain("paneSlotBoxCache");
    expect(stage).toContain("panelActiveValue");
    expect(stage).toContain("activeValue={panelActiveValue}");
    expect(stage).toContain("activeTabIds={panelActiveTabIds}");
    expect(stage).toContain("paneActiveTabById={panelPaneActiveTabById}");
    expect(stage).toContain("activeValue={opts?.activeTabId ?? activeValue}");

    const frame = read("../workspace-center-frame.tsx");
    expect(frame).toContain("DiscardableHeavySurface");
    expect(frame).toContain("keptGithubTabValuesRef");
    expect(frame).toContain("githubKeepAlivePanelClass");
    expect(frame).toContain('retainSurface("run"');
    expect(frame).toContain('retainSurface("github"');
    expect(frame).toContain('retainSurface("files"');
    expect(frame).toContain('retainSurface("changes"');
    expect(frame).toContain("GithubKeptSurface");
    expect(frame).toContain("<KeptRunScript");
    const githubKept = frame.slice(
      frame.indexOf("<GithubKeptSurface"),
      frame.indexOf("</GithubKeptSurface>"),
    );
    expect(githubKept).toContain("active={isActiveContext}");
    expect(githubKept).not.toContain("paneVisible");
    expect(frame).toContain("isActive={isActiveContext}");
    expect(frame).toContain("surfaceActive={isActiveContext}");
    expect(frame).toContain("function KeepAliveFileViewer");
    expect(frame).toContain("<KeepAliveFileViewer");
    expect(frame).toContain("visible={visible}");
    expect(frame).toContain("requestAnimationFrame");
    expect(frame).toContain("revealEnabled={isActiveContext}");
    expect(frame).toContain("CenterExplorerSidecar");
    expect(frame).toContain("CenterExplorerLanding");
    expect(frame).toContain('kind="files"');
    expect(frame).toContain('kind="changes"');
    expect(frame).toContain("showFilesExplorerToggle");
    expect(frame).toContain("showChangesExplorerToggle");
    expect(frame).not.toMatch(/isActive=\{\s*\n\s*isActiveContext &&/);
    expect(frame).not.toMatch(/surfaceActive=\{\s*\n\s*isActiveContext &&/);
    expect(frame).not.toMatch(/revealEnabled=\{\s*\n\s*isActiveContext &&/);
  });

  test("overlay-hosted Overview can scroll past the fold", () => {
    const frame = read("../workspace-center-frame.tsx");
    const visibleBox = frame.slice(
      frame.indexOf("width: box.width,"),
      frame.indexOf("function hostPaneIdsForTab"),
    );
    expect(visibleBox).toContain("borderBottomLeftRadius");
    expect(visibleBox).not.toMatch(/overflow:\s*"hidden"/);

    const overview = read("../../features/workspace/components/OverviewTab.tsx");
    const root = overview.match(
      /return \(\s*<>\s*<div className="([^"]+)"/,
    )?.[1];
    expect(root).toContain("overflow-y-auto");
    expect(root).toContain("min-h-0");
    expect(root).toContain("flex-1");
  });

  test("workspace and setup surfaces reuse the shared card class", () => {
    const stage = read("../CenterStage.tsx");
    expect(stage).toContain("CenterStageSurface");
    expect(stage).toContain("CENTER_STAGE_SHELL_CLASS");
    expect(stage).toContain('data-center-stage-card=""');
    const chrome = read("../center-stage-chrome.tsx");
    expect(chrome).toContain("CENTER_STAGE_CARD_CLASS");
    expect(chrome).toContain("CENTER_STAGE_CARD_CLIP_CLASS");
  });

  test("center-stage card chrome is tagged for drawer insets", () => {
    const chrome = read("../center-stage-chrome.tsx");
    expect(chrome).toContain('data-center-stage-card=""');

    const shell = read("../AppShellMain.tsx");
    expect(shell).toContain("data-center-stage-body");
    expect(shell).toContain('data-app-shell-center-column=""');
    expect(shell).toContain("<Footer />");

    const layout = read("../PanelLayout.tsx");
    expect(APP_SHELL_PANEL_LAYOUT_ATTR).toBe("data-app-shell-panel-layout");
    expect(APP_SHELL_CENTER_COLUMN_ATTR).toBe("data-app-shell-center-column");
    expect(layout).toContain('data-app-shell-panel-layout=""');
  });

  test("floating card gutters stay tight to header, footer, and sidebar", () => {
    expect(CENTER_STAGE_GUTTER_X_PX).toBe(4);
    expect(CENTER_STAGE_GUTTER_Y_PX).toBe(1);
    expect(CENTER_STAGE_GUTTER_CLASS).toBe("px-1 py-px");
    expect(LEFT_SIDEBAR_DIVIDER_GUTTER_PX).toBe(CENTER_STAGE_GUTTER_X_PX);
    expect(LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS).toBe("pr-1");
    expect(LEFT_SIDEBAR_DIVIDER_GUTTER_MR_CLASS).toBe("mr-1");
  });

  test("left sidebar sits on the same divider gutter as the center card", () => {
    const launchpad = read("../LeftSidebarLaunchpad.tsx");
    expect(launchpad).toContain("LEFT_SIDEBAR_DIVIDER_GUTTER_MR_CLASS");
    expect(launchpad).toContain("LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS");
    expect(launchpad).not.toContain("mx-2.5 mb-1.5");

    const projectItem = read("../sidebar/ProjectItem.tsx");
    expect(projectItem).toContain("LEFT_SIDEBAR_DIVIDER_GUTTER_MR_CLASS");
    expect(projectItem).toContain("LEFT_SIDEBAR_DIVIDER_GUTTER_PR_CLASS");
  });

  test("resize hairlines stop short of rounded-xl corners and the footer", () => {
    expect(RESIZE_HAIRLINE_CORNER_INSET_CSS).toBe(CENTER_STAGE_RADIUS_CSS);
    expect(ROOT_RESIZE_HAIRLINE_TOP_CSS).toContain(`${CENTER_STAGE_GUTTER_Y_PX}px`);
    expect(ROOT_RESIZE_HAIRLINE_TOP_CSS).toContain(CENTER_STAGE_RADIUS_CSS);
    expect(ROOT_RESIZE_HAIRLINE_BOTTOM_CSS).toContain(`${APP_FOOTER_HEIGHT_PX}px`);
    expect(ROOT_RESIZE_HAIRLINE_BOTTOM_CSS).toContain(`${CENTER_STAGE_GUTTER_Y_PX}px`);
    expect(ROOT_RESIZE_HAIRLINE_BOTTOM_CSS).toContain(CENTER_STAGE_RADIUS_CSS);

    const layout = read("../PanelLayout.tsx");
    expect(layout).toContain('data-resize-hairline="root"');
    expect(layout).toContain("ROOT_RESIZE_HAIRLINE_TOP_CSS");
    expect(layout).toContain("ROOT_RESIZE_HAIRLINE_BOTTOM_CSS");
    expect(layout).not.toContain("hover:bg-border/50 group touch-none");

    const grid = read("../center-pane/CenterPaneGrid.tsx");
    expect(grid).not.toContain("flex-col overflow-hidden bg-background ring-1");
    expect(grid).toContain("flex-col bg-background ring-1");
    expect(grid).toContain('data-resize-hairline={orientation}');
    expect(grid).toContain("RESIZE_HAIRLINE_CORNER_INSET_CSS");
    expect(grid).toContain("group-hover:bg-border/50");
    expect(grid).toContain("center-pane-dock-preview");
    expect(grid).toContain("center-pane-drag-ghost");
    expect(grid).toContain("onTreeChange");
    expect(grid).toContain("useLiveSplitLayout");
    expect(grid).toContain("commitLiveResize");
  });

  test("collapsed sidebar peek stays in the center band, not header or footer", () => {
    expect(APP_HEADER_HEIGHT_CLASS).toBe("h-12");
    expect(APP_HEADER_HEIGHT_PX).toBe(48);
    expect(SIDEBAR_PEEK_INSET_TOP_PX).toBe(
      APP_HEADER_HEIGHT_PX + CENTER_STAGE_GUTTER_Y_PX,
    );
    expect(SIDEBAR_PEEK_INSET_BOTTOM_PX).toBe(
      APP_FOOTER_HEIGHT_PX + CENTER_STAGE_GUTTER_Y_PX,
    );

    expect(SIDEBAR_PEEK_CONTENT_PT_CLASS).toBe("pt-2.5");

    const peek = read("../SidebarPeekShell.tsx");
    expect(peek).toContain("SIDEBAR_PEEK_INSET_TOP_PX");
    expect(peek).toContain("SIDEBAR_PEEK_INSET_BOTTOM_PX");
    expect(peek).toContain("SIDEBAR_PEEK_CONTENT_PT_CLASS");
    expect(peek).not.toContain("inset-y-0");
    expect(peek).not.toContain("top-12 bottom-6");

    const header = read("../Header.tsx");
    expect(header).toContain("APP_HEADER_HEIGHT_CLASS");
    expect(header).not.toContain('"relative flex h-12 items-center');
  });

  test("standalone Prototype Design does not apply a second card chrome", () => {
    const standalone = read("../../features/pt-design/PtDesignStandaloneStage.tsx");
    expect(standalone).toContain("PtDesignCenterPanel");
    expect(standalone).not.toContain("CENTER_STAGE_GUTTER_CLASS");
    expect(standalone).not.toContain("rounded-xl");
  });
});
