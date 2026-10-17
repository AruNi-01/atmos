import type { GrokGoal } from "@atmos/api-types/ws/dto/agent-chat";
import { grokGoalStatusKey, type GrokChromePhaseSection } from "@atmos/agent-transcript";
import { copy, fillTemplate } from "./copy";
import { subagentTaskStatus } from "./inline-subagent-tasks";

const GOAL_STATUS: Record<string, string> = {
  active: copy.grokGoalStatusActive,
  complete: copy.grokGoalStatusComplete,
  user_paused: copy.grokGoalStatusUserPaused,
  back_off_paused: copy.grokGoalStatusBackOffPaused,
  no_progress_paused: copy.grokGoalStatusNoProgressPaused,
  infra_paused: copy.grokGoalStatusInfraPaused,
  blocked: copy.grokGoalStatusBlocked,
  failed: copy.grokGoalStatusFailed,
  interrupted: copy.grokGoalStatusInterrupted,
  budget_limited: copy.grokGoalStatusBudgetLimited,
};

const GOAL_PHASE: Record<string, string> = {
  idle: copy.grokGoalPhaseIdle,
  planning: copy.grokGoalPhasePlanning,
  executing: copy.grokGoalPhaseExecuting,
  verifying: copy.grokGoalPhaseVerifying,
};

/** Web goal header: status, then the phase when the goal is still active. */
export function grokGoalHeadline(goal: GrokGoal): string {
  const headline = grokGoalStatusKey(goal);
  const status = GOAL_STATUS[headline.status] ?? headline.status;
  if (!headline.phase) return status;
  const phase = GOAL_PHASE[headline.phase] ?? headline.phase;
  return `${status} · ${phase}`;
}

export function grokWorkflowCountLabel(sections: readonly GrokChromePhaseSection[]): string {
  const running = sections.reduce(
    (count, section) =>
      count + section.agents.filter((agent) => subagentTaskStatus(agent) === "running").length,
    0,
  );
  return running > 0
    ? fillTemplate(copy.grokWorkflowRunning, { count: running })
    : copy.grokWorkflowIdle;
}

export function grokGoalEmptyHint(section: GrokChromePhaseSection): string | null {
  if (section.agents.length > 0) return null;
  if (section.id === "verifying") return copy.grokGoalEmptyVerify;
  if (section.id === "summarizing") return copy.grokGoalEmptySummarize;
  return null;
}

/** Web opens a phase that is running or active. The embedded plan lead stays on the plan pill. */
export function grokPhaseStartsOpen(state: string): boolean {
  return state === "running" || state === "active";
}
