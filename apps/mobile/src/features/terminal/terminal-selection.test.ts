// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { MobileTerminalEntry } from "@/stores/terminal-store";
import {
  appendLocalTerminalEntry,
  createDefaultTerminalEntry,
  createLocalTerminalEntry,
  mergeTerminalCandidateEntries,
  nextActiveTerminalEntryId,
  resolveActiveTerminalEntry,
  terminalTabLabel,
} from "./terminal-selection";

function entry(id: string, patch: Partial<MobileTerminalEntry> = {}): MobileTerminalEntry {
  return {
    id,
    workspaceId: "workspace",
    label: id,
    ...patch,
  };
}

describe("terminal selection", () => {
  test("keeps an existing active terminal when it is still present", () => {
    expect(nextActiveTerminalEntryId([entry("one"), entry("two")], "two")).toBe("two");
    expect(resolveActiveTerminalEntry([entry("one"), entry("two")], "two")?.id).toBe("two");
  });

  test("selects the only terminal automatically", () => {
    expect(nextActiveTerminalEntryId([entry("only")], null)).toBe("only");
  });

  test("selects the first terminal when multiple terminals are available", () => {
    expect(nextActiveTerminalEntryId([entry("one"), entry("two")], null)).toBe("one");
    expect(resolveActiveTerminalEntry([entry("one"), entry("two")], null)?.id).toBe("one");
  });

  test("creates mobile-owned session ids for server candidates", () => {
    const [candidate] = mergeTerminalCandidateEntries(
      "workspace",
      [
        {
          active: true,
          id: "session:server-session",
          label: "Server terminal",
          session_id: "server-session",
          tmux_window_index: 2,
          tmux_window_name: "server-window",
          workspace_id: "workspace",
        },
      ],
      [],
    );

    expect(candidate?.sessionId?.startsWith("workspace:mobile:")).toBe(true);
    expect(candidate?.sessionId).not.toBe("server-session");
    expect(candidate?.tmuxWindowIndex).toBe(2);
    expect(candidate?.tmuxWindowName).toBe("server-window");
  });

  test("drops the synthetic default once server candidates arrive", () => {
    const defaultEntry = createDefaultTerminalEntry("workspace");
    const entries = mergeTerminalCandidateEntries(
      "workspace",
      [
        {
          active: false,
          id: "tmux:workspace:1",
          label: "Existing",
          tmux_window_index: 1,
          tmux_window_name: "Existing",
          workspace_id: "workspace",
        },
      ],
      [defaultEntry],
    );

    expect(entries.map((candidate) => candidate.id)).toEqual(["tmux:workspace:1"]);
  });

  test("preserves dynamic title while reconciling server candidates", () => {
    const entries = mergeTerminalCandidateEntries(
      "workspace",
      [
        {
          active: false,
          id: "tmux:workspace:1",
          label: "Existing",
          tmux_window_index: 1,
          tmux_window_name: "Existing",
          workspace_id: "workspace",
        },
      ],
      [
        {
          id: "local",
          workspaceId: "workspace",
          label: "Existing",
          sessionId: "workspace:mobile:old",
          tmuxWindowName: "Existing",
          dynamicTitle: "npm test",
        },
      ],
    );

    expect(entries[0]?.sessionId).toBe("workspace:mobile:old");
    expect(entries[0]?.dynamicTitle).toBe("npm test");
  });

  test("flattens multiple server candidates into discrete tabs (no mosaic grouping)", () => {
    const entries = mergeTerminalCandidateEntries(
      "workspace",
      [
        {
          active: true,
          id: "tmux:workspace:0",
          label: "pane-a",
          tmux_window_index: 0,
          tmux_window_name: "pane-a",
          workspace_id: "workspace",
        },
        {
          active: false,
          id: "tmux:workspace:1",
          label: "pane-b",
          tmux_window_index: 1,
          tmux_window_name: "pane-b",
          workspace_id: "workspace",
        },
        {
          active: false,
          id: "session:extra",
          label: "extra",
          session_id: "extra",
          workspace_id: "workspace",
        },
      ],
      [],
    );

    expect(entries).toHaveLength(3);
    expect(entries.map((item) => item.id)).toEqual([
      "tmux:workspace:0",
      "tmux:workspace:1",
      "session:extra",
    ]);
    expect(nextActiveTerminalEntryId(entries, null)).toBe("tmux:workspace:0");
  });

  test("appendLocalTerminalEntry adds a tab and makes it active", () => {
    const existing = [entry("tmux:workspace:0", { label: "main" })];
    const result = appendLocalTerminalEntry("workspace", existing);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.id).toBe("tmux:workspace:0");
    expect(result.entry.id).toBe(result.activeEntryId);
    expect(result.entries[1]?.id).toBe(result.activeEntryId);
    expect(result.entry.isNew).toBe(true);
    expect(result.entry.sessionId?.startsWith("workspace:mobile:")).toBe(true);
    expect(resolveActiveTerminalEntry(result.entries, result.activeEntryId)?.id).toBe(result.activeEntryId);
  });

  test("createLocalTerminalEntry uses sequential terminal labels", () => {
    const first = createLocalTerminalEntry("workspace", []);
    const second = createLocalTerminalEntry("workspace", [first]);
    expect(first.label).toBe("Terminal 1");
    expect(second.label).toBe("Terminal 2");
    expect(first.id).not.toBe(second.id);
  });

  test("terminalTabLabel prefers dynamic over noisy OSC and truncates long names", () => {
    expect(terminalTabLabel({ label: "Fallback" })).toBe("Fallback");
    expect(terminalTabLabel({ label: "Fallback", dynamicTitle: "npm test" })).toBe("npm test");
    // Shell host/cwd OSC (e.g. zsh path titles) is noise — keep dynamic command.
    expect(terminalTabLabel({ label: "Fallback", dynamicTitle: "npm test", oscTitle: "zsh" })).toBe(
      "npm test",
    );
    expect(
      terminalTabLabel({
        label: "Fallback",
        dynamicTitle: "npm test",
        oscTitle: "user@host:~/proj",
      }),
    ).toBe("npm test");
    // Empty OSC must not block dynamic/label fallbacks (?? treats "" as present).
    expect(terminalTabLabel({ label: "Fallback", dynamicTitle: "npm test", oscTitle: "" })).toBe(
      "npm test",
    );
    expect(terminalTabLabel({ label: "Fallback", dynamicTitle: "", oscTitle: "" })).toBe("Fallback");
    // Non-noisy OSC is used when there is no dynamic title.
    expect(terminalTabLabel({ label: "Fallback", oscTitle: "my-session" })).toBe("my-session");
    const long = "a-very-long-terminal-window-title-that-needs-trim";
    expect(terminalTabLabel({ label: long }).endsWith("…")).toBe(true);
    expect(terminalTabLabel({ label: long }).length).toBeLessThanOrEqual(22);
  });
});
