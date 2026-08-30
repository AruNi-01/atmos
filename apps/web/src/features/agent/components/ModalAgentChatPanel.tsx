"use client";

import { useEffect } from "react";
import { AgentChatPanel } from "@/features/agent/components/AgentChatPanel";
import { useAgentChatUrl } from "@/features/agent/hooks/use-agent-chat-url";
import { FOOTER_MODAL_CHAT_INSTANCE_KEY } from "@/features/agent/lib/agent-chat-working-directory";
import { useExperimentSettingsStore } from "@/features/settings/store/experiment-settings-store";

/** Floating Agent Chat from the footer. Center-stage Chat tabs stay a separate surface. */
export function ModalAgentChatPanel() {
  const launchpadAgentsEnabled = useExperimentSettingsStore((s) => s.launchpadAgentsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);
  const [isOpen, setAgentChatOpen] = useAgentChatUrl();

  useEffect(() => {
    void loadExperimentSettings();
  }, [loadExperimentSettings]);

  useEffect(() => {
    if (!launchpadAgentsEnabled) {
      void setAgentChatOpen(false);
    }
  }, [launchpadAgentsEnabled, setAgentChatOpen]);

  if (!launchpadAgentsEnabled || !isOpen) {
    return null;
  }

  return (
    <AgentChatPanel
      variant="modal"
      instanceKey={FOOTER_MODAL_CHAT_INSTANCE_KEY}
      contextOverride={{
        workspaceId: null,
        projectId: null,
        effectiveContextId: null,
        currentView: "agents",
      }}
      onClose={() => {
        void setAgentChatOpen(false);
      }}
    />
  );
}
