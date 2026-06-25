// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it } from "bun:test";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
  getTerminalWorkspaceScopeKey,
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
        const workspaceScopeKey = getTerminalWorkspaceScopeKey(workspaceId, isProjectContext);
        loadCalls.push({ workspaceId, isProjectContext });
        useTerminalStore.setState((state) => ({
          loadedWorkspaces: new Set([...state.loadedWorkspaces, workspaceScopeKey]),
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
                closable: true,
              },
            ],
          },
          persistedTerminalLayouts: {
            ...state.persistedTerminalLayouts,
            [workspaceScopeKey]: null,
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

  it("evicts same-id workspace state before hydrating a project context", async () => {
    const contextId = "shared-context-id";
    const workspaceScopeKey = getTerminalWorkspaceScopeKey(contextId, false);
    const projectScopeKey = getTerminalWorkspaceScopeKey(contextId, true);
    const loadCalls: Array<{ workspaceId: string; isProjectContext: boolean }> = [];
    const saveContexts: boolean[] = [];

    useTerminalStore.setState({
      loadedWorkspaces: new Set([workspaceScopeKey]),
      workspaceContexts: {
        [contextId]: false,
      },
      workspaceTerminalTabs: {
        [contextId]: [
          {
            id: FIXED_TERMINAL_TAB_VALUE,
            title: "Term",
            closable: true,
          },
        ],
      },
      persistedTerminalLayouts: {
        [workspaceScopeKey]: null,
      },
      loadFromBackend: async (workspaceId, isProjectContext = false) => {
        loadCalls.push({ workspaceId, isProjectContext });
        useTerminalStore.setState((state) => ({
          loadedWorkspaces: new Set([
            ...state.loadedWorkspaces,
            getTerminalWorkspaceScopeKey(workspaceId, isProjectContext),
          ]),
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
                closable: true,
              },
            ],
          },
          persistedTerminalLayouts: {
            ...state.persistedTerminalLayouts,
            [getTerminalWorkspaceScopeKey(workspaceId, isProjectContext)]: null,
          },
        }));
      },
      saveToBackend: (workspaceId) => {
        saveContexts.push(useTerminalStore.getState().workspaceContexts[workspaceId] ?? false);
      },
    });

    const created = await useTerminalStore
      .getState()
      .createTerminalTabWithInitialPane(contextId, "project");

    const state = useTerminalStore.getState();
    expect(created?.tab.id.startsWith(TERMINAL_TAB_VALUE_PREFIX)).toBe(true);
    expect(loadCalls).toEqual([{ workspaceId: contextId, isProjectContext: true }]);
    expect(state.loadedWorkspaces.has(workspaceScopeKey)).toBe(false);
    expect(state.loadedWorkspaces.has(projectScopeKey)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(state.persistedTerminalLayouts, workspaceScopeKey)).toBe(false);
    expect(state.workspaceContexts[contextId]).toBe(true);
    expect(saveContexts).toEqual([true]);
  });

  it("allows closing the fixed Term tab and recreates it from an empty terminal tab list", () => {
    const saveCalls: string[] = [];
    useTerminalStore.setState({
      loadedWorkspaces: new Set([getTerminalWorkspaceScopeKey("workspace-1", false)]),
      workspaceContexts: {
        "workspace-1": false,
      },
      workspaceTerminalTabs: {
        "workspace-1": [
          {
            id: FIXED_TERMINAL_TAB_VALUE,
            title: "Term",
            closable: true,
          },
        ],
      },
      workspaceActiveTerminalTabIds: {
        "workspace-1": FIXED_TERMINAL_TAB_VALUE,
      },
      saveToBackend: (workspaceId) => {
        saveCalls.push(workspaceId);
      },
    });

    useTerminalStore.getState().closeTerminalTab("workspace-1", FIXED_TERMINAL_TAB_VALUE);

    expect(useTerminalStore.getState().workspaceTerminalTabs["workspace-1"]).toEqual([]);
    expect(useTerminalStore.getState().workspaceActiveTerminalTabIds["workspace-1"]).toBe("");

    const recreated = useTerminalStore.getState().createTerminalTab("workspace-1");

    expect(recreated).toEqual({
      id: FIXED_TERMINAL_TAB_VALUE,
      title: "Term",
      closable: true,
    });
    expect(useTerminalStore.getState().workspaceTerminalTabs["workspace-1"]?.[0]?.id).toBe(
      FIXED_TERMINAL_TAB_VALUE,
    );
    expect(saveCalls).toEqual(["workspace-1", "workspace-1"]);
  });

  it("uses a preferred title for new non-fixed terminal tabs and de-duplicates it", () => {
    const saveCalls: string[] = [];
    useTerminalStore.setState({
      loadedWorkspaces: new Set([getTerminalWorkspaceScopeKey("workspace-1", false)]),
      workspaceContexts: {
        "workspace-1": false,
      },
      workspaceTerminalTabs: {
        "workspace-1": [
          {
            id: FIXED_TERMINAL_TAB_VALUE,
            title: "Term",
            closable: true,
          },
          {
            id: `${TERMINAL_TAB_VALUE_PREFIX}existing`,
            title: "Fix CI: test",
            closable: true,
          },
        ],
      },
      persistedTerminalLayouts: {
        [getTerminalWorkspaceScopeKey("workspace-1", false)]: null,
      },
      saveToBackend: (workspaceId) => {
        saveCalls.push(workspaceId);
      },
    });

    const created = useTerminalStore
      .getState()
      .createTerminalTab("workspace-1", { title: "  Fix CI: test  " });

    expect(created.id.startsWith(TERMINAL_TAB_VALUE_PREFIX)).toBe(true);
    expect(created.title).toBe("Fix CI: test 2");
    expect(saveCalls).toEqual(["workspace-1"]);
  });
});
