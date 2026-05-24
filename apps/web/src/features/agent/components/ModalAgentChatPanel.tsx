"use client";

import { useEffect } from "react";
import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";
import { useAgentChatUrl } from "@/features/agent/hooks/use-agent-chat-url";
import { useExperimentSettings } from "@/features/settings/hooks/use-experiment-settings";

/** Floating ACP Agent Chat — only when the experiments setting is enabled. */
export function ModalAgentChatPanel() {
  const managementAgentsEnabled = useExperimentSettings((s) => s.managementAgentsEnabled);
  const loadExperimentSettings = useExperimentSettings((s) => s.loadSettings);
  const [, setAgentChatOpen] = useAgentChatUrl();

  useEffect(() => {
    void loadExperimentSettings();
  }, [loadExperimentSettings]);

  useEffect(() => {
    if (!managementAgentsEnabled) {
      void setAgentChatOpen(false);
    }
  }, [managementAgentsEnabled, setAgentChatOpen]);

  if (!managementAgentsEnabled) {
    return null;
  }

  return <AgentChatPanel />;
}
