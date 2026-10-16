import { Text, View } from "react-native";
import type { GrokGoal } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { copy } from "../copy";

export function GoalCard({ goal }: { goal: GrokGoal }) {
  const theme = useMobileTheme();
  const objective = goal.objective.trim() || copy.grokGoalTitle;
  const body = { color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.label, fontSize: 16, fontWeight: "700", lineHeight: 21 }}>
        {objective}
      </Text>
      <Text style={body}>{goal.status}</Text>
      {goal.phase.trim() ? <Text style={body}>{goal.phase}</Text> : null}
      {goal.children.map((child) => (
        <Text key={child.id} style={body}>
          {child.label}
        </Text>
      ))}
    </View>
  );
}
