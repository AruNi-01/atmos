import type { AgentQueueItem, GrokGoal, GrokWorkflow } from "@atmos/api-types/ws/dto/agent-chat";
import type { ParityCards } from "@atmos/agent-transcript";
import { INITIAL_LANE, orderedCardIds, reduceLane, type CardId, type LaneState } from "./card-lane";
import type { ComposerCards } from "./composer-cards";

/**
 * Fixture cards are not a live chat snapshot. Map them onto the composer lane
 * so the preview can mount the same pill row and expanded card as a thread.
 * First load stays collapsed. `parityPreviewLane` treats every card as newly
 * arrived, so a permission preempts the one expanded slot.
 */
export function composerCardsFromParity(cards: ParityCards | undefined): ComposerCards {
  const planText = cards?.plan?.body?.trim() || cards?.plan?.title?.trim() || "";
  const plan = cards?.plan ? { title: cards.plan.title ?? "", body: planText } : null;
  const queue: AgentQueueItem[] = (cards?.queue ?? []).map((item, index) => ({
    id: item.id,
    seq: index,
    status: "queued",
    prompt: item.prompt,
  }));
  const background = (cards?.background ?? []).map((item) => ({
    id: item.id,
    command: item.command,
    preview: "",
  }));
  const subagents = (cards?.subagents ?? []).map((item) => ({
    id: item.id,
    title: item.title,
  }));
  const goal: GrokGoal | null = cards?.goal?.text
    ? {
        goal_id: "parity-goal",
        objective: cards.goal.text,
        status: "active",
        phase: "",
        children: [],
      }
    : null;
  const workflow: GrokWorkflow | null = cards?.workflow?.text
    ? {
        run_id: "parity-workflow",
        name: "",
        objective: cards.workflow.text,
        status: "active",
        phases: [],
        agents: [],
      }
    : null;
  const window = cards?.context?.window ?? 0;
  const context =
    cards?.context && window > 0
      ? {
          used: cards.context.used,
          context_window: window,
          percent: Math.min(100, Math.max(0, (cards.context.used / window) * 100)),
        }
      : null;
  const permission = cards?.permission
    ? {
        request_id: cards.permission.request_id ?? "parity-permission",
        tool: cards.permission.tool ?? "",
        description: cards.permission.description,
        status: cards.permission.status ?? "pending",
        options: (cards.permission.options ?? []).map((option, index) => ({
          option_id: option.option_id ?? `option-${index}`,
          name: option.name,
        })),
        questions: (cards.permission.questions ?? []).map((question, index) => ({
          id: question.id ?? `question-${index}`,
          prompt: question.prompt,
        })),
      }
    : null;

  const present: CardId[] = [];
  if (permission) present.push("permission");
  if (plan) present.push("plan");
  if (queue.length > 0) present.push("queue");
  if (background.length > 0) present.push("background");
  if (subagents.length > 0) present.push("subagents");
  if (goal) present.push("goal");
  if (workflow) present.push("workflow");
  if (context) present.push("context");

  return {
    available: orderedCardIds(present),
    permission,
    sessionOp: null,
    plan,
    planText,
    planFilePath: null,
    background,
    queue,
    subagents,
    subagentTools: [],
    goal,
    workflow,
    context,
  };
}

export function parityPreviewLane(cards: ComposerCards): LaneState {
  return reduceLane(INITIAL_LANE, {
    type: "available_changed",
    available: cards.available,
    arrived: cards.available,
  });
}
