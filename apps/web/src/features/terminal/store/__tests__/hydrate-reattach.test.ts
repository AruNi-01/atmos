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
    expect(hydrated?.panes["pane-1"].isNewPane).toBe(false);
    expect(hydrated?.panes["pane-1"].tmuxWindowName).toBe("3");
  });
});
