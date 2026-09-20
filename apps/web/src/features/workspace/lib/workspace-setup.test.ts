import { describe, expect, test } from "bun:test";
import type { WorkspaceSetupProgress } from "@/features/project/store/use-project-store";
import {
  getWorkspaceSetupPopoverWidth,
  isWorkspaceSetupBlocking,
  setupProgressUiEqual,
} from "./workspace-setup";

describe("getWorkspaceSetupPopoverWidth", () => {
  test("uses the step-count width on a wide viewport", () => {
    expect(getWorkspaceSetupPopoverWidth(2, 1400)).toBe(720);
    expect(getWorkspaceSetupPopoverWidth(3, 1400)).toBe(720);
    expect(getWorkspaceSetupPopoverWidth(4, 1400)).toBe(840);
    expect(getWorkspaceSetupPopoverWidth(5, 1400)).toBe(960);
  });

  test("clamps to the viewport with a gutter", () => {
    expect(getWorkspaceSetupPopoverWidth(3, 500)).toBe(476);
    expect(getWorkspaceSetupPopoverWidth(5, 320)).toBe(296);
  });
});

describe("setupProgressUiEqual", () => {
  const base = (overrides: Partial<WorkspaceSetupProgress> = {}): WorkspaceSetupProgress => ({
    workspaceId: "ws-1",
    status: "setting_up",
    stepKey: "run_setup_script",
    stepTitle: "Running Setup Script",
    output: "a",
    success: true,
    ...overrides,
  });

  test("ignores setup script output churn", () => {
    expect(
      setupProgressUiEqual({ "ws-1": base({ output: "a" }) }, { "ws-1": base({ output: "ab" }) }),
    ).toBe(true);
  });

  test("notices step and status changes", () => {
    expect(
      setupProgressUiEqual(
        { "ws-1": base() },
        { "ws-1": base({ stepKey: "ready", status: "completed" }) },
      ),
    ).toBe(false);
  });
});

describe("isWorkspaceSetupBlocking", () => {
  test("blocks only while the worktree is being created", () => {
    expect(
      isWorkspaceSetupBlocking({
        workspaceId: "ws-1",
        status: "creating",
        stepKey: "create_worktree",
        stepTitle: "Creating Workspace",
        output: "",
        success: true,
      }),
    ).toBe(true);
    expect(
      isWorkspaceSetupBlocking({
        workspaceId: "ws-1",
        status: "setting_up",
        stepKey: "run_setup_script",
        stepTitle: "Running Setup Script",
        output: "",
        success: true,
      }),
    ).toBe(false);
  });
});
