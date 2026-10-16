import { Text, View } from "react-native";
import type { GrokWorkflow } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { copy } from "../copy";

export function WorkflowCard({ workflow }: { workflow: GrokWorkflow }) {
  const theme = useMobileTheme();
  const heading = workflow.objective.trim() || workflow.name.trim() || copy.grokWorkflowTitle;
  const body = { color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.label, fontSize: 16, fontWeight: "700", lineHeight: 21 }}>
        {heading}
      </Text>
      <Text style={body}>{workflow.status}</Text>
      {workflow.phases.map((phase) => (
        <Text key={phase.id} style={body}>
          {phase.title}
        </Text>
      ))}
    </View>
  );
}
