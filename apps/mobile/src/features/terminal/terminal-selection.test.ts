// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { MobileTerminalEntry } from "@/stores/terminal-store";
import type { TerminalWorkspaceCandidate } from "@/api/types";
import {
  createDefaultTerminalEntry,
  mergeTerminalCandidateEntries,
  nextActiveTerminalEntryId,
  resolveActiveTerminalEntry,
  sortTerminalEntries,
} from "./terminal-selection";

function entry(id: string): MobileTerminalEntry {
  return {
    id,
    workspaceId: "workspace",
    label: id,
  };
}

function candidate(
  partial: Partial<TerminalWorkspaceCandidate> & Pick<TerminalWorkspaceCandidate, "id" | "label">,
): TerminalWorkspaceCandidate {
  return {
    active: false,
    workspace_id: "workspace",
    ...partial,
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
    const [merged] = mergeTerminalCandidateEntries(
      "workspace",
      [
        candidate({
          active: true,
          id: "session:server-session",
          label: "Server terminal",
          session_id: "server-session",
          tmux_window_index: 2,
          tmux_window_name: "server-window",
        }),
      ],
      [],
    );

    expect(merged?.sessionId?.startsWith("workspace:mobile:")).toBe(true);
    expect(merged?.sessionId).not.toBe("server-session");
    expect(merged?.tmuxWindowIndex).toBe(2);
    expect(merged?.tmuxWindowName).toBe("server-window");
  });

  test("drops the synthetic default once server candidates arrive", () => {
    const defaultEntry = createDefaultTerminalEntry("workspace");
    const entries = mergeTerminalCandidateEntries(
      "workspace",
      [
        candidate({
          id: "tmux:workspace:1",
          label: "Existing",
          tmux_window_index: 1,
          tmux_window_name: "Existing",
        }),
      ],
      [defaultEntry],
    );

    expect(entries.map((item) => item.id)).toEqual(["tmux:workspace:1"]);
  });

  test("preserves session id and dynamic title by candidate id only", () => {
    const entries = mergeTerminalCandidateEntries(
      "workspace",
      [
        candidate({
          id: "tmux:workspace:1",
          label: "Existing",
          tmux_window_index: 1,
          tmux_window_name: "Existing",
        }),
      ],
      [
        {
          id: "tmux:workspace:1",
          workspaceId: "workspace",
          label: "Existing",
          sessionId: "workspace:mobile:old",
          tmuxWindowName: "Existing",
          dynamicTitle: "npm test",
        },
      ],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.sessionId).toBe("workspace:mobile:old");
    expect(entries[0]?.dynamicTitle).toBe("npm test");
  });

  test("does not collapse distinct ids that share a tmux window name", () => {
    const entries = mergeTerminalCandidateEntries(
      "workspace",
      [
        candidate({
          id: "tab:one",
          label: "zsh",
          tmux_window_index: 1,
          tmux_window_name: "zsh",
        }),
        candidate({
          id: "tab:one:pane",
          label: "zsh",
          tmux_window_index: 1,
          tmux_window_name: "zsh",
        }),
      ],
      [],
    );

    expect(entries.map((item) => item.id)).toEqual(["tab:one", "tab:one:pane"]);
  });

  test("sorts by tmux window index, then label, then id", () => {
    const entries = sortTerminalEntries([
      { id: "c", workspaceId: "workspace", label: "beta", tmuxWindowIndex: 2 },
      { id: "b", workspaceId: "workspace", label: "alpha", tmuxWindowIndex: 2 },
      { id: "a", workspaceId: "workspace", label: "gamma", tmuxWindowIndex: 1 },
      { id: "z", workspaceId: "workspace", label: "missing" },
    ]);

    expect(entries.map((item) => item.id)).toEqual(["a", "b", "c", "z"]);
  });

  test("appends new local terminals after server candidates", () => {
    const entries = mergeTerminalCandidateEntries(
      "workspace",
      [
        candidate({
          id: "tmux:workspace:2",
          label: "Later",
          tmux_window_index: 2,
        }),
      ],
      [
        {
          id: "workspace:mobile-local",
          workspaceId: "workspace",
          label: "Terminal 2",
          isNew: true,
        },
      ],
    );

    expect(entries.map((item) => item.id)).toEqual(["tmux:workspace:2", "workspace:mobile-local"]);
  });
});
