// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it, mock } from "bun:test";

const setNativeChatAgentEnabled = mock(async () => ({ success: true }));
const listRegistry = mock(async () => ({ agents: [] as Array<{ id: string }> }));
const installRegistry = mock(async () => ({
  registry_id: "x",
  installed: true,
  install_method: "npm",
  message: "ok",
}));
const setCustomAgentEnabled = mock(async () => ({ success: true }));
const preloadCustomAgent = mock(async () => ({ success: true }));

mock.module("@/api/ws-api", () => ({
  agentApi: {
    setNativeChatAgentEnabled,
    listRegistry,
    installRegistry,
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
    listRegistry.mockClear();
    installRegistry.mockClear();
    setCustomAgentEnabled.mockClear();
    preloadCustomAgent.mockClear();
  });

  it("reports native then acp when DeepSeek is off", async () => {
    const steps: Array<{ step: string; current: number; total: number }> = [];
    await enableChatForOnboardingAgents({
      selectedTerminalIds: ["claude"],
      enableDeepSeek: false,
      onProgress: (progress) => steps.push({ ...progress }),
    });

    expect(steps).toEqual([
      { step: "native", current: 1, total: 2 },
      { step: "acp", current: 2, total: 2 },
    ]);
    expect(setNativeChatAgentEnabled).toHaveBeenCalledWith("claude", true);
    expect(setCustomAgentEnabled).not.toHaveBeenCalled();
  });

  it("adds a DeepSeek step when opted in", async () => {
    const steps: Array<{ step: string; current: number; total: number }> = [];
    await enableChatForOnboardingAgents({
      selectedTerminalIds: ["claude"],
      enableDeepSeek: true,
      onProgress: (progress) => steps.push({ ...progress }),
    });

    expect(steps).toEqual([
      { step: "native", current: 1, total: 3 },
      { step: "acp", current: 2, total: 3 },
      { step: "deepseek", current: 3, total: 3 },
    ]);
    expect(setCustomAgentEnabled).toHaveBeenCalledWith("deepseek-harness", true);
    expect(preloadCustomAgent).toHaveBeenCalledWith("deepseek-harness");
  });
});
