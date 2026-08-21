// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FIXED_TERMINAL_TAB_VALUE } from "../../lib/terminal-layout-document";
import type { TerminalPaneProps } from "../../types/index";
import {
  readCachedDynamicTitle,
  readCachedOscTitle,
  resetCachedDynamicTitlesForTests,
  writeCachedDynamicTitle,
  writeCachedOscTitle,
} from "../../lib/terminal-dynamic-title-cache";
import {
  buildPersistedTerminalWorkspaceLayout,
  normalizeStoredDynamicTitle,
} from "../terminal-store-helpers";
import { useTerminalStore } from "../use-terminal-store";
import { globalKey, removeKey } from "@/shared/lib/browser-store";

const TITLE_CACHE_KEY = globalKey("terminalDynamicTitles");
const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  resetCachedDynamicTitlesForTests();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: Object.assign(globalThis, { location: { pathname: "/en" } }),
    configurable: true,
  });
});

afterEach(() => {
  removeKey(TITLE_CACHE_KEY);
  resetCachedDynamicTitlesForTests();
  mem.clear();
});

describe("normalizeStoredDynamicTitle", () => {
  it("keeps cwd and command titles", () => {
    expect(normalizeStoredDynamicTitle("OpenSource/atmos")).toBe("OpenSource/atmos");
    expect(normalizeStoredDynamicTitle("  npm run dev  ")).toBe("npm run dev");
  });

  it("drops empty values and tmux window indexes", () => {
    expect(normalizeStoredDynamicTitle(undefined)).toBeUndefined();
    expect(normalizeStoredDynamicTitle("")).toBeUndefined();
    expect(normalizeStoredDynamicTitle("1")).toBeUndefined();
    expect(normalizeStoredDynamicTitle("  6  ")).toBeUndefined();
  });
});

describe("terminal dynamic title localStorage cache", () => {
  it("round-trips cwd titles per workspace window", () => {
    writeCachedDynamicTitle("ws-1", "1", "OpenSource/atmos");
    expect(readCachedDynamicTitle("ws-1", "1")).toBe("OpenSource/atmos");
    expect(readCachedDynamicTitle("ws-1", "6")).toBeUndefined();
  });

  it("ignores tmux window indexes as titles", () => {
    writeCachedDynamicTitle("ws-1", "1", "1");
    expect(readCachedDynamicTitle("ws-1", "1")).toBeUndefined();
  });

  it("stores a stable OSC session topic and ignores Grok realtime churn", () => {
    writeCachedOscTitle("ws-1", "1", "debugging auth");
    expect(readCachedOscTitle("ws-1", "1")).toBe("debugging auth");

    writeCachedOscTitle(
      "ws-1",
      "1",
      "Action Required - ⠋ - Responding - Optimize Terminal Tab - grok",
    );
    expect(readCachedOscTitle("ws-1", "1")).toBe("Optimize Terminal Tab");

    writeCachedOscTitle("ws-1", "1", "⠋ - Responding - grok");
    expect(readCachedOscTitle("ws-1", "1")).toBe("Optimize Terminal Tab");
  });

  it("clears a cached OSC topic when the live title is empty", () => {
    writeCachedOscTitle("ws-1", "1", "debugging auth");
    writeCachedOscTitle("ws-1", "1", undefined);
    expect(readCachedOscTitle("ws-1", "1")).toBeUndefined();
  });
});

