import { beforeEach, describe, expect, test, mock } from "bun:test";

const updateMock = mock(() => Promise.resolve({ ok: true }));
const loadMock = mock(() => Promise.resolve({ editor: {} as Record<string, unknown> }));

mock.module("@workspace/ui", () => ({
  toastManager: { add: () => {} },
}));

mock.module("@/features/settings/store/function-settings-store", () => ({
  useFunctionSettingsStore: {
    getState: () => ({
      load: () => loadMock(),
    }),
  },
}));

mock.module("@/api/ws-api", () => ({
  functionSettingsApi: {
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

const { useEditorSettingsStore } = await import("../editor-settings-store");

describe("APP-074 editor gitBlame setting", () => {
  beforeEach(() => {
    updateMock.mockReset();
    loadMock.mockReset();
    loadMock.mockImplementation(() => Promise.resolve({ editor: {} }));
    updateMock.mockImplementation(() => Promise.resolve({ ok: true }));
    useEditorSettingsStore.setState({
      gitBlame: true,
      gitIntegration: true,
      loaded: false,
      loading: false,
    });
  });

  test("S7 missing git_blame key defaults on", async () => {
    expect(useEditorSettingsStore.getState().gitBlame).toBe(true);
    await useEditorSettingsStore.getState().loadSettings();
    expect(useEditorSettingsStore.getState().gitBlame).toBe(true);
  });

  test("S9 persist off writes editor.git_blame false", async () => {
    await useEditorSettingsStore.getState().setGitBlame(false);
    expect(useEditorSettingsStore.getState().gitBlame).toBe(false);
    expect(updateMock).toHaveBeenCalled();
    const args = updateMock.mock.calls[0] as unknown[];
    expect(args[0]).toBe("editor");
    expect(args[1]).toBe("git_blame");
    expect(args[2]).toBe(false);
  });

  test("S10 gitBlame is independent of gitIntegration", async () => {
    await useEditorSettingsStore.getState().setGitBlame(true);
    await useEditorSettingsStore.getState().setGitIntegration(false);
    expect(useEditorSettingsStore.getState().gitBlame).toBe(true);
    expect(useEditorSettingsStore.getState().gitIntegration).toBe(false);
  });
});
