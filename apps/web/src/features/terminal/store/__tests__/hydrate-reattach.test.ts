import { describe, expect, it } from "bun:test";
import { hydratePersistedTab } from "../terminal-store-helpers";
import type { PersistedTerminalTabDocument } from "../../lib/terminal-layout-document";

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

  it("creates when the tmux list is present but missing the stored window name", () => {
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

    // Other windows exist, but "4" does not — canvas-created layout after the
    // tmux window was never opened / already killed.
    const hydrated = hydratePersistedTab("ws-1", tab, new Set(["1", "2", "3"]));
    expect(hydrated).not.toBeNull();
    expect(hydrated?.panes["pane-1"].isNewPane).toBe(true);
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
});
