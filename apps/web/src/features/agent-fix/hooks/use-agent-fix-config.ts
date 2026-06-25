"use client";

import React from "react";
import {
  codeAgentCustomApi,
  type CodeAgentCustomEntry,
} from "@/api/ws-api";
import { AGENT_OPTIONS, getInteractiveAgentParams } from "@/features/wiki/components/AgentSelect";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import { useAgentFixLastAgentId } from "@/shared/stores/use-ui-pref-hooks";
import type { AgentFixAgentOption } from "@/features/agent-fix/types";

export function useAgentFixConfig() {
  const [agentCustomSettings, setAgentCustomSettings] = React.useState<
    Record<string, { cmd?: string; flags?: string; enabled?: boolean }>
  >({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);
  const [lastAgentId, setLastAgentId] = useAgentFixLastAgentId();
  const [selectedAgentId, setSelectedAgentIdState] = React.useState<string>(lastAgentId || "codex");
  const [runConfigByAgentId, setRunConfigByAgentId] = React.useState<
    Record<string, TerminalAgentRunConfigInput | null | undefined>
  >({});

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
        const savedAgentId =
          lastAgentId ||
          (typeof saved?.center_fix_terminal_default_agent === "string"
            ? saved.center_fix_terminal_default_agent
            : null);
        if (savedAgentId) {
          setSelectedAgentIdState(savedAgentId);
        }
      })
      .catch(() => {});
  }, [lastAgentId]);

  const availableAgents = React.useMemo<AgentFixAgentOption[]>(
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
      setSelectedAgentIdState(availableAgents[0].id);
    }
  }, [availableAgents, selectedAgent]);

  const setSelectedAgentId = React.useCallback(
    (agentId: string) => {
      setSelectedAgentIdState(agentId);
      setLastAgentId(agentId);
    },
    [setLastAgentId],
  );

  const setRunConfigForAgent = React.useCallback(
    (agentId: string, value: TerminalAgentRunConfigInput | null) => {
      setRunConfigByAgentId((current) => ({
        ...current,
        [agentId]: value,
      }));
    },
    [],
  );

  return {
    availableAgents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
    runConfigByAgentId,
    setRunConfigForAgent,
    rememberSelectedAgent: setLastAgentId,
  };
}
