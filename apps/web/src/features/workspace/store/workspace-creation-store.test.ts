import { beforeEach, describe, expect, test } from "bun:test";
import {
  getWorkspaceCreateOriginKey,
  selectAutoOpenWorkspaceId,
  useWorkspaceCreationStore,
  type WorkspaceCreateJob,
} from "./workspace-creation-store";

function job(overrides: Partial<WorkspaceCreateJob> & Pick<WorkspaceCreateJob, "id">): WorkspaceCreateJob {
  return {
    workspaceId: null,
    label: null,
    originKey: "workspace:origin",
    phase: "creating",
    createdAt: 1,
    ...overrides,
  };
}

describe("workspace create auto-open policy", () => {
  test("builds origin keys from the current surface", () => {
    expect(
      getWorkspaceCreateOriginKey({
        currentView: "workspace",
        workspaceId: "ws-a",
        projectId: "p-1",
      }),
    ).toBe("workspace:ws-a");
    expect(
      getWorkspaceCreateOriginKey({
        currentView: "project",
        workspaceId: null,
        projectId: "p-1",
      }),
    ).toBe("project:p-1");
    expect(
      getWorkspaceCreateOriginKey({
        currentView: "welcome",
        workspaceId: null,
        projectId: null,
      }),
    ).toBe("view:welcome");
  });

  test("only auto-opens the latest enterable job from the same origin", () => {
    const jobs = [
      job({ id: "a", workspaceId: "ws-a", phase: "bound" }),
      job({ id: "b", workspaceId: "ws-b", phase: "bound" }),
    ];

    expect(
      selectAutoOpenWorkspaceId({
        jobs,
        latestJobId: "b",
        autoOpenedWorkspaceId: null,
        currentOriginKey: "workspace:origin",
        currentWorkspaceId: "ws-origin",
        isEnterable: () => true,
      }),
    ).toBe("ws-b");

    expect(
      selectAutoOpenWorkspaceId({
        jobs,
        latestJobId: "b",
        autoOpenedWorkspaceId: null,
        currentOriginKey: "workspace:origin",
        currentWorkspaceId: "ws-origin",
        isEnterable: (id) => id === "ws-a",
      }),
    ).toBeNull();

    expect(
      selectAutoOpenWorkspaceId({
        jobs,
        latestJobId: "a",
        autoOpenedWorkspaceId: null,
        currentOriginKey: "workspace:origin",
        currentWorkspaceId: "ws-origin",
        isEnterable: () => true,
      }),
    ).toBe("ws-a");
  });

  test("does not chain-jump after the latest job was already opened", () => {
    const jobs = [job({ id: "b", workspaceId: "ws-b", phase: "bound" })];
    expect(
      selectAutoOpenWorkspaceId({
        jobs,
        latestJobId: "b",
        autoOpenedWorkspaceId: "ws-b",
        currentOriginKey: "workspace:origin",
        currentWorkspaceId: "ws-origin",
        isEnterable: () => true,
      }),
    ).toBeNull();
  });

  test("does not steal focus if the user left the origin surface", () => {
    expect(
      selectAutoOpenWorkspaceId({
        jobs: [job({ id: "b", workspaceId: "ws-b", phase: "bound" })],
        latestJobId: "b",
        autoOpenedWorkspaceId: null,
        currentOriginKey: "workspace:other",
        currentWorkspaceId: "ws-other",
        isEnterable: () => true,
      }),
    ).toBeNull();
  });
});

describe("workspace creation store", () => {
  beforeEach(() => {
    useWorkspaceCreationStore.setState({
      jobs: [],
      latestJobId: null,
      autoOpenedWorkspaceId: null,
      pendingAgentRun: null,
    });
  });

  test("keeps the newest create as the auto-open candidate", () => {
    const first = useWorkspaceCreationStore.getState().startCreating({
      originKey: "view:welcome",
      label: "one",
    });
    const second = useWorkspaceCreationStore.getState().startCreating({
      originKey: "view:welcome",
      label: "two",
    });
    useWorkspaceCreationStore.getState().bindWorkspace(first, "ws-1", "one");
    useWorkspaceCreationStore.getState().bindWorkspace(second, "ws-2", "two");

    const state = useWorkspaceCreationStore.getState();
    expect(state.latestJobId).toBe(second);
    expect(state.jobs.map((item) => item.workspaceId)).toEqual(["ws-1", "ws-2"]);
  });

  test("keeps setup jobs when auto-enter is cancelled", () => {
    const id = useWorkspaceCreationStore.getState().startCreating({
      originKey: "view:welcome",
    });
    useWorkspaceCreationStore.getState().bindWorkspace(id, "ws-1");
    useWorkspaceCreationStore.getState().cancelAutoOpen("ws-1");

    const state = useWorkspaceCreationStore.getState();
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]?.workspaceId).toBe("ws-1");
    expect(state.latestJobId).toBe(id);
    expect(state.autoOpenedWorkspaceId).toBe("ws-1");
    expect(
      selectAutoOpenWorkspaceId({
        jobs: state.jobs,
        latestJobId: state.latestJobId,
        autoOpenedWorkspaceId: state.autoOpenedWorkspaceId,
        currentOriginKey: "view:welcome",
        currentWorkspaceId: null,
        isEnterable: () => true,
      }),
    ).toBeNull();
  });

  test("drops a job once that workspace is opened", () => {
    const id = useWorkspaceCreationStore.getState().startCreating({
      originKey: "view:welcome",
    });
    useWorkspaceCreationStore.getState().bindWorkspace(id, "ws-1");
    useWorkspaceCreationStore.getState().markOpened("ws-1");

    const state = useWorkspaceCreationStore.getState();
    expect(state.jobs).toEqual([]);
    expect(state.latestJobId).toBeNull();
    expect(state.autoOpenedWorkspaceId).toBe("ws-1");
  });
});
