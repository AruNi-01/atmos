import type { TerminalAgentDefinition } from "@/features/agent/lib/terminal-agent-definitions";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import { functionSettingsApi } from "@/api/ws/settings-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";

/** Default: YOLO / skip-permissions mode is on for agents that support it. */
export const DEFAULT_AGENT_YOLO_MODE = true;

export function readYoloModeFromSettings(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  const agentCli = settings?.agent_cli as Record<string, unknown> | undefined;
  if (typeof agentCli?.yolo_mode === "boolean") {
    return agentCli.yolo_mode;
  }
  return DEFAULT_AGENT_YOLO_MODE;
}

/** Resolve headless + interactive flag strings for an agent under YOLO on/off. */
export function resolveAgentLaunchFlags(
  agent: Pick<
    TerminalAgentDefinition,
    "params" | "interactiveParams" | "yoloParams" | "yoloInteractiveParams"
  >,
  yoloEnabled: boolean,
): { params: string; interactiveParams: string } {
  const hasYoloVariant =
    agent.yoloParams !== undefined || agent.yoloInteractiveParams !== undefined;

  if (!yoloEnabled || !hasYoloVariant) {
    return {
      params: agent.params || "",
      interactiveParams: agent.interactiveParams ?? "",
    };
  }

  return {
    params: agent.yoloParams ?? agent.params ?? "",
    interactiveParams:
      agent.yoloInteractiveParams !== undefined
        ? agent.yoloInteractiveParams
        : (agent.interactiveParams ?? ""),
  };
}

/** Whether this built-in agent has a distinct YOLO parameter set. */
export function agentSupportsYoloMode(agentId: string): boolean {
  const agent = TERMINAL_AGENT_DEFINITIONS.find((item) => item.id === agentId);
  if (!agent) return false;
  return (
    agent.yoloParams !== undefined || agent.yoloInteractiveParams !== undefined
  );
}

export async function loadAgentYoloMode(): Promise<boolean> {
  try {
    const settings = await useFunctionSettingsStore.getState().load();
    return readYoloModeFromSettings(settings as Record<string, unknown>);
  } catch {
    return DEFAULT_AGENT_YOLO_MODE;
  }
}

export async function setAgentYoloMode(enabled: boolean): Promise<void> {
  await functionSettingsApi.update("agent_cli", "yolo_mode", enabled);
  useFunctionSettingsStore.getState().invalidate();
  await useFunctionSettingsStore.getState().load();
}
