// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { useTranslations } from "next-intl";

const add = mock(() => "toast-1");
const update = mock(() => {});

mock.module("@workspace/ui", () => ({
  toastManager: { add, update },
}));

const enableChatForOnboardingAgents = mock(async () => ({
  enabledNativeHosts: ["claude"],
  acpFailed: [] as string[],
  deepseekFailed: false,
}));

mock.module("@/features/agent/lib/enable-chat-for-onboarding-agents", () => ({
  enableChatForOnboardingAgents,
}));

const { startOnboardingChatSetup } = await import("../start-onboarding-chat-setup");

const COPY: Record<string, string> = {
  "agents.provisioning": "Setting up Chat mode…",
  "agents.provisioningProgress": "{current} of {total}",
  "agents.provisionReadyTitle": "Chat mode is ready",
  "agents.provisionReady": "You're all set.",
  "agents.provisionFailedTitle": "Couldn't finish Chat mode setup",
  "agents.provisionFailed": "{names} still need setup. You can finish this later in Agents.",
  "agents.provisionFailedGeneric":
    "Chat mode setup didn't finish. You can try again later in Agents.",
};

const t = ((key: string, values?: Record<string, string | number>) => {
  const template = COPY[key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? `{${name}}`),
  );
}) as ReturnType<typeof useTranslations>;

describe("startOnboardingChatSetup", () => {
  beforeEach(() => {
    add.mockClear();
    update.mockClear();
    enableChatForOnboardingAgents.mockClear();
    enableChatForOnboardingAgents.mockImplementation(async () => ({
      enabledNativeHosts: ["claude"],
      acpFailed: [],
      deepseekFailed: false,
    }));
  });

  it("shows a loading toast then success without throwing to the caller", async () => {
    await startOnboardingChatSetup({
      selectedTerminalIds: ["claude"],
      enableDeepSeek: false,
      t,
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]?.[0]).toMatchObject({
      title: "Setting up Chat mode…",
      description: "1 of 2",
      type: "loading",
      timeout: 0,
      data: { progress: 0.5 },
    });
    expect(enableChatForOnboardingAgents).toHaveBeenCalledTimes(1);
    const lastUpdate = update.mock.calls.at(-1)?.[1] as { type?: string; title?: string };
    expect(lastUpdate).toMatchObject({
      type: "success",
      title: "Chat mode is ready",
    });
  });

  it("updates the same toast when some providers fail", async () => {
    enableChatForOnboardingAgents.mockImplementation(async () => ({
      enabledNativeHosts: ["claude"],
      acpFailed: ["Codex"],
      deepseekFailed: false,
    }));

    await startOnboardingChatSetup({
      selectedTerminalIds: ["claude", "codex"],
      enableDeepSeek: false,
      t,
    });

    const lastUpdate = update.mock.calls.at(-1)?.[1] as {
      type?: string;
      description?: string;
    };
    expect(lastUpdate?.type).toBe("error");
    expect(lastUpdate?.description).toContain("Codex");
  });

  it("forwards onProgress into toast updates", async () => {
    enableChatForOnboardingAgents.mockImplementation(async (options: {
      onProgress?: (progress: {
        step: "native" | "acp" | "deepseek";
        current: number;
        total: number;
      }) => void;
    }) => {
      options.onProgress?.({ step: "native", current: 1, total: 2 });
      options.onProgress?.({ step: "acp", current: 2, total: 2 });
      return {
        enabledNativeHosts: ["claude"],
        acpFailed: [],
        deepseekFailed: false,
      };
    });

    await startOnboardingChatSetup({
      selectedTerminalIds: ["claude"],
      enableDeepSeek: false,
      t,
    });

    const loadingUpdates = update.mock.calls
      .map((call) => call[1] as { type?: string; description?: string; data?: { progress?: number } })
      .filter((payload) => payload.type === "loading");
    expect(loadingUpdates.some((payload) => payload.description === "1 of 2")).toBe(true);
    expect(loadingUpdates.some((payload) => payload.data?.progress === 1)).toBe(true);
  });
});
