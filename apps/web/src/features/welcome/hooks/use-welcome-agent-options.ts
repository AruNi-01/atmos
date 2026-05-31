"use client";

import React from "react";
import {
  codeAgentCustomApi,
  type CodeAgentCustomEntry,
} from "@/api/ws-api";
import { AGENT_OPTIONS, getInteractiveAgentParams } from "@/features/wiki/components/AgentSelect";
import type { AgentMenuOption } from "@/features/welcome/lib/welcome-page-helpers";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";

export function useWelcomeAgentOptions() {
  const [agentCustomSettings, setAgentCustomSettings] = React.useState<
    Record<string, { cmd?: string; flags?: string; enabled?: boolean }>
  >({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>("codex");

  React.useEffect(() => {
    Promise.all([useFunctionSettingsStore.getState().load(), codeAgentCustomApi.get()])
      .then(([settings, customData]) => {
        const saved = (settings as Record<string, unknown>)?.agent_cli as
          | Record<string, unknown>
          | undefined;
        const allAgents = Array.isArray(customData?.agents) ? customData.agents : [];
        const builtInEntries = allAgents.filter((agent) =>
          AGENT_OPTIONS.some((option) => option.id === agent.id),
        );
        setAgentCustomSettings(
          Object.fromEntries(
            builtInEntries.map((agent) => [
              agent.id,
              { cmd: agent.cmd, flags: agent.flags, enabled: agent.enabled !== false },
            ]),
          ),
        );
        setCustomAgents(
          allAgents.filter(
            (agent) =>
              !AGENT_OPTIONS.some((option) => option.id === agent.id) &&
              !!agent.label &&
              !!agent.cmd &&
              agent.enabled !== false,
          ),
        );
        const savedAgentId = typeof saved?.center_fix_terminal_default_agent === "string"
          ? saved.center_fix_terminal_default_agent
          : null;
        if (savedAgentId) {
          setSelectedAgentId(savedAgentId);
        }
      })
      .catch(() => {});
  }, []);

  const availableAgents = React.useMemo<AgentMenuOption[]>(
    () => [
      ...AGENT_OPTIONS.filter((agent) => agentCustomSettings[agent.id]?.enabled ?? true).map(
        (agent) => {
          const command = agentCustomSettings[agent.id]?.cmd?.trim() || agent.cmd;
          const flags = getInteractiveAgentParams(agent, agentCustomSettings[agent.id]?.flags);
          return {
            id: agent.id,
            label: agent.label,
            command,
            launchCommand: flags ? `${command} ${flags}` : command,
            iconType: "built-in" as const,
          };
        },
      ),
      ...customAgents.map((agent) => {
        const command = agent.cmd.trim();
        const flags = agent.flags?.trim() || "";
        return {
          id: agent.id,
          label: agent.label,
          command,
          launchCommand: flags ? `${command} ${flags}` : command,
          iconType: "custom" as const,
        };
      }),
    ],
    [agentCustomSettings, customAgents],
  );

  const selectedAgent =
    availableAgents.find((agent) => agent.id === selectedAgentId) ?? availableAgents[0] ?? null;

  React.useEffect(() => {
    if (!selectedAgent && availableAgents.length > 0) {
      setSelectedAgentId(availableAgents[0].id);
    }
  }, [availableAgents, selectedAgent]);

  return {
    availableAgents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
  };
}
