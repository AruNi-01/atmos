import terminalAgents from "@atmos/resources/terminal-agents/builtin_agents.json";
import type { CodeAgentCustomEntry } from "@atmos/api-types/ws/dto/settings";

export type MobileLaunchAgent = {
  command: string;
  iconType: "built-in" | "custom";
  id: string;
  label: string;
};

type BuiltinLaunchAgent = {
  cmd: string;
  id: string;
  interactiveParams?: string;
  label: string;
  params?: string;
  yoloInteractiveParams?: string;
  yoloParams?: string;
};

const BUILTIN_LAUNCH_AGENTS = terminalAgents as BuiltinLaunchAgent[];

export function mergeTerminalLaunchAgents(
  custom: readonly CodeAgentCustomEntry[] | null | undefined,
  builtins: readonly BuiltinLaunchAgent[] = BUILTIN_LAUNCH_AGENTS,
): MobileLaunchAgent[] {
  const overrides = new Map((custom ?? []).map((agent) => [agent.id, agent]));
  const builtinIds = new Set(builtins.map((agent) => agent.id));
  const builtIn = builtins.flatMap((agent) => {
    const override = overrides.get(agent.id);
    if (override?.enabled === false) return [];
    const cmd = override?.cmd?.trim() || agent.cmd;
    return [launchAgent(agent.id, override?.label?.trim() || agent.label, cmd, interactiveFlags(agent, override), "built-in")];
  });
  const extra = (custom ?? []).flatMap((agent) => {
    if (builtinIds.has(agent.id) || agent.enabled === false) return [];
    const label = agent.label.trim();
    const cmd = agent.cmd.trim();
    if (!label || !cmd) return [];
    const flags = agent.interactiveFlags?.trim() || agent.flags.trim();
    return [launchAgent(agent.id, label, cmd, flags, "custom")];
  });
  return [...builtIn, ...extra];
}

function interactiveFlags(agent: BuiltinLaunchAgent, override: CodeAgentCustomEntry | undefined) {
  const overrideInteractive = override?.interactiveFlags?.trim();
  if (overrideInteractive) return overrideInteractive;
  const defaultParams = agent.yoloParams?.trim() || agent.params?.trim() || "";
  const overrideFlags = override?.flags?.trim();
  if (overrideFlags && overrideFlags !== defaultParams) return overrideFlags;
  return agent.yoloInteractiveParams?.trim() || agent.interactiveParams?.trim() || agent.params?.trim() || "";
}

function launchAgent(
  id: string,
  label: string,
  cmd: string,
  flags: string,
  iconType: MobileLaunchAgent["iconType"],
): MobileLaunchAgent {
  return {
    command: flags ? `${cmd} ${flags}` : cmd,
    iconType,
    id,
    label,
  };
}
