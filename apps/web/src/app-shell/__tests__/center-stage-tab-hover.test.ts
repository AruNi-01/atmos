import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shared = readFileSync(
  join(import.meta.dir, "../center-stage-shared-tabs.tsx"),
  "utf8",
);
const tabBar = readFileSync(
  join(import.meta.dir, "../CenterStageTabBar.tsx"),
  "utf8",
);

describe("center stage tab hover", () => {
  it("uses the tasks-page motion pill tabs without a bottom divider", () => {
    expect(shared).toContain('@workspace/ui/components/motion/tabs');
    expect(shared).toContain('variant="pill"');
    expect(shared).toContain("flex h-8 w-full min-w-0 justify-start gap-0.5 overflow-hidden bg-background p-0.5");
    expect(shared).toContain("group h-7 shrink-0 gap-1.5 px-1.5 text-xs");
    expect(shared).toContain("aria-selected:!text-foreground");
    expect(shared).toContain('CENTER_STAGE_TAB_INDICATOR_CLASS = "bg-active"');
    expect(shared).not.toContain("border-b border-sidebar-border");
    expect(shared).not.toContain("variant=\"underline\"");
    expect(shared).toContain("{children}");
    expect(shared).toContain("{actions}");
  });

  it("keeps trailing chrome inside the pill track", () => {
    const listBlock = shared.slice(
      shared.indexOf("<MotionTabsList"),
      shared.indexOf("</MotionTabsList>"),
    );
    expect(listBlock).toContain("{actions}");
  });

  it("uses Atmos surfaces instead of the motion-tabs card/primary fill", () => {
    expect(shared).toContain("bg-background");
    expect(shared).toContain('CENTER_STAGE_TAB_INDICATOR_CLASS = "bg-active"');
    expect(shared).not.toContain("aria-selected:[&_img]:![filter:brightness(0)_invert(1)]");
  });

  it("keeps wiki, terminal, and new-tab chrome on the shared pill trigger", () => {
    expect(tabBar).toContain("CenterStageTab");
    expect(tabBar).not.toContain("hover:bg-muted/50");
    expect(tabBar).not.toContain("transition-colors hover:bg-muted");
  });

  it("replaces the leading icon with close on hover instead of a trailing control", () => {
    expect(shared).toContain("export function CenterStageTabIconSlot");
    expect(shared).toContain("group-hover:invisible");
    expect(shared).toContain("group-hover:pointer-events-auto");
    expect(shared).toContain("onHoverAction");
    expect(tabBar).toContain("CenterStageTabIconSlot");
    expect(tabBar).not.toContain("CreateTerminalTabButton");
    expect(tabBar).not.toContain("backdrop-blur-[4px]");
  });

  it("opens the layouts submenu with the shared popover animation", () => {
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function CenterStageNewTabMenu"),
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    expect(menuBlock).toContain("<Popover modal={false} open={layoutsSubOpen}");
    expect(menuBlock).toContain('side="left"');
    expect(menuBlock).toContain("data-center-stage-layouts-menu");
    expect(menuBlock).not.toContain("right-full");
    expect(menuBlock).not.toContain("overflow-visible");
  });

  it("keeps plus-menu tab clicks on the popover instead of the terminal toolbar", () => {
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function isCenterStagePlusMenuEventTarget"),
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    expect(menuBlock).toContain("function isCenterStagePlusMenuEventTarget");
    expect(menuBlock).toContain("markCenterStagePlusMenuOpen");
    expect(menuBlock).toContain('data-center-stage-plus-menu=""');
    expect(menuBlock).toContain('data-center-stage-plus-trigger=""');
    expect(menuBlock).toContain("isCenterStagePlusMenuEventTarget(next)");
    expect(menuBlock).toContain("isCenterStagePlusMenuEventTarget(event.target)");
    expect(menuBlock).toContain("onPointerDown={(event) => event.stopPropagation()}");
    expect(menuBlock).toContain('className="z-[90] w-48 overflow-hidden border-border/70');
    expect(menuBlock).toContain("z-[110]");
    expect(menuBlock).toContain("modal={false}");
    expect(menuBlock).toContain("onInteractOutside");
    expect(menuBlock).toContain('data-center-stage-plus-menu-open');

    const terminalGridCss = readFileSync(
      join(import.meta.dir, "../../features/terminal/components/terminal-grid.css"),
      "utf8",
    );
    expect(terminalGridCss).toContain(
      'body:has([data-center-stage-plus-menu][data-state="open"]) [data-center-panel-host]',
    );
    expect(terminalGridCss).toContain(
      'body:has([data-center-stage-plus-menu][data-state="open"]) [data-center-panel-host] *',
    );
    expect(terminalGridCss).toContain(
      "html[data-center-stage-plus-menu-open] [data-center-panel-host]",
    );
    expect(terminalGridCss).toContain(
      "html[data-center-stage-plus-menu-open] .terminal-grid-container[data-maximized-id] .terminal-pane.is-maximized",
    );
    expect(terminalGridCss).toContain("[data-center-stage-plus-menu],");
    expect(terminalGridCss).toContain("[data-center-stage-layouts-menu]");
    expect(terminalGridCss).toContain("pointer-events: none !important;");
    expect(terminalGridCss).toContain("pointer-events: auto !important;");
  });

  it("splits the plus menu into click-switch pill tabs that fill the popover", () => {
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function CenterStageNewTabMenu"),
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    expect(tabBar).toContain('@workspace/ui/components/motion/tabs');
    expect(menuBlock).toContain('variant="pill"');
    expect(menuBlock).toContain('className="flex h-8 w-full min-w-0 gap-0.5 bg-muted p-0.5"');
    expect(menuBlock).toContain('onValueChange={(value) => {');
    const tabList = menuBlock.slice(
      menuBlock.indexOf("<MotionTabsList"),
      menuBlock.indexOf("</MotionTabsList>"),
    );
    expect(tabList).not.toContain("onMouseEnter");
    expect(tabList).not.toContain("setPlusTab");
    expect(menuBlock).toContain('value="tabs"');
    expect(menuBlock).toContain('value="layout"');
    expect(menuBlock).toContain("plusMenuTabsLabel");
    expect(menuBlock).toContain("plusMenuLayoutLabel");
  });

  it("animates plus-menu popover height when switching tabs", () => {
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function PlusMenuTabPanels"),
      tabBar.indexOf("function CenterStageNewTabMenu"),
    );
    expect(menuBlock).toContain("ResizeObserver");
    expect(menuBlock).toContain("animate={reduce || height === \"auto\" ? undefined : { height }}");
    expect(menuBlock).toContain("overflow-hidden");
    expect(menuBlock).toContain("scale: tab === \"tabs\" ? 1 : 0.96");
    expect(tabBar).toContain("w-48 overflow-hidden border-border/70");
  });
});
