import React from "react";

import { codeAgentCustomApi, type CodeAgentCustomEntry } from "@/api/ws-api";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import { AGENT_OPTIONS } from "@/features/wiki/components/AgentSelect";
import { useFunctionSettingsStore } from "@/features/settings/hooks/use-function-settings-store";

export type TerminalQuickOpenAgent = {
  agent: TerminalPaneAgent;
  command: string;
};

export function useCenterStageTerminalAgents(isSetupBlocking: boolean) {
  const [defaultAgentId, setDefaultAgentId] = React.useState<string>("claude");
  const [agentCustomSettings, setAgentCustomSettings] = React.useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);

  React.useEffect(() => {
    if (isSetupBlocking) return;
    Promise.all([
      useFunctionSettingsStore.getState().load(),
      codeAgentCustomApi.get(),
    ]).then(([settings, customData]) => {
      const saved = (settings as Record<string, unknown>)?.agent_cli as Record<string, unknown> | undefined;
      const allAgents = Array.isArray(customData?.agents) ? customData.agents : [];
      const builtInEntries = allAgents.filter((agent: CodeAgentCustomEntry) =>
        AGENT_OPTIONS.some((option) => option.id === agent.id)
      );
      const builtInSettings = Object.fromEntries(
        builtInEntries.map((agent: CodeAgentCustomEntry) => [agent.id, { cmd: agent.cmd, flags: agent.flags, enabled: agent.enabled !== false }])
      );
      setAgentCustomSettings(builtInSettings);
      const agentId = saved?.center_fix_terminal_default_agent as string | undefined;
      if (agentId) {
        const isBuiltIn = AGENT_OPTIONS.some((agent) => agent.id === agentId);
        const isCustom = customData?.agents?.some((agent: CodeAgentCustomEntry) => agent.id === agentId);
        if (isBuiltIn || isCustom) {
          setDefaultAgentId(agentId);
        }
      }
      if (customData?.agents && Array.isArray(customData.agents)) {
        setCustomAgents(customData.agents.filter((agent: CodeAgentCustomEntry) =>
          !AGENT_OPTIONS.some((option) => option.id === agent.id) && agent.label && agent.cmd
        ));
      }
    }).catch(() => {});
  }, [isSetupBlocking]);

  const visibleBuiltInAgents = React.useMemo(
    () => AGENT_OPTIONS.filter((agent) => (agentCustomSettings[agent.id]?.enabled ?? true)),
    [agentCustomSettings]
  );
  const visibleCustomAgents = React.useMemo(
    () => customAgents.filter((agent) => agent.enabled !== false),
    [customAgents]
  );
  const terminalQuickOpenAgents = React.useMemo<TerminalQuickOpenAgent[]>(
    () => [
      ...visibleBuiltInAgents.map((agent) => {
        const custom = agentCustomSettings[agent.id];
        const cmd = custom?.cmd?.trim() || agent.cmd;
        const flags = custom?.flags?.trim() || agent.params || "";
        const parts = [cmd];
        if (flags) parts.push(flags);
        return {
          agent: {
            id: agent.id,
            label: agent.label,
            command: cmd,
            iconType: "built-in",
            pipeCommand: "useEcho" in agent && agent.useEcho ? cmd : undefined,
          } satisfies TerminalPaneAgent,
          command: parts.join(" "),
        };
      }),
      ...visibleCustomAgents.map((agent) => {
        const cmd = agent.cmd.trim();
        const flags = agent.flags?.trim() || "";
        return {
          agent: {
            id: agent.id,
            label: agent.label,
            command: cmd,
            iconType: "custom",
          } satisfies TerminalPaneAgent,
          command: flags ? `${cmd} ${flags}` : cmd,
        };
      }),
    ],
    [agentCustomSettings, visibleBuiltInAgents, visibleCustomAgents]
  );

  return {
    defaultAgentId,
    terminalQuickOpenAgents,
  };
}
