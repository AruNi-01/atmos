"use client";

import { useEffect } from "react";
import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";
import { useAgentChatUrl } from "@/features/agent/hooks/use-agent-chat-url";
import { useExperimentSettingsStore } from "@/features/settings/store/experiment-settings-store";

/** Floating ACP Agent Chat — only when the experiments setting is enabled. */
export function ModalAgentChatPanel() {
  const launchpadAgentsEnabled = useExperimentSettingsStore((s) => s.launchpadAgentsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);
  const [, setAgentChatOpen] = useAgentChatUrl();

  useEffect(() => {
    void loadExperimentSettings();
  }, [loadExperimentSettings]);

  useEffect(() => {
    if (!launchpadAgentsEnabled) {
      void setAgentChatOpen(false);
    }
  }, [launchpadAgentsEnabled, setAgentChatOpen]);

  if (!launchpadAgentsEnabled) {
    return null;
  }

  return <AgentChatPanel />;
}
