import { beforeEach, describe, expect, it, mock } from "bun:test";

const loadMock = mock(() => Promise.resolve({} as unknown));
const updateMock = mock(() => Promise.resolve({ ok: true }));
const writeJsonMock = mock(() => true);
const removeKeyMock = mock(() => {});
const readJsonMock = mock(() => null as unknown);

mock.module("@workspace/ui", () => ({
  toastManager: { add: () => {} },
}));

mock.module("@/features/settings/store/function-settings-store", () => ({
  useFunctionSettingsStore: {
    getState: () => ({
      load: () => loadMock(),
      invalidate: () => {},
    }),
  },
}));

mock.module("@/api/ws/settings-api", () => ({
  functionSettingsApi: {
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

mock.module("@/shared/lib/browser-store", () => ({
  globalKey: (name: string) => `atmos:v1:global:${name}`,
  readJson: (...args: unknown[]) => readJsonMock(...args),
  writeJson: (...args: unknown[]) => writeJsonMock(...args),
  removeKey: (...args: unknown[]) => removeKeyMock(...args),
}));

const { useExperimentSettingsStore } = await import("./experiment-settings-store");

describe("experiment settings load across computer switch", () => {
  beforeEach(() => {
    loadMock.mockReset();
    updateMock.mockReset();
    writeJsonMock.mockReset();
    removeKeyMock.mockReset();
    readJsonMock.mockReset();
    readJsonMock.mockImplementation(() => null);
    updateMock.mockImplementation(() => Promise.resolve({ ok: true }));
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
      order: 2,
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
      order: 2,
    });
    // Stale agents:true from the outgoing Computer must not leak.
    expect(state.launchpadItems.agents).toEqual({
      enabled: false,
      placement: "inside",
      order: 3,
    });
    expect(state.launchpadAgentsEnabled).toBe(false);
  });

  it("commits a live drag layout to localStorage and ~/.atmos function_settings", async () => {
    const next = {
      ...useExperimentSettingsStore.getState().launchpadItems,
    };
    next.workspaces = { ...next.workspaces, placement: "outside", order: 99 };
    await useExperimentSettingsStore.getState().commitLaunchpadItems(next);
    expect(useExperimentSettingsStore.getState().launchpadItems.workspaces.placement).toBe(
      "outside",
    );
    expect(updateMock).toHaveBeenCalledWith(
      "experiments",
      "launchpad_items",
      expect.objectContaining({
        workspaces: expect.objectContaining({ placement: "outside" }),
      }),
    );
  });

  it("persists reorder to localStorage and ~/.atmos function_settings", async () => {
    await useExperimentSettingsStore.getState().reorderLaunchpadItems(
      "automations",
      "skills",
    );

    expect(writeJsonMock).toHaveBeenCalled();
    const written = writeJsonMock.mock.calls.at(-1)?.[1] as {
      automations: { order: number };
      skills: { order: number };
    };
    expect(written.automations.order).toBeLessThan(written.skills.order);

    expect(updateMock).toHaveBeenCalledWith(
      "experiments",
      "launchpad_items",
      written,
    );
  });

  it("clears the local Launchpad cache when switching computers", () => {
    expect(removeKeyMock).toHaveBeenCalledWith("atmos:v1:global:launchpad-items");
  });
});
