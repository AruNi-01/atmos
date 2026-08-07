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
  createDefaultManagementCenterItems,
  readManagementCenterItems,
  selectManagementCenterItemsByPlacement,
  useExperimentSettingsStore,
  type ManagementCenterItems,
} from "./experiment-settings-store";

describe("management center item placement helpers", () => {
  it("defaults always-on items to enabled inside, experiments off", () => {
    const items = createDefaultManagementCenterItems();
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside" });
    expect(items.skills).toEqual({ enabled: true, placement: "inside" });
    expect(items["disk-analyzer"]).toEqual({ enabled: true, placement: "inside" });
    expect(items.canvas).toEqual({ enabled: true, placement: "inside" });
    expect(items.kanban).toEqual({ enabled: true, placement: "inside" });
    expect(items["new-workspace"]).toEqual({ enabled: true, placement: "inside" });
    expect(items.terminals).toEqual({ enabled: false, placement: "inside" });
    expect(items.agents).toEqual({ enabled: false, placement: "inside" });
    expect(items.automations).toEqual({ enabled: false, placement: "inside" });
  });

  it("selects only enabled items for a placement", () => {
    const items: ManagementCenterItems = {
      ...createDefaultManagementCenterItems(),
      workspaces: { enabled: true, placement: "outside" },
      skills: { enabled: false, placement: "inside" },
      canvas: { enabled: true, placement: "outside" },
      terminals: { enabled: true, placement: "inside" },
    };

    expect(selectManagementCenterItemsByPlacement(items, "outside")).toEqual([
      "workspaces",
      "canvas",
    ]);
    expect(selectManagementCenterItemsByPlacement(items, "inside")).toEqual([
      "terminals",
      "disk-analyzer",
      "kanban",
      "new-workspace",
    ]);
  });

  it("migrates legacy experiment flags when mgmt_center_items is absent", () => {
    const items = readManagementCenterItems({
      mgmt_terminals: true,
      mgmt_agents: true,
      automations: true,
    });
    expect(items.terminals).toEqual({ enabled: true, placement: "inside" });
    expect(items.agents).toEqual({ enabled: true, placement: "inside" });
    expect(items.automations).toEqual({ enabled: true, placement: "inside" });
    // Defaults still apply for always-on entries.
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside" });
  });

  it("lets persisted mgmt_center_items win over conflicting legacy flags", () => {
    const items = readManagementCenterItems({
      mgmt_terminals: true,
      mgmt_agents: true,
      automations: true,
      mgmt_center_items: {
        terminals: { enabled: false, placement: "outside" },
        agents: { enabled: true, placement: "outside" },
        workspaces: { enabled: false, placement: "inside" },
      },
    });
    expect(items.terminals).toEqual({ enabled: false, placement: "outside" });
    expect(items.agents).toEqual({ enabled: true, placement: "outside" });
    // Not listed in the map — falls back to legacy-enabled defaults for automations.
    expect(items.automations).toEqual({ enabled: true, placement: "inside" });
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
    expect(useExperimentSettingsStore.getState().managementCenterItems.terminals).toEqual({
      enabled: false,
      placement: "inside",
    });

    // New Computer hydrates with a distinct config.
    loadMock.mockImplementationOnce(async () => ({
      experiments: {
        mgmt_center_items: {
          terminals: { enabled: true, placement: "outside" },
        },
      },
    }));
    const incomingPromise = useExperimentSettingsStore.getState().loadSettings();

    // Outgoing response arrives after the switch — must not win.
    resolveOutgoing?.({
      experiments: {
        mgmt_center_items: {
          terminals: { enabled: true, placement: "inside" },
          agents: { enabled: true, placement: "inside" },
        },
      },
    });
    await outgoingPromise;

    // Still defaults (or not the stale agents=true) until the new load commits.
    expect(useExperimentSettingsStore.getState().managementAgentsEnabled).toBe(false);

    await incomingPromise;

    const state = useExperimentSettingsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.managementCenterItems.terminals).toEqual({
      enabled: true,
      placement: "outside",
    });
    // Stale agents:true from the outgoing Computer must not leak.
    expect(state.managementCenterItems.agents).toEqual({
      enabled: false,
      placement: "inside",
    });
    expect(state.managementAgentsEnabled).toBe(false);
  });
});
