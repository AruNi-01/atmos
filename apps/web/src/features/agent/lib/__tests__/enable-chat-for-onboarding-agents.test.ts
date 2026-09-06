import { describe, expect, test } from "bun:test";
import { nativeChatHostsForTerminalSelection } from "../custom-agent-registry";

describe("nativeChatHostsForTerminalSelection", () => {
  test("maps terminal families to Native Chat hosts", () => {
    expect(
      nativeChatHostsForTerminalSelection([
        "claude",
        "codex",
        "pi",
        "opencode",
        "grok-build",
      ]).sort(),
    ).toEqual(["claude", "codex", "grok", "opencode", "pi"]);
  });

  test("accepts ACP registry kinship ids as well", () => {
    expect(
      nativeChatHostsForTerminalSelection(["claude-acp", "codex-acp", "pi-acp"]).sort(),
    ).toEqual(["claude", "codex", "pi"]);
  });

  test("ignores agents without a Native Chat sibling", () => {
    expect(
      nativeChatHostsForTerminalSelection(["cursor", "gemini", "deepseek-harness"]),
    ).toEqual([]);
  });

  test("dedupes when both terminal and ACP ids are selected", () => {
    expect(nativeChatHostsForTerminalSelection(["claude", "claude-acp"])).toEqual([
      "claude",
    ]);
  });
});
