import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_FOOTER_HEIGHT_PX,
  APP_SHELL_CENTER_COLUMN_ATTR,
  APP_SHELL_PANEL_LAYOUT_ATTR,
  CENTER_STAGE_CARD_CLASS,
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
} from "@/app-shell/sidebar-layout-constants";

function read(rel: string) {
  return readFileSync(join(import.meta.dir, rel), "utf8");
}

describe("center-stage chrome", () => {
  test("shared card uses the center-stage radius token", () => {
    expect(CENTER_STAGE_RADIUS_CLASS).toBe("rounded-xl");
    expect(CENTER_STAGE_RADIUS_CSS).toBe("var(--radius-xl)");
    expect(CENTER_STAGE_CARD_CLASS).toContain(CENTER_STAGE_RADIUS_CLASS);
    expect(CENTER_STAGE_CARD_CLASS).toContain("overflow-hidden");
    expect(CENTER_STAGE_CARD_CLASS).toContain("ring-1");
    expect(CENTER_STAGE_CARD_CLASS).toContain("desktop-no-drag");
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

  test("workspace and setup surfaces reuse the shared card class", () => {
    const stage = read("../CenterStage.tsx");
    expect(stage).toContain("CenterStageSurface");
    expect(stage).toContain("CENTER_STAGE_CARD_CLASS");
    expect(stage).toContain("CENTER_STAGE_SHELL_CLASS");
    expect(stage).toContain('data-center-stage-card=""');
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
    expect(grid).toContain('data-resize-hairline={orientation}');
    expect(grid).toContain("RESIZE_HAIRLINE_CORNER_INSET_CSS");
    expect(grid).toContain("group-hover:bg-border/50");
    expect(grid).toContain("center-pane-dock-preview");
    expect(grid).toContain("center-pane-drag-ghost");
    expect(grid).toContain("onTreeChange");
    expect(grid).toContain("useLiveSplitLayout");
    expect(grid).toContain("commitLiveResize");
  });

  test("standalone Prototype Design does not apply a second card chrome", () => {
    const standalone = read("../../features/pt-design/PtDesignStandaloneStage.tsx");
    expect(standalone).toContain("PtDesignCenterPanel");
    expect(standalone).not.toContain("CENTER_STAGE_GUTTER_CLASS");
    expect(standalone).not.toContain("rounded-xl");
  });
});
