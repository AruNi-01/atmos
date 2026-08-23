import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const launchpad = readFileSync(
  join(import.meta.dir, "../LeftSidebarLaunchpad.tsx"),
  "utf8",
);

describe("left sidebar outside launchpad hover", () => {
  it("drives animated icons from the whole row like settings sidebar", () => {
    expect(launchpad).toContain("startAnimation");
    expect(launchpad).toContain("stopAnimation");
    expect(launchpad).toContain("LaunchpadOutsideIcon");
    expect(launchpad).toContain("FolderKanbanIcon");
    expect(launchpad).toContain("PuzzleIcon");
    expect(launchpad).toContain("TimerIcon");
    expect(launchpad).toContain("ChartColumnBigIcon");
    expect(launchpad).toContain("CanvasIcon");
    expect(launchpad).toContain("PencilRulerIcon");
    expect(launchpad).toContain("ListTodoIcon");
    expect(launchpad).toContain("PlusIcon");
    expect(launchpad).toContain("onMouseEnter");
    expect(launchpad).toContain("onMouseLeave");
  });

  it("uses instant full-accent hover like settings, not a delayed color fade", () => {
    const rowClass = launchpad.slice(
      launchpad.indexOf("/** Simple icon + name row"),
      launchpad.indexOf("const hoverHandlers"),
    );
    expect(rowClass).toContain("hover:bg-sidebar-accent");
    expect(rowClass).not.toContain("hover:bg-sidebar-accent/50");
    expect(rowClass).not.toContain("transition-colors");
  });

  it("animates the launchpad header rocket with instant accent hover", () => {
    expect(launchpad).toContain("RocketIcon");
    expect(launchpad).toContain("rocketRef.current?.startAnimation");
    const headerClass = launchpad.slice(
      launchpad.indexOf("flex h-[calc(2.25rem+1px)]"),
      launchpad.indexOf("onClick={() => onExpandedChange"),
    );
    expect(headerClass).toContain("hover:bg-sidebar-accent");
    expect(headerClass).toContain("rounded-2xl");
    expect(headerClass).toContain("border-[0.5px] border-border/40");
    expect(headerClass).not.toContain("rounded-b-xl");
    expect(headerClass).not.toContain("px-1.5");
    expect(headerClass).not.toContain("bg-background/50");
    expect(headerClass).not.toContain("transition-colors");
    expect(headerClass).not.toContain("hover:bg-sidebar-accent/50");
  });

  it("uses a persistent rounded-2xl card with an always-visible border and a 2-column tile grid", () => {
    expect(launchpad).toContain("rounded-2xl");
    expect(launchpad).not.toContain("rounded-[min(1.5rem,50%)]");
    expect(launchpad).toContain("border-[0.5px] border-border/40 bg-muted/20");
    expect(launchpad).not.toContain("border-transparent");
    expect(launchpad).not.toContain("hover:border-border/40");
    expect(launchpad).toContain("grid-cols-2");
    expect(launchpad).not.toContain("grid-cols-1");
    expect(launchpad).not.toContain("@[200px]:grid-cols-2");
    expect(launchpad).toContain("rounded-xl");
    expect(launchpad).not.toContain("border-t border-border/60");
    expect(launchpad).toContain("bg-background/20");
    expect(launchpad).toContain("grid-rows-[1fr]");
    expect(launchpad).toContain("grid-rows-[0fr]");
    expect(launchpad).toContain("transition-[grid-template-rows]");
    expect(launchpad).toContain("duration-300");
  });

  it("renders inside grid items as icons only", () => {
    const card = launchpad.slice(
      launchpad.indexOf("function LaunchpadCard"),
      launchpad.lastIndexOf("TooltipContent side=\"bottom\""),
    );
    expect(card).toContain("justify-center");
    expect(card).toContain("aria-label={label}");
    expect(card).not.toContain("truncate");
    expect(card).toContain("LaunchpadOutsideIcon");
  });

  it("press-and-move sorts grid and list without a drag handle or grab cursor", () => {
    expect(launchpad).toContain("distance: 8");
    expect(launchpad).not.toContain("delay: 400");
    expect(launchpad).toContain("rectSortingStrategy");
    expect(launchpad).toContain("verticalListSortingStrategy");
    expect(launchpad).toContain("cursor-default");
    expect(launchpad).toContain("pointerWithin");
    expect(launchpad).not.toContain("cursor-grab");
    expect(launchpad).not.toContain("cursor-grabbing");
    expect(launchpad).not.toContain("GripVertical");
    expect(launchpad).toContain("DragOverlay");
    expect(launchpad).toContain("LaunchpadDragPreview");
    expect(launchpad).toContain("launchpadPreviewPlacement");
    expect(launchpad).toContain("snapCenterToCursor");
    expect(launchpad).toContain("onDragOver");
    expect(launchpad).toContain("applyLaunchpadReorder");
    expect(launchpad).toContain("opacity-0");
    expect(launchpad).toContain("animateLaunchpadLayout");
    expect(launchpad).toContain("LAUNCHPAD_SHIFT_TRANSITION");
    expect(launchpad).toContain("suppressHover");
  });
});

