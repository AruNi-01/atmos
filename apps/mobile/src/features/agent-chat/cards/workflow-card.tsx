import { View } from "react-native";
import type { GrokWorkflow } from "@atmos/api-types/ws/dto/agent-chat";
import { LayersIcon } from "@/ui/icons/lucide-native";
import { workflowCountLabel } from "../composer-cards";
import { copy, sentenceStatus } from "../copy";
import { CARD_GAP, CardBulletRow, CardHeader, CardStatusBadge } from "./expanded-card";

export function WorkflowCard({ workflow }: { workflow: GrokWorkflow }) {
  const heading = workflow.objective.trim() || workflow.name.trim() || copy.grokWorkflowTitle;
  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader count={workflowCountLabel(workflow)} icon={LayersIcon} title={heading} />
      <View style={{ alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <CardStatusBadge label={sentenceStatus(workflow.status)} />
      </View>
      {workflow.phases.map((phase) => (
        <CardBulletRow key={phase.id} text={phase.title} />
      ))}
    </View>
  );
}
