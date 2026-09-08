import { describe, expect, test } from "bun:test";
import {
  hasTerminalAgentInstallGuide,
  nativeChatHostIdForInstallGuide,
  nativeChatInstallGuideId,
  preferredAgentInstallCommand,
  TERMINAL_AGENT_INSTALL_GUIDES,
} from "../terminal-agent-install-guides";

describe("terminal-agent-install-guides", () => {
  test("covers primary built-in agent families with at least one runnable command", () => {
    for (const id of [
      "claude",
      "codex",
      "gemini",
      "cursor",
      "grok-build",
      "opencode",
      "pi",
      "antigravity",
      "droid",
      "amp",
      "kimi",
      "kilocode",
      "openclaw",
      "hermes",
    ]) {
      expect(hasTerminalAgentInstallGuide(id)).toBe(true);
      const macos = preferredAgentInstallCommand(id, "macos");
      expect(macos && macos.length > 0).toBe(true);
    }
  });

  test("maps Native Chat hosts onto onboarding install guides", () => {
    expect(nativeChatInstallGuideId("grok")).toBe("grok-build");
    expect(nativeChatInstallGuideId("claude")).toBe("claude");
    expect(nativeChatHostIdForInstallGuide("grok-build")).toBe("grok");
    expect(hasTerminalAgentInstallGuide(nativeChatInstallGuideId("grok"))).toBe(true);
  });

  test("exposes multiple install types when vendors support them", () => {
    const claudeMac = TERMINAL_AGENT_INSTALL_GUIDES.claude.macos.map((m) => m.type);
    expect(claudeMac).toContain("Native");
    expect(claudeMac).toContain("Homebrew");
    expect(claudeMac).toContain("npm");

    const codexMac = TERMINAL_AGENT_INSTALL_GUIDES.codex.macos.map((m) => m.type);
    expect(codexMac).toContain("Native");
    expect(codexMac).toContain("npm");
  });

  test("prefers Native installer command on macOS for Claude", () => {
    expect(preferredAgentInstallCommand("claude", "macos")).toBe(
      "curl -fsSL https://claude.ai/install.sh | bash",
    );
  });
});
