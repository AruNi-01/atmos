import type { AgentMessage, GrokWorkflow } from "@atmos/api-types/ws/dto/agent-chat";
import { grokWorkflowPhaseSections } from "@atmos/agent-transcript";
import { LayersIcon } from "@/ui/icons/lucide-native";
import { useMobileTheme } from "@/theme/theme-store";
import { chatMutedForeground } from "../chat-ink";
import { copy } from "../copy";
import { GrokChromePanel } from "../grok-chrome-panel";
import { grokWorkflowCountLabel } from "../grok-chrome-label";

export function WorkflowCard({
  messages,
  workflow,
}: {
  messages: readonly AgentMessage[];
  workflow: GrokWorkflow;
}) {
  const theme = useMobileTheme();
  const sections = grokWorkflowPhaseSections(workflow, [...messages]);
  return (
    <GrokChromePanel
      collapseAria={copy.grokWorkflowCollapseAria}
      emptyHint={() => null}
      expandAria={copy.grokWorkflowExpandAria}
      fallbackType={copy.grokWorkflowFallback}
      icon={<LayersIcon color={chatMutedForeground(theme.isDark)} size={16} strokeWidth={2} />}
      messages={messages}
      meta={grokWorkflowCountLabel(sections)}
      panelAria={copy.grokWorkflowPanelAria}
      sections={sections}
      title={workflow.objective.trim() || workflow.name.trim() || copy.grokWorkflowTitle}
    />
  );
}
