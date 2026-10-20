import { View } from "react-native";
import type { GrokGoal } from "@atmos/api-types/ws/dto/agent-chat";
import { GoalIcon } from "@/ui/icons/lucide-native";
import { copy, sentenceStatus } from "../copy";
import { CARD_GAP, CardBulletRow, CardHeader, CardStatusRow } from "./expanded-card";

export function GoalCard({ goal }: { goal: GrokGoal }) {
  const objective = goal.objective.trim() || copy.grokGoalTitle;
  const phase = sentenceStatus(goal.phase);
  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader icon={GoalIcon} title={objective} />
      <CardStatusRow badge={sentenceStatus(goal.status)} text={phase} />
      {goal.children.map((child) => (
        <CardBulletRow key={child.id} text={child.label} />
      ))}
    </View>
  );
}
