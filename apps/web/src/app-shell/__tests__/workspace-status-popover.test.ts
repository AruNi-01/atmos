import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("workspace status popover size animation", () => {
  test("animates auto width and height instead of snapping class widths", () => {
    const source = readFileSync(
      join(import.meta.dir, "../WorkspaceStatusPopover.tsx"),
      "utf8",
    );

    expect(source).toContain("SetupPopoverSizeFrame");
    expect(source).toContain("[interpolate-size:allow-keywords]");
    expect(source).toContain("transition-[width,height]");
    expect(source).toContain("h-auto");
    expect(source).toContain("getWorkspaceSetupPopoverWidth");
    expect(source).not.toContain("overflow-y-hidden");
    expect(source).not.toContain("w-[720px]");
    expect(source).not.toContain("w-[840px]");
    expect(source).not.toContain("w-[960px]");
  });

  test("completed auto-close is owned by the setup view hover-aware countdown", () => {
    const source = readFileSync(
      join(import.meta.dir, "../WorkspaceStatusPopover.tsx"),
      "utf8",
    );

    expect(source).not.toContain("5000");
    expect(source).not.toContain("setTimeout");
    expect(source).toContain('forceMount={progress.status === "completed" ? true : undefined}');

    const view = readFileSync(
      join(import.meta.dir, "../../features/workspace/components/WorkspaceSetupProgress.tsx"),
      "utf8",
    );
    expect(view).toContain("onMouseEnter={() => setIsHovered(true)}");
    expect(view).toContain("onMouseLeave={() => setIsHovered(false)}");
    expect(view).toContain("localCountdown > 0 && !(isHovered && pauseAutoFinishEnabled)");
    expect(source).toContain("pauseAutoFinishEnabled={open}");
  });
});

describe("workspace create overlay", () => {
  test("app layout no longer mounts a fullscreen creation overlay", () => {
    const layout = readFileSync(
      join(import.meta.dir, "../..", "app/(app)/layout.tsx"),
      "utf8",
    );
    expect(layout).not.toContain("WorkspaceCreationOverlay");

    const header = readFileSync(join(import.meta.dir, "../Header.tsx"), "utf8");
    expect(header).toContain("HeaderWorkspaceJobs");
  });
});

describe("header workspace setup grouping", () => {
  test("collapses multiple setups into a nested popover instead of sibling chips", () => {
    const source = readFileSync(
      join(import.meta.dir, "../HeaderWorkspaceJobs.tsx"),
      "utf8",
    );

    expect(source).toContain("collectHeaderWorkspaceSetupItems");
    expect(source).toContain("isHeaderWorkspaceSetupReadyToOpen");
    expect(source).toContain("items.length > 1");
    expect(source).toContain("data-header-setup-nested");
    expect(source).toContain('side="right"');
    expect(source).toContain("CheckCircle2");
    expect(source).toContain('t("ready")');
    expect(source).not.toContain("border-b border-border/60");
    expect(source).not.toContain("backgroundJobs");
    expect(source).not.toContain("showList");
  });
});
