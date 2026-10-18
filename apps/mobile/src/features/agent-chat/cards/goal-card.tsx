import { Text, View } from "react-native";
import type { GrokGoal } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { GoalIcon } from "@/ui/icons/lucide-native";
import { copy, sentenceStatus } from "../copy";
import { CARD_BODY, CARD_GAP, CardBulletRow, CardHeader, CardStatusBadge } from "./expanded-card";

export function GoalCard({ goal }: { goal: GrokGoal }) {
  const theme = useMobileTheme();
  const objective = goal.objective.trim() || copy.grokGoalTitle;
  const phase = sentenceStatus(goal.phase);
  const body = { color: theme.colors.secondaryLabel, ...CARD_BODY };
  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader icon={GoalIcon} title={objective} />
      <View style={{ alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <CardStatusBadge label={sentenceStatus(goal.status)} />
        {phase ? <Text style={body}>{phase}</Text> : null}
      </View>
      {goal.children.map((child) => (
        <CardBulletRow key={child.id} text={child.label} />
      ))}
    </View>
  );
}