describe("buildPersistedTerminalWorkspaceLayout dynamicTitle", () => {
  const pane = (partial: Partial<TerminalPaneProps> & Pick<TerminalPaneProps, "id" | "label">): TerminalPaneProps => ({
    sessionId: `session-${partial.id}`,
    workspaceId: "ws-1",
    tmuxWindowName: partial.tmuxWindowName ?? partial.label,
    ...partial,
  });

  it("does not write dynamicTitle or oscTitle into the layout API payload", () => {
    const persisted = buildPersistedTerminalWorkspaceLayout(
      {
        workspaceTerminalTabs: {
          "ws-1": [{ id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: true }],
        },
        workspaceActiveTerminalTabIds: { "ws-1": FIXED_TERMINAL_TAB_VALUE },
        workspacePanes: {
          "ws-1": {
            "pane-cwd": pane({
              id: "pane-cwd",
              label: "1",
              dynamicTitle: "OpenSource/atmos",
              oscTitle: "debugging auth",
            }),
          },
        },
        workspaceLayouts: { "ws-1": "pane-cwd" },
        workspaceMaximizedIds: { "ws-1": null },
        persistedTerminalLayouts: {},
        workspaceContexts: { "ws-1": false },
      },
      "ws-1",
    );

    const persistedPane = persisted?.tabs[0]?.panes["pane-cwd"] ?? {};
    expect(Object.prototype.hasOwnProperty.call(persistedPane, "dynamicTitle")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(persistedPane, "oscTitle")).toBe(false);
  });
});

describe("setDynamicTitle", () => {
  const initialState = useTerminalStore.getInitialState();

  beforeEach(() => {
    useTerminalStore.setState(initialState, true);
  });

  it("stores cwd titles locally and never saves terminal-layout", () => {
    const saveCalls: string[] = [];
    useTerminalStore.setState({
      workspacePanes: {
        "ws-1": {
          "pane-1": {
            id: "pane-1",
            label: "1",
            tmuxWindowName: "1",
            workspaceId: "ws-1",
            sessionId: "s1",
          },
        },
      },
      saveToBackend: (workspaceId) => {
        saveCalls.push(workspaceId);
      },
    });

    useTerminalStore.getState().setDynamicTitle("ws-1", "pane-1", "1");
    expect(useTerminalStore.getState().workspacePanes["ws-1"]?.["pane-1"]?.dynamicTitle).toBeUndefined();
    expect(saveCalls).toEqual([]);

    useTerminalStore.getState().setDynamicTitle("ws-1", "pane-1", "OpenSource/atmos");
    expect(useTerminalStore.getState().workspacePanes["ws-1"]?.["pane-1"]?.dynamicTitle).toBe(
      "OpenSource/atmos",
    );
    expect(readCachedDynamicTitle("ws-1", "1")).toBe("OpenSource/atmos");
    expect(saveCalls).toEqual([]);

    useTerminalStore.getState().setDynamicTitle("ws-1", "pane-1", "6");
    expect(useTerminalStore.getState().workspacePanes["ws-1"]?.["pane-1"]?.dynamicTitle).toBe(
      "OpenSource/atmos",
    );
    expect(saveCalls).toEqual([]);
  });

  it("stores OSC topics locally and never saves terminal-layout", () => {
    const saveCalls: string[] = [];
    useTerminalStore.setState({
      workspacePanes: {
        "ws-1": {
          "pane-1": {
            id: "pane-1",
            label: "1",
            tmuxWindowName: "1",
            workspaceId: "ws-1",
            sessionId: "s1",
          },
        },
      },
      saveToBackend: (workspaceId) => {
        saveCalls.push(workspaceId);
      },
    });

    useTerminalStore.getState().setOscTitle("ws-1", "pane-1", "debugging auth");
    expect(useTerminalStore.getState().workspacePanes["ws-1"]?.["pane-1"]?.oscTitle).toBe(
      "debugging auth",
    );
    expect(readCachedOscTitle("ws-1", "1")).toBe("debugging auth");
    expect(saveCalls).toEqual([]);

    useTerminalStore.getState().setOscTitle(
      "ws-1",
      "pane-1",
      "⠋ - Responding - Optimize Terminal Tab - grok",
    );
    expect(readCachedOscTitle("ws-1", "1")).toBe("Optimize Terminal Tab");
    expect(saveCalls).toEqual([]);
  });
});
