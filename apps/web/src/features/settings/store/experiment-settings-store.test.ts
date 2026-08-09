import { beforeEach, describe, expect, it, mock } from "bun:test";

const loadMock = mock(() => Promise.resolve({} as unknown));

mock.module("@/features/settings/store/function-settings-store", () => ({
  useFunctionSettingsStore: {
    getState: () => ({
      load: () => loadMock(),
      invalidate: () => {},
    }),
  },
}));

mock.module("@/api/ws-api", () => ({
  functionSettingsApi: {
    update: async () => {},
  },
}));

import {
  createDefaultLaunchpadItems,
  readLaunchpadItems,
  selectLaunchpadItemsByPlacement,
  useExperimentSettingsStore,
  type LaunchpadItems,
} from "./experiment-settings-store";

describe("launchpad item placement helpers", () => {
  it("defaults always-on items enabled; skills/automations/token-usage/canvas/kanban/new-workspace outside, rest inside; terminals/agents off", () => {
    const items = createDefaultLaunchpadItems();
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside" });
    expect(items.skills).toEqual({ enabled: true, placement: "outside" });
    expect(items["disk-analyzer"]).toEqual({ enabled: true, placement: "inside" });
    expect(items["token-usage"]).toEqual({ enabled: true, placement: "outside" });
    expect(items.canvas).toEqual({ enabled: true, placement: "outside" });
    expect(items.kanban).toEqual({ enabled: true, placement: "outside" });
    expect(items["new-workspace"]).toEqual({ enabled: true, placement: "outside" });
    expect(items.terminals).toEqual({ enabled: false, placement: "inside" });
    expect(items.agents).toEqual({ enabled: false, placement: "inside" });
    expect(items.automations).toEqual({ enabled: true, placement: "outside" });
  });

  it("selects only enabled items for a placement", () => {
    const items: LaunchpadItems = {
      ...createDefaultLaunchpadItems(),
      workspaces: { enabled: true, placement: "outside" },
      skills: { enabled: false, placement: "inside" },
      canvas: { enabled: true, placement: "outside" },
      terminals: { enabled: true, placement: "inside" },
      "token-usage": { enabled: false, placement: "outside" },
    };

    expect(selectLaunchpadItemsByPlacement(items, "outside")).toEqual([
      "workspaces",
      "automations",
      "canvas",
      "kanban",
      "new-workspace",
    ]);
    expect(selectLaunchpadItemsByPlacement(items, "inside")).toEqual([
      "terminals",
      "disk-analyzer",
    ]);
  });

  it("uses defaults when launchpad_items is absent", () => {
    const items = readLaunchpadItems({});
    expect(items.terminals).toEqual({ enabled: false, placement: "inside" });
    expect(items.agents).toEqual({ enabled: false, placement: "inside" });
    expect(items.automations).toEqual({ enabled: true, placement: "outside" });
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside" });
  });

  it("merges persisted launchpad_items over defaults", () => {
    const items = readLaunchpadItems({
      launchpad_items: {
        terminals: { enabled: false, placement: "outside" },
        agents: { enabled: true, placement: "outside" },
        workspaces: { enabled: false, placement: "inside" },
      },
    });
    expect(items.terminals).toEqual({ enabled: false, placement: "outside" });
    expect(items.agents).toEqual({ enabled: true, placement: "outside" });
    // Not listed — keep default outside placement for automations.
    expect(items.automations).toEqual({ enabled: true, placement: "outside" });
    expect(items.workspaces).toEqual({ enabled: false, placement: "inside" });
  });
});

describe("experiment settings load across computer switch", () => {
  beforeEach(() => {
    loadMock.mockReset();
    useExperimentSettingsStore.getState().resetForConnectionChange();
  });

  it("ignores a stale load that finishes after resetForConnectionChange", async () => {
    let resolveOutgoing: ((value: unknown) => void) | null = null;
    const outgoingLoad = new Promise((resolve) => {
      resolveOutgoing = resolve;
    });

    loadMock.mockImplementationOnce(() => outgoingLoad);

    const outgoingPromise = useExperimentSettingsStore.getState().loadSettings();
    expect(useExperimentSettingsStore.getState().loaded).toBe(false);

    // Switch computers while the outgoing Computer's settings are still loading.
    useExperimentSettingsStore.getState().resetForConnectionChange();
    expect(useExperimentSettingsStore.getState().loaded).toBe(false);
    expect(useExperimentSettingsStore.getState().launchpadItems.terminals).toEqual({
      enabled: false,
      placement: "inside",
    });

    // New Computer hydrates with a distinct config.
    loadMock.mockImplementationOnce(async () => ({
      experiments: {
        launchpad_items: {
          terminals: { enabled: true, placement: "outside" },
        },
      },
    }));
    const incomingPromise = useExperimentSettingsStore.getState().loadSettings();

    // Outgoing response arrives after the switch — must not win.
    resolveOutgoing?.({
      experiments: {
        launchpad_items: {
          terminals: { enabled: true, placement: "inside" },
          agents: { enabled: true, placement: "inside" },
        },
      },
    });
    await outgoingPromise;

    // Still defaults (or not the stale agents=true) until the new load commits.
    expect(useExperimentSettingsStore.getState().launchpadAgentsEnabled).toBe(false);

    await incomingPromise;

    const state = useExperimentSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.launchpadItems.terminals).toEqual({
      enabled: true,
      placement: "outside",
    });
    // Stale agents:true from the outgoing Computer must not leak.
    expect(state.launchpadItems.agents).toEqual({
      enabled: false,
      placement: "inside",
    });
    expect(state.launchpadAgentsEnabled).toBe(false);
  });
});
