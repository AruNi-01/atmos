// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it } from "bun:test";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
  useTerminalStore,
} from "../use-terminal-store";

const initialState = useTerminalStore.getInitialState();

describe("createTerminalTabWithInitialPane", () => {
  beforeEach(() => {
    useTerminalStore.setState(initialState, true);
  });

  it("hydrates the requested project context before creating the tab", async () => {
    const loadCalls: Array<{ workspaceId: string; isProjectContext: boolean }> = [];
    const saveContexts: Array<{ workspaceId: string; isProjectContext: boolean }> = [];

    useTerminalStore.setState({
      loadFromBackend: async (workspaceId, isProjectContext = false) => {
        loadCalls.push({ workspaceId, isProjectContext });
        useTerminalStore.setState((state) => ({
          loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceId]),
          workspaceContexts: {
            ...state.workspaceContexts,
            [workspaceId]: isProjectContext,
          },
          workspaceTerminalTabs: {
            ...state.workspaceTerminalTabs,
            [workspaceId]: [
              {
                id: FIXED_TERMINAL_TAB_VALUE,
                title: "Term",
                closable: false,
              },
            ],
          },
          persistedTerminalLayouts: {
            ...state.persistedTerminalLayouts,
            [workspaceId]: null,
          },
        }));
      },
      saveToBackend: (workspaceId) => {
        saveContexts.push({
          workspaceId,
          isProjectContext: useTerminalStore.getState().workspaceContexts[workspaceId] ?? false,
        });
      },
    });

    const created = await useTerminalStore
      .getState()
      .createTerminalTabWithInitialPane("project-1", "project");

    expect(loadCalls).toEqual([{ workspaceId: "project-1", isProjectContext: true }]);
    expect(created?.tab.id.startsWith(TERMINAL_TAB_VALUE_PREFIX)).toBe(true);
    expect(created?.pane.tmuxWindowName).toBe("1");
    expect(useTerminalStore.getState().workspaceActiveTerminalTabIds["project-1"]).toBe(created?.tab.id);
    expect(saveContexts).toEqual([{ workspaceId: "project-1", isProjectContext: true }]);
  });

  it("does not create an unsaved tab when context hydration fails", async () => {
    useTerminalStore.setState({
      loadFromBackend: async () => {
        // Simulate the real failure path where loadFromBackend catches/clears but
        // never marks the workspace as loaded.
      },
      saveToBackend: () => {
        throw new Error("saveToBackend should not be called");
      },
    });

    const created = await useTerminalStore
      .getState()
      .createTerminalTabWithInitialPane("workspace-1", "workspace");

    expect(created).toBeNull();
    expect(useTerminalStore.getState().workspaceTerminalTabs["workspace-1"]).toBeUndefined();
  });
});
