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
    expect(launchpad).toContain("ListTodoIcon");
    expect(launchpad).toContain("PlusIcon");
    expect(launchpad).toContain("onMouseEnter");
    expect(launchpad).toContain("onMouseLeave");
  });

  it("uses instant full-accent hover like settings, not a delayed color fade", () => {
    const rowClass = launchpad.slice(
      launchpad.indexOf('// px-3 pairs with nav px-2'),
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
      launchpad.indexOf("flex h-10 cursor-pointer"),
      launchpad.indexOf("onClick={() => onExpandedChange"),
    );
    expect(headerClass).toContain("hover:bg-sidebar-accent");
    expect(headerClass).not.toContain("transition-colors");
    expect(headerClass).not.toContain("hover:bg-sidebar-accent/50");
  });
});

