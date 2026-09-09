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
  it("slides the pill with CSS transform instead of layoutId", () => {
    const motionTabs = readFileSync(
      join(import.meta.dir, "../../../../../packages/ui/src/components/motion/tabs.tsx"),
      "utf8",
    );
    expect(motionTabs).not.toContain("layoutId=");
    expect(motionTabs).toContain("translate3d");
    expect(motionTabs).toContain("scale(");
    expect(motionTabs).toContain("placeIndicator");
    expect(motionTabs).toContain("measureSelectedTab");
    expect(motionTabs).toContain('orientation = "horizontal"');
    expect(motionTabs).toContain("aria-orientation={orientation}");
    expect(motionTabs).toContain("ResizeObserver");
    expect(motionTabs).toContain("MutationObserver");
    expect(shared).toContain("indicatorClassName={CENTER_STAGE_TAB_INDICATOR_CLASS}");
  });

  it("supports a vertical pill strip for compact icon rails", () => {
    const listFn = shared.slice(
      shared.indexOf("export function CenterStageTabList"),
      shared.indexOf("export function CenterStageScrollableTabs"),
    );
    expect(listFn).toContain('orientation = "horizontal"');
    expect(listFn).toContain("orientation={orientation}");
    expect(listFn).toContain(
      '"flex h-full w-12 min-h-0 max-h-full flex-col justify-start overflow-hidden bg-background p-1"',
    );
    const scrollFn = shared.slice(
      shared.indexOf("export function CenterStageScrollableTabs"),
      shared.indexOf("export function CenterStageStickyTabActions"),
    );
    expect(scrollFn).toContain('orientation = "horizontal"');
    expect(scrollFn).toContain(
      '"flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar"',
    );
  });

  it("uses the tasks-page motion pill tabs without a bottom divider", () => {
    expect(shared).toContain('@workspace/ui/components/motion/tabs');
    expect(shared).toContain('variant="pill"');
    expect(shared).toContain("flex h-8 min-w-0 max-w-full justify-start overflow-hidden bg-background py-0.5 pl-0.5 pr-0");
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
    expect(listBlock).toContain("trailing={afterTabs}");
    expect(listBlock).toContain("{children}");
  });

  it("puts the plus after the last tab and pins it when the strip is full", () => {
    const listFn = shared.slice(
      shared.indexOf("export function CenterStageTabList"),
      shared.indexOf("export function CenterStageScrollableTabs"),
    );
    expect(listFn).toContain("afterTabs?: React.ReactNode");
    expect(listFn).toContain("trailing={afterTabs}");
    expect(listFn).toContain("{actions}");
    expect(listFn).toContain('"ml-auto flex shrink-0 items-center"');
    expect(listFn).toContain("flex-[0_1_auto]");
    expect(listFn).toContain("gap-0.5");
    expect(listFn.indexOf("trailing={afterTabs}")).toBeLessThan(listFn.indexOf("{actions}"));
    expect(shared).toContain(
      "flex min-w-0 flex-1 items-center overflow-x-auto no-scrollbar",
    );
    expect(tabBar).toContain("afterTabs={");
    expect(tabBar.indexOf("<CenterStageNewTabMenu")).toBeLessThan(
      tabBar.indexOf("<CenterStagePaneFullscreenButton"),
    );
  });

  it("drives the edge fade with CSS scroll timeline instead of React state", () => {
    const motionTabs = readFileSync(
      join(import.meta.dir, "../../../../../packages/ui/src/components/motion/tabs.tsx"),
      "utf8",
    );
    const fadeCss = readFileSync(
      join(import.meta.dir, "../../../../../packages/ui/src/components/motion/tabs.css"),
      "utf8",
    );
    expect(motionTabs).toContain('import "./tabs.css"');
    expect(motionTabs).toContain("data-center-tabs-track=");
    expect(motionTabs).toContain("data-center-tabs-edge-fade=");
    expect(motionTabs).not.toContain("setEdgeFade");
    expect(motionTabs).not.toContain("tabStripEdgeFadeOpacity");
    expect(motionTabs).not.toContain("fade.style.opacity");
    expect(fadeCss).toContain("scroll-timeline-name: --center-tabs-scroll");
    expect(fadeCss).toContain("animation-timeline: --center-tabs-scroll");
    expect(fadeCss).toContain("animation-range: calc(100% - 16px) 100%");
    expect(fadeCss).not.toContain("setState");
    expect(shared).toContain('data-center-tabs-scroll=""');
  });

  it("stacks trailing chrome above the sliding active pill", () => {
    const motionTabs = readFileSync(
      join(import.meta.dir, "../../../../../packages/ui/src/components/motion/tabs.tsx"),
      "utf8",
    );
    expect(motionTabs).toContain("trailing?: ReactNode");
    expect(motionTabs).toContain("data-center-tabs-edge-fade=");
    expect(motionTabs).not.toContain("setEdgeFade");
    expect(motionTabs).toContain("backdrop-blur-[4px]");
    expect(motionTabs).toContain('className={cn(listClassName, "gap-1")}');
    expect(motionTabs).toContain(
      '"relative z-0 flex min-h-0 min-w-0 flex-1 items-center gap-0.5 self-stretch overflow-hidden"',
    );
    expect(motionTabs).toContain(
      'className="relative z-20 flex shrink-0 items-center self-stretch"',
    );
    expect(shared).toContain(
      "pointer-events-auto relative isolate z-20 flex h-7 shrink-0 items-center gap-0.5 bg-background",
    );
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

  it("treats Overview as a labeled closable strip tab that can scroll away", () => {
    const overviewFn = shared.slice(
      shared.indexOf("export function CenterStageOverviewTab"),
      shared.indexOf("export function CenterStageFileIcon"),
    );
    expect(overviewFn).toContain("CenterStageTabIconSlot");
    expect(overviewFn).toContain("{label}");
    expect(overviewFn).toContain("onClose");
    expect(overviewFn).not.toContain("CENTER_STAGE_ICON_TAB_CLASS");

    const tabListJsx = tabBar.slice(
      tabBar.indexOf("<CenterStageTabList"),
      tabBar.indexOf("</CenterStageTabList>"),
    );
    expect(tabListJsx).toContain("data-center-tabs-scroll");
    expect(tabListJsx).toContain("{renderDescriptorTab(tab)}");
    expect(tabListJsx).not.toContain("<CenterStageOverviewTab");
    expect(tabBar).toContain('if (tab.kind === "overview")');
    expect(tabBar).toContain("handleCloseOverview");
    expect(tabBar).toContain('disabled={tab.kind === "overview"}');
    expect(tabBar).toContain("pinOverviewFront");
  });

  it("opens the layouts submenu with the shared popover animation", () => {
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function CenterStageNewTabMenu"),
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    expect(menuBlock).toContain("<Popover modal={false} open={layoutsSubOpen}");
    expect(menuBlock).toContain('side="right"');
    expect(menuBlock).toContain("data-center-stage-layouts-menu");
    expect(menuBlock).not.toContain("right-full");
    expect(menuBlock).not.toContain("overflow-visible");
  });

  it("keeps plus-menu tab clicks on the popover instead of the terminal toolbar", () => {
    const menuBlock = tabBar.slice(
      tabBar.indexOf("function CenterStageNewTabMenu"),
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    const pointer = readFileSync(
      join(import.meta.dir, "../center-stage-plus-menu-pointer.ts"),
      "utf8",
    );
    expect(pointer).toContain("function stealPlusMenuClickFromOverlay");
    expect(pointer).toContain("function hitPlusMenuControl");
    expect(pointer).toContain("function syncPlusMenuHover");
    expect(pointer).toContain("function muteCenterOverlayHits");
    expect(pointer).toContain("window.addEventListener(\"pointermove\", onPointerMove, true)");
    expect(pointer).toContain("window.addEventListener(\"pointerdown\", onPointerDown, true)");
    expect(pointer).toContain("window.addEventListener(\"mousedown\", onMouseDown, true)");
    expect(pointer).toContain("markCenterStagePlusMenuOpen");
    expect(menuBlock).toContain("useCenterStagePlusMenuOverlayGuard(open");
    expect(menuBlock).toContain("onPointerOverChrome: clearCloseTimer");
    expect(menuBlock).toContain("onPointerLeaveChrome: scheduleClose");
    expect(menuBlock).toContain("shouldRetainPlusMenuForOutsidePointer");
    expect(menuBlock).toContain("shouldSchedulePlusMenuClose");
    expect(menuBlock).toContain('data-center-stage-plus-menu=""');
    expect(menuBlock).toContain('data-center-stage-plus-trigger=""');
    expect(tabBar).toContain('data-plus-menu-layer={tab === "tabs" ? "active" : "inactive"}');
    expect(menuBlock).toContain("isCenterStagePlusMenuEventTarget(next)");
    expect(menuBlock).toContain("onPointerDown={(event) => event.stopPropagation()}");
    expect(menuBlock).toContain('className="z-[2147483646] w-48 overflow-hidden border-border/70');
    expect(menuBlock).toContain("z-[2147483647]");
    expect(menuBlock).toContain("modal={false}");
    expect(menuBlock).toContain('align="start"');
    expect(menuBlock).toContain("collisionPadding={8}");
    expect(menuBlock).not.toContain("avoidCollisions={false}");
    expect(menuBlock).toContain("onInteractOutside");
    expect(menuBlock).toContain("xterm keeps focus while this menu is hover-open");
    expect(tabBar).toContain('hidden={tab !== "tabs" ? true : undefined}');
    expect(tabBar).not.toContain("[&_*]:pointer-events-none");

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
    expect(terminalGridCss).toContain("html[data-center-stage-plus-menu-open] canvas");
    expect(terminalGridCss).not.toContain(
      "[data-center-stage-plus-menu] * {\n  pointer-events: auto !important;",
    );
    expect(terminalGridCss).toContain("[data-plus-menu-hot]");
    expect(terminalGridCss).toContain("pointer-events: none !important;");

    const globalsCss = readFileSync(
      join(import.meta.dir, "../../app/globals.css"),
      "utf8",
    );
    expect(globalsCss).toContain("html[data-center-stage-plus-menu-open] canvas");
    expect(globalsCss).toContain("html[data-center-stage-plus-menu-open] webview");
    expect(globalsCss).toContain(
      "[data-radix-popper-content-wrapper]:has([data-center-stage-plus-menu])",
    );
    expect(globalsCss).toContain(
      '[data-center-stage-plus-menu] [data-plus-menu-hot]:not([aria-selected="true"])',
    );
    expect(terminalGridCss).toContain(
      '[data-center-stage-plus-menu] [data-plus-menu-hot]:not([aria-selected="true"])',
    );
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
    expect(menuBlock).toContain("onCreateOverview");
    expect(menuBlock).toContain("overviewAlreadyOpen");
    expect(menuBlock.indexOf("LayoutDashboard")).toBeLessThan(menuBlock.indexOf("TerminalIcon"));
    expect(menuBlock.indexOf("{overviewLabel}")).toBeLessThan(menuBlock.indexOf("{terminalLabel}"));
    expect(menuBlock).toContain("onCreateMarkdownNote");
    expect(menuBlock).toContain("FileText");
    expect(menuBlock.indexOf("{terminalLabel}")).toBeLessThan(menuBlock.indexOf("{agentChatLabel}"));
    expect(menuBlock.indexOf("{agentChatLabel}")).toBeLessThan(menuBlock.indexOf("{markdownLabel}"));
  });

  it("puts TUI and Chat UI kind chips in tab tooltips, not on the pills", () => {
    const tabs = readFileSync(
      join(import.meta.dir, "../center-stage-tab-tooltip.tsx"),
      "utf8",
    );
    expect(tabs).toContain("export function CenterStageTabKindChip");
    expect(tabs).toContain('data-center-tab-kind-chip=""');
    expect(tabs).toContain("kind?: React.ReactNode");
    expect(tabs).toContain("<CenterStageTabKindChip>{kind}</CenterStageTabKindChip>");

    const extraTab = tabBar.slice(
      tabBar.indexOf("function TerminalExtraTab"),
      tabBar.indexOf("const PLUS_MENU_TAB_EASE"),
    );
    const extraTooltip = extraTab.slice(
      extraTab.indexOf("<TooltipContent"),
      extraTab.indexOf("</TooltipContent>"),
    );
    const extraPill = extraTab.slice(
      extraTab.indexOf("<CenterStageTab"),
      extraTab.indexOf("</CenterStageTab>"),
    );
    expect(extraTooltip).toContain("centerStageTabBar.tooltipKindTui");
    expect(extraTooltip).toContain("toolbarAgent ?");
    expect(extraPill).not.toContain("tooltipKindTui");
    expect(extraPill).not.toContain("CenterStageTabKindChip");

    const chatTab = tabBar.slice(
      tabBar.indexOf('if (tab.kind === "agent-chat")'),
      tabBar.indexOf('if (tab.kind === "browser")'),
    );
    expect(chatTab).toContain("tooltipKind={t(\"centerStageTabBar.tooltipKindChatUi\")}");
    expect(chatTab).not.toContain("CenterStageTabKindChip");

    const specialTab = tabBar.slice(
      tabBar.indexOf("function SpecialTerminalTab"),
    );
    const specialTooltip = specialTab.slice(
      specialTab.indexOf("<TooltipContent"),
      specialTab.indexOf("</TooltipContent>"),
    );
    const specialPill = specialTab.slice(
      specialTab.indexOf("<CenterStageTab"),
      specialTab.indexOf("</CenterStageTab>"),
    );
    expect(specialTooltip).toContain("kind={tooltipKind}");
    expect(specialPill).not.toContain("tooltipKind");
    expect(specialPill).not.toContain("CenterStageTabKindChip");
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
