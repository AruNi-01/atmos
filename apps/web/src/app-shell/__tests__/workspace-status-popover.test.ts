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

    expect(source).not.toContain("setTimeout");
    expect(source).not.toContain("forceMount");
    expect(source).toContain("usePausedDeadlineCountdown");
    expect(source).toContain("paused: chipHovering || actionHovering");
    expect(source).toContain("autoFinishSeconds");
    expect(source).not.toContain("pauseAutoFinishEnabled={open}");

    const view = readFileSync(
      join(import.meta.dir, "../../features/workspace/components/WorkspaceSetupProgress.tsx"),
      "utf8",
    );
    expect(view).toContain("onAutoFinishHoverChange?.(true)");
    expect(view).toContain("onAutoFinishHoverChange?.(false)");
    expect(view).toContain("autoFinishSeconds");
    expect(view).toContain("displayedCountdown");
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

  test("delays auto-enter behind a hover-pausable countdown inside the setup chip", () => {
    const source = readFileSync(
      join(import.meta.dir, "../HeaderWorkspaceJobs.tsx"),
      "utf8",
    );
    const chip = readFileSync(
      join(import.meta.dir, "../header-setup-chip.tsx"),
      "utf8",
    );
    const hook = readFileSync(
      join(import.meta.dir, "../use-workspace-create-auto-open.ts"),
      "utf8",
    );
    const countdown = readFileSync(
      join(import.meta.dir, "../use-paused-deadline-countdown.ts"),
      "utf8",
    );

    expect(source).toContain("HeaderSetupChipFrame");
    expect(source).toContain("autoEnterPaused");
    expect(source).toContain("chipHovering || open || singlePopoverOpen || nestedOpen");
    expect(source).not.toContain("function AutoEnterChip");
    expect(chip).toContain('t("autoEnterStayAll")');
    expect(chip).toContain('t("autoEnterStay")');
    expect(chip).toContain('t("autoEnterNow")');
    expect(chip).toContain("HEADER_CHIP_SURFACE_CLASS");
    expect(source).toContain("cancelAutoOpen");
    expect(hook).toContain("WORKSPACE_AUTO_ENTER_DELAY_MS");
    expect(hook).toContain("paused:");
    expect(hook).toContain("usePausedDeadlineCountdown");
    expect(countdown).toContain("setInterval");
    expect(hook).not.toMatch(/markOpened\(nextWorkspaceId\);\s*router\.push/);
  });
});
