import { describe, expect, test } from "bun:test";
import type { WorkspaceSetupProgress } from "@/features/project/store/use-project-store";
import type { WorkspaceCreateJob } from "@/features/workspace/store/workspace-creation-store";
import {
  collectHeaderWorkspaceSetupItems,
  getWorkspaceAutoEnterResumeGraceMs,
  getWorkspaceAutoEnterSeconds,
  isHeaderWorkspaceSetupReadyToOpen,
  selectHeaderWorkspaceSetupChipItem,
  visibleHeaderWorkspaceSetupItems,
  WORKSPACE_AUTO_ENTER_DELAY_MS,
  WORKSPACE_AUTO_ENTER_GROUPED_RESUME_GRACE_MS,
} from "./header-workspace-jobs";

function job(
  overrides: Partial<WorkspaceCreateJob> & Pick<WorkspaceCreateJob, "id">,
): WorkspaceCreateJob {
  return {
    workspaceId: null,
    label: null,
    originKey: "workspace:origin",
    phase: "creating",
    createdAt: 1,
    ...overrides,
  };
}

function progress(
  workspaceId: string,
  stepTitle = "Running setup",
): WorkspaceSetupProgress {
  return {
    workspaceId,
    status: "setting_up",
    stepTitle,
    output: "",
    success: true,
  };
}

describe("collectHeaderWorkspaceSetupItems", () => {
  test("returns nothing when there are no jobs or setups", () => {
    expect(collectHeaderWorkspaceSetupItems({ jobs: [], setupProgress: {} })).toEqual([]);
  });

  test("keeps a single creating job as one directly openable item", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [job({ id: "a", label: "one" })],
      setupProgress: {},
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("a");
    expect(items[0]?.progress).toBeNull();
  });

  test("dedupes a bound job with its setup progress", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [job({ id: "a", workspaceId: "ws-1", phase: "bound" })],
      setupProgress: { "ws-1": progress("ws-1") },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.job?.id).toBe("a");
    expect(items[0]?.progress?.workspaceId).toBe("ws-1");
  });

  test("groups leftover setups after worktrees exist and jobs were opened", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [],
      setupProgress: {
        "ws-1": progress("ws-1", "one"),
        "ws-2": progress("ws-2", "two"),
        "ws-3": progress("ws-3", "three"),
      },
    });
    expect(items.map((item) => item.workspaceId)).toEqual(["ws-1", "ws-2", "ws-3"]);
  });

  test("keeps other jobs plus leftover current setup in one group", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [
        job({ id: "a", workspaceId: "ws-1", phase: "bound", label: "one" }),
        job({ id: "b", workspaceId: "ws-2", phase: "bound", label: "two" }),
      ],
      setupProgress: {
        "ws-1": progress("ws-1"),
        "ws-2": progress("ws-2"),
        "ws-3": progress("ws-3", "current"),
      },
      currentWorkspaceId: "ws-3",
    });
    expect(items.map((item) => item.workspaceId)).toEqual(["ws-1", "ws-2", "ws-3"]);
  });

  test("does not keep a current-workspace job chip after its setup has finished", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [job({ id: "a", workspaceId: "ws-1", phase: "bound" })],
      setupProgress: {},
      currentWorkspaceId: "ws-1",
    });
    expect(items).toEqual([]);
  });
});

describe("isHeaderWorkspaceSetupReadyToOpen", () => {
  test("treats a bound workspace with finished setup as ready", () => {
    const bound = collectHeaderWorkspaceSetupItems({
      jobs: [job({ id: "a", workspaceId: "ws-1", phase: "bound" })],
      setupProgress: {},
    })[0];
    const completed = collectHeaderWorkspaceSetupItems({
      jobs: [job({ id: "b", workspaceId: "ws-2", phase: "bound" })],
      setupProgress: {
        "ws-2": { ...progress("ws-2", "Ready to Build"), status: "completed" },
      },
    })[0];
    const pending = collectHeaderWorkspaceSetupItems({
      jobs: [job({ id: "c", workspaceId: "ws-3", phase: "bound" })],
      setupProgress: { "ws-3": progress("ws-3") },
    })[0];
    const creating = collectHeaderWorkspaceSetupItems({
      jobs: [job({ id: "d" })],
      setupProgress: {},
    })[0];

    expect(bound && isHeaderWorkspaceSetupReadyToOpen(bound)).toBe(true);
    expect(completed && isHeaderWorkspaceSetupReadyToOpen(completed)).toBe(true);
    expect(pending && isHeaderWorkspaceSetupReadyToOpen(pending)).toBe(false);
    expect(creating && isHeaderWorkspaceSetupReadyToOpen(creating)).toBe(false);
  });
});

describe("visibleHeaderWorkspaceSetupItems", () => {
  test("hides the current ready workspace from a group after it was opened", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [
        job({ id: "a", workspaceId: "ws-1", phase: "bound" }),
        job({ id: "b", workspaceId: "ws-2", phase: "bound" }),
      ],
      setupProgress: {
        "ws-2": progress("ws-2"),
      },
    });
    expect(visibleHeaderWorkspaceSetupItems(items, "ws-1").map((item) => item.workspaceId)).toEqual([
      "ws-2",
    ]);
  });
});

describe("workspace auto-enter countdown policy", () => {
  test("counts remaining milliseconds up to whole seconds", () => {
    expect(WORKSPACE_AUTO_ENTER_DELAY_MS).toBe(5_000);
    expect(getWorkspaceAutoEnterSeconds(5_000)).toBe(5);
    expect(getWorkspaceAutoEnterSeconds(4_001)).toBe(5);
    expect(getWorkspaceAutoEnterSeconds(4_000)).toBe(4);
    expect(getWorkspaceAutoEnterSeconds(1)).toBe(1);
    expect(getWorkspaceAutoEnterSeconds(0)).toBe(0);
  });

  test("only grouped header leave waits before resuming", () => {
    expect(getWorkspaceAutoEnterResumeGraceMs(false)).toBe(0);
    expect(getWorkspaceAutoEnterResumeGraceMs(true)).toBe(
      WORKSPACE_AUTO_ENTER_GROUPED_RESUME_GRACE_MS,
    );
  });
});

describe("selectHeaderWorkspaceSetupChipItem", () => {
  test("prefers an in-progress item over a ready current workspace", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [
        job({ id: "a", workspaceId: "ws-1", phase: "bound" }),
        job({ id: "b", workspaceId: "ws-2", phase: "bound" }),
      ],
      setupProgress: {
        "ws-2": progress("ws-2"),
      },
    });
    expect(selectHeaderWorkspaceSetupChipItem(items, "ws-1")?.workspaceId).toBe("ws-2");
  });

  test("prefers the current workspace when it is still in progress", () => {
    const items = collectHeaderWorkspaceSetupItems({
      jobs: [
        job({ id: "a", workspaceId: "ws-1", phase: "bound" }),
        job({ id: "b", workspaceId: "ws-2", phase: "bound" }),
      ],
      setupProgress: {
        "ws-1": progress("ws-1"),
        "ws-2": progress("ws-2"),
      },
    });
    expect(selectHeaderWorkspaceSetupChipItem(items, "ws-1")?.workspaceId).toBe("ws-1");
    expect(selectHeaderWorkspaceSetupChipItem(items, null)?.workspaceId).toBe("ws-2");
  });
});
