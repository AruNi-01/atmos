// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it, mock } from "bun:test";

const setNativeChatAgentEnabled = mock(async () => ({ success: true }));
const listNativeChatAgents = mock(async () => ({
  agents: [{ id: "claude", cli_present: true }],
}));
const listRegistry = mock(async () => ({ agents: [] as Array<{ id: string }> }));
const installRegistry = mock(async () => ({
  registry_id: "x",
  installed: true,
  install_method: "npm",
  message: "ok",
}));
const setRegistryAgentEnabled = mock(async () => ({ success: true }));
const setCustomAgentEnabled = mock(async () => ({ success: true }));
const preloadCustomAgent = mock(async () => ({ success: true }));

mock.module("@/api/ws-api", () => ({
  agentApi: {
    setNativeChatAgentEnabled,
    listNativeChatAgents,
    listRegistry,
    installRegistry,
    setRegistryAgentEnabled,
    setCustomAgentEnabled,
    preloadCustomAgent,
  },
}));

const { enableChatForOnboardingAgents } = await import(
  "../enable-chat-for-onboarding-agents"
);

describe("enableChatForOnboardingAgents progress", () => {
  beforeEach(() => {
    setNativeChatAgentEnabled.mockClear();
    listNativeChatAgents.mockClear();
    listNativeChatAgents.mockImplementation(async () => ({
      agents: [{ id: "claude", cli_present: true }],
    }));
    listRegistry.mockClear();
    listRegistry.mockImplementation(async () => ({ agents: [] }));
    installRegistry.mockClear();
    setRegistryAgentEnabled.mockClear();
    setCustomAgentEnabled.mockClear();
    preloadCustomAgent.mockClear();
    preloadCustomAgent.mockImplementation(async () => ({ success: true }));
  });

  it("reports only native when Chat CLI already covers the selection", async () => {
    const steps: Array<{ step: string; current: number; total: number }> = [];
    await enableChatForOnboardingAgents({
      selectedTerminalIds: ["claude"],
      enableDeepSeek: false,
      onProgress: (progress) => steps.push({ ...progress }),
    });

    expect(steps).toEqual([{ step: "native", current: 1, total: 1 }]);
    expect(setNativeChatAgentEnabled).toHaveBeenCalledWith("claude", true);
    expect(listRegistry).not.toHaveBeenCalled();
    expect(installRegistry).not.toHaveBeenCalled();
    expect(setCustomAgentEnabled).not.toHaveBeenCalled();
  });

  it("enables DeepSeek and starts npx preload without awaiting it", async () => {
    let resolvePreload: (() => void) | undefined;
    const preloadGate = new Promise<void>((resolve) => {
      resolvePreload = resolve;
    });
    preloadCustomAgent.mockImplementation(
      () =>
        new Promise((resolve) => {
          void preloadGate.then(() => resolve({ success: true }));
        }),
    );

    const steps: Array<{ step: string; current: number; total: number }> = [];
    await enableChatForOnboardingAgents({
      selectedTerminalIds: ["claude"],
      enableDeepSeek: true,
      onProgress: (progress) => steps.push({ ...progress }),
    });

    expect(steps).toEqual([
      { step: "native", current: 1, total: 2 },
      { step: "deepseek", current: 2, total: 2 },
    ]);
    expect(setCustomAgentEnabled).toHaveBeenCalledWith("deepseek-harness", true);
    expect(preloadCustomAgent).toHaveBeenCalledWith("deepseek-harness");
    resolvePreload?.();
  });

  it("binds native ACP CLIs and skips adapter npm downloads", async () => {
    listNativeChatAgents.mockImplementation(async () => ({
      agents: [{ id: "claude", cli_present: true }],
    }));
    listRegistry.mockImplementation(async () => ({
      agents: [
        {
          id: "claude-acp",
          name: "Claude Agent",
          installed: false,
          provision_kind: "adapter",
          terminal_agent_id: "claude",
        },
        {
          id: "cursor",
          name: "Cursor",
          installed: true,
          provision_kind: "native",
          terminal_agent_id: "cursor",
        },
      ],
    }));

    const steps: Array<{ step: string; current: number; total: number }> = [];
    await enableChatForOnboardingAgents({
      selectedTerminalIds: ["claude", "cursor"],
      enableDeepSeek: false,
      onProgress: (progress) => steps.push({ ...progress }),
    });

    expect(steps).toEqual([
      { step: "native", current: 1, total: 2 },
      { step: "acp", current: 2, total: 2 },
    ]);
    expect(installRegistry).toHaveBeenCalledWith("cursor");
    expect(installRegistry).not.toHaveBeenCalledWith("claude-acp");
  });
});
