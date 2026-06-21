// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { MobileTerminalEntry } from "@/stores/terminal-store";
import {
  createDefaultTerminalEntry,
  mergeTerminalCandidateEntries,
  nextActiveTerminalEntryId,
  resolveActiveTerminalEntry,
} from "./terminal-selection";

function entry(id: string): MobileTerminalEntry {
  return {
    id,
    workspaceId: "workspace",
    label: id,
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
});
