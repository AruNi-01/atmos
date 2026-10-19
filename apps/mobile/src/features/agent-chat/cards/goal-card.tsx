import type { AgentMessage, GrokGoal } from "@atmos/api-types/ws/dto/agent-chat";
import {
  formatGrokElapsed,
  formatGrokTokens,
  grokGoalPhaseSections,
} from "@atmos/agent-transcript";
import { GoalIcon } from "@/ui/icons/lucide-native";
import { useMobileTheme } from "@/theme/theme-store";
import { copy, fillTemplate } from "../copy";
import { GrokChromePanel } from "../grok-chrome-panel";
import { grokGoalEmptyHint, grokGoalHeadline } from "../grok-chrome-label";

export function GoalCard({
  goal,
  messages,
}: {
  goal: GrokGoal;
  messages: readonly AgentMessage[];
}) {
  const theme = useMobileTheme();
  const status = grokGoalHeadline(goal);
  const tokens = formatGrokTokens(goal.tokens_used ?? 0);
  const elapsed = formatGrokElapsed(goal.elapsed_ms ?? 0);
  return (
    <GrokChromePanel
      collapseAria={copy.grokGoalCollapseAria}
      emptyHint={grokGoalEmptyHint}
      expandAria={copy.grokGoalExpandAria}
      fallbackType={copy.grokGoalFallback}
      icon={<GoalIcon color={theme.colors.secondaryLabel} size={16} strokeWidth={2} />}
      messages={messages}
      meta={status}
      panelAria={copy.grokGoalPanelAria}
      sections={grokGoalPhaseSections(goal, [...messages])}
      statusDetail={{
        leading: fillTemplate(copy.grokGoalStatusLine, { status }),
        trailing: `${fillTemplate(copy.grokGoalTokensLine, { tokens })} · ${fillTemplate(copy.grokGoalElapsedLine, { elapsed })}`,
      }}
      title={goal.objective.trim() || copy.grokGoalTitle}
    />
  );
}
