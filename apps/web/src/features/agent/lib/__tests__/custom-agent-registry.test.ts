import { describe, expect, it } from "bun:test";
import type { CustomAgent, NativeChatAgent, RegistryAgent } from "@/api/ws/agent-api";
import {
  authRequiredFromTurnError,
  customAgentToRegistry,
  DEEPSEEK_HARNESS_ID,
  DEEPSEEK_HARNESS_ARGS,
  isSecretEnvKey,
  isTokenAuthMethodId,
  mergeInstalledAgents,
  sortAcpRegistryAgents,
  tokenAuthEnvName,
} from "@/features/agent/lib/custom-agent-registry";

function custom(partial: Partial<CustomAgent> & Pick<CustomAgent, "name" | "command">): CustomAgent {
  return {
    type: "custom",
    args: [],
    env: {},
    builtin: false,
    has_overlay: true,
    ...partial,
  };
}

describe("custom agent registry merge", () => {
  it("maps DeepSeek Harness into an installed chat picker row", () => {
    const agent = custom({
      name: DEEPSEEK_HARNESS_ID,
      display_name: "DeepSeek Harness",
      command: "npx",
      args: ["-y", "@deepseek-ai/dsh@0.1.2-alpha.5", "--profile", "acp"],
      builtin: true,
      has_overlay: false,
    });
    const row = customAgentToRegistry(agent);
    expect(row.id).toBe(DEEPSEEK_HARNESS_ID);
    expect(row.name).toBe("DeepSeek Harness");
    expect(row.installed).toBe(true);
    expect(row.install_method).toBe("custom");
    expect(row.can_remove).toBe(false);
    expect(row.icon).toBe("/agents/deepseek.svg");
    expect(row.cli_command).toContain("--profile acp");
  });

  it("omits disabled builtin custom agents from the chat picker", () => {
    const installed: RegistryAgent[] = [
      {
        id: "claude-acp",
        name: "Claude Code",
        version: "1",
        description: "",
        repository: null,
        icon: null,
        cli_command: "claude",
        install_method: "npx",
        package: null,
        installed: true,
      },
    ];
    const merged = mergeInstalledAgents(installed, [
      custom({
        name: DEEPSEEK_HARNESS_ID,
        command: "npx",
        display_name: "DeepSeek Harness",
        builtin: true,
        has_overlay: false,
        enabled: false,
      }),
    ]);
    expect(merged.map((agent) => agent.id)).toEqual(["claude-acp"]);
  });

  it("includes an enabled builtin custom agent in the chat picker", () => {
    const installed: RegistryAgent[] = [
      {
        id: "claude-acp",
        name: "Claude Code",
        version: "1",
        description: "",
        repository: null,
        icon: null,
        cli_command: "claude",
        install_method: "npx",
        package: null,
        installed: true,
      },
    ];
    const merged = mergeInstalledAgents(installed, [
      custom({
        name: DEEPSEEK_HARNESS_ID,
        command: "npx",
        display_name: "DeepSeek Harness",
        builtin: true,
        enabled: true,
      }),
    ]);
    expect(merged.map((agent) => agent.id)).toEqual(["claude-acp", DEEPSEEK_HARNESS_ID]);
  });

  it("appends custom agents that are not already in the registry list", () => {
    const installed: RegistryAgent[] = [
      {
        id: "claude-acp",
        name: "Claude Code",
        version: "1",
        description: "",
        repository: null,
        icon: null,
        cli_command: "claude",
        install_method: "npx",
        package: null,
        installed: true,
      },
    ];
    const merged = mergeInstalledAgents(installed, [
      custom({ name: "my-kiro", command: "kiro-cli" }),
    ]);
    expect(merged.map((agent) => agent.id)).toEqual(["claude-acp", "my-kiro"]);
  });

  it("opens a token auth request from the DeepSeek missing-key prompt error", () => {
    const payload = authRequiredFromTurnError(
      'Internal error: turn failed: llm-deepseek: no API key for provider route "deepseek-official"; store DEEPSEEK_API_KEY',
      DEEPSEEK_HARNESS_ID,
    );
    expect(payload?.methods[0]?.id).toBe("token:DEEPSEEK_API_KEY");
    expect(isTokenAuthMethodId(payload?.methods[0]?.id ?? "")).toBe(true);
    expect(tokenAuthEnvName(payload?.methods[0]?.id ?? "")).toBe("DEEPSEEK_API_KEY");
  });

  it("redacts secret env keys in the manager card", () => {
    expect(isSecretEnvKey("DEEPSEEK_API_KEY")).toBe(true);
    expect(isSecretEnvKey("PATH")).toBe(false);
  });

  it("pins the DeepSeek Harness ACP package argv", () => {
    expect(DEEPSEEK_HARNESS_ARGS).toEqual([
      "-y",
      "@deepseek-ai/dsh@0.1.2-alpha.5",
      "--profile",
      "acp",
    ]);
  });
});

function native(partial: Partial<NativeChatAgent> & Pick<NativeChatAgent, "id" | "name">): NativeChatAgent {
  return {
    description: "",
    executable: partial.id,
    enabled: false,
    cli_present: true,
    ...partial,
  };
}

function registry(id: string, name: string): RegistryAgent {
  return {
    id,
    name,
    version: "1",
    description: "",
    repository: null,
    icon: null,
    cli_command: id,
    install_method: "npx",
    package: null,
    installed: true,
  };
}

describe("native chat picker merge", () => {
  it("omits disabled native hosts from the chat picker", () => {
    const merged = mergeInstalledAgents(
      [registry("codex-acp", "Codex")],
      [],
      [native({ id: "codex", name: "Codex", enabled: false })],
    );
    expect(merged.map((agent) => agent.id)).toEqual(["codex-acp"]);
  });

  it("includes an enabled native host and hides the ACP alias", () => {
    const merged = mergeInstalledAgents(
      [registry("codex-acp", "Codex"), registry("claude-acp", "Claude Code")],
      [],
      [native({ id: "codex", name: "Codex", enabled: true })],
    );
    expect(merged.map((agent) => agent.id)).toEqual(["codex", "claude-acp"]);
  });

  it("hides grok-build when native grok is enabled", () => {
    const merged = mergeInstalledAgents(
      [registry("grok-build", "Grok")],
      [],
      [native({ id: "grok", name: "Grok", enabled: true })],
    );
    expect(merged.map((agent) => agent.id)).toEqual(["grok"]);
  });

  it("prefers the native opencode row over the ACP row with the same id", () => {
    const merged = mergeInstalledAgents(
      [registry("opencode", "OpenCode")],
      [],
      [native({ id: "opencode", name: "OpenCode", enabled: true })],
    );
    expect(merged.map((agent) => agent.id)).toEqual(["opencode"]);
    expect(merged[0]?.install_method).toBe("native_chat");
  });
});

describe("ACP manager list sort", () => {
  it("puts installed registry agents first", () => {
    const sorted = sortAcpRegistryAgents([
      { ...registry("gemini", "Gemini"), installed: false },
      { ...registry("codex-acp", "Codex"), installed: true },
      { ...registry("cursor", "Cursor"), installed: false },
      { ...registry("claude-acp", "Claude Code"), installed: true },
    ]);
    expect(sorted.map((agent) => agent.id)).toEqual([
      "claude-acp",
      "codex-acp",
      "cursor",
      "gemini",
    ]);
  });
});
