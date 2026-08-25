import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import { hydratePersistedTab } from "../terminal-store-helpers";
import type { PersistedTerminalTabDocument } from "../../lib/terminal-layout-document";
import {
  readCachedOscTitle,
  resetCachedDynamicTitlesForTests,
  writeCachedDynamicTitle,
  writeCachedOscTitle,
} from "../../lib/terminal-dynamic-title-cache";
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
    value: globalThis,
    configurable: true,
  });
});

afterEach(() => {
  removeKey(TITLE_CACHE_KEY);
  resetCachedDynamicTitlesForTests();
  mem.clear();
});

describe("hydratePersistedTab reattach preference", () => {
  it("marks panes with a known window name as attachable even when tmux list is empty", () => {
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "3",
          tmuxWindowName: "3",
          workspaceId: "ws-1",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const hydrated = hydratePersistedTab("ws-1", tab, new Set());
    expect(hydrated).not.toBeNull();
    // Empty list is treated as a startup race → prefer attach, not create.
    expect(hydrated?.panes["pane-1"].isNewPane).toBe(false);
    expect(hydrated?.panes["pane-1"].tmuxWindowName).toBe("3");
  });

  it("still prefers attach when the tmux list is present but missing the stored window name", () => {
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "4",
          tmuxWindowName: "4",
          workspaceId: "ws-1",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    // A partial/wrong-session list must not mint a second empty window. Attach
    // first; Terminal.tsx recovers with create only after attach-not-found.
    const hydrated = hydratePersistedTab("ws-1", tab, new Set(["1", "2", "3"]));
    expect(hydrated).not.toBeNull();
    expect(hydrated?.panes["pane-1"].isNewPane).toBe(false);
    expect(hydrated?.panes["pane-1"].tmuxWindowName).toBe("4");
  });

  it("attaches when the stored window name is present in the tmux list", () => {
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "4",
          tmuxWindowName: "4",
          workspaceId: "ws-1",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const hydrated = hydratePersistedTab("ws-1", tab, new Set(["1", "2", "4"]));
    expect(hydrated).not.toBeNull();
    expect(hydrated?.panes["pane-1"].isNewPane).toBe(false);
  });

  it("restores the last cwd/command title from localStorage when layout has none", () => {
    writeCachedDynamicTitle("ws-1", "1", "OpenSource/atmos");
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "1",
          tmuxWindowName: "1",
          workspaceId: "ws-1",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const hydrated = hydratePersistedTab("ws-1", tab, new Set(["1"]));
    expect(hydrated?.panes["pane-1"].dynamicTitle).toBe("OpenSource/atmos");
  });

  it("restores the last OSC topic from localStorage when layout has none", () => {
    writeCachedOscTitle("ws-1", "1", "debugging auth");
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "1",
          tmuxWindowName: "1",
          workspaceId: "ws-1",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const hydrated = hydratePersistedTab("ws-1", tab, new Set(["1"]));
    expect(hydrated?.panes["pane-1"].oscTitle).toBe("debugging auth");
  });

  it("migrates a leftover layout OSC topic into localStorage", () => {
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "1",
          tmuxWindowName: "1",
          workspaceId: "ws-1",
          oscTitle: "debugging auth",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const hydrated = hydratePersistedTab("ws-1", tab, new Set(["1"]));
    expect(hydrated?.panes["pane-1"].oscTitle).toBe("debugging auth");
    expect(readCachedOscTitle("ws-1", "1")).toBe("debugging auth");
  });

  it("prefers the live cwd over a stale persisted title and drops tmux indexes", () => {
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "6",
          tmuxWindowName: "6",
          workspaceId: "ws-1",
          dynamicTitle: "old/path",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const live = {
      "pane-1": {
        id: "pane-1",
        label: "6",
        tmuxWindowName: "6",
        workspaceId: "ws-1",
        sessionId: "live",
        dynamicTitle: "OpenSource/atmos",
      },
    };

    const hydrated = hydratePersistedTab("ws-1", tab, new Set(["6"]), live);
    expect(hydrated?.panes["pane-1"].dynamicTitle).toBe("OpenSource/atmos");

    const numbered = hydratePersistedTab(
      "ws-1",
      {
        ...tab,
        panes: {
          "pane-1": {
            ...tab.panes["pane-1"],
            dynamicTitle: "6",
          },
        },
      },
      new Set(["6"]),
    );
    expect(numbered?.panes["pane-1"].dynamicTitle).toBeUndefined();
  });

  it("hydrates extra-space panes with the host workspace id and namespaced window", () => {
    const extra = makeCenterSpaceKey("ws-1", "space-abc");
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "1",
          tmuxWindowName: "1",
          workspaceId: extra,
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const hydrated = hydratePersistedTab(extra, tab, new Set(["cs__space-abc__1"]));
    expect(hydrated?.panes["pane-1"].workspaceId).toBe("ws-1");
    expect(hydrated?.panes["pane-1"].tmuxWindowName).toBe("cs__space-abc__1");
  });

  it("does not double-prefix an already namespaced extra-space window", () => {
    const extra = makeCenterSpaceKey("ws-1", "space-abc");
    const tab = {
      id: "term",
      title: "Term",
      layout: "pane-1",
      panes: {
        "pane-1": {
          id: "pane-1",
          label: "1",
          tmuxWindowName: "cs__space-abc__1",
          workspaceId: "ws-1",
        },
      },
      maximizedTerminalId: null,
    } as unknown as PersistedTerminalTabDocument;

    const hydrated = hydratePersistedTab(extra, tab, new Set());
    expect(hydrated?.panes["pane-1"].workspaceId).toBe("ws-1");
    expect(hydrated?.panes["pane-1"].tmuxWindowName).toBe("cs__space-abc__1");
  });
});
