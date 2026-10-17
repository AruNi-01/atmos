import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { AgentChatPermissionCard } from "../AgentChatPermissionCard";
import { AgentChatSessionOpCard } from "../AgentChatSessionOpCard";
import type { CardId } from "../card-lane";
import type { ComposerCards } from "../composer-cards";
import { BackgroundCard } from "./background-card";
import { ContextCard } from "./context-card";
import { GoalCard } from "./goal-card";
import { PlanCard } from "./plan-card";
import { QueueCard } from "./queue-card";
import { SubagentCard } from "./subagent-card";
import { WorkflowCard } from "./workflow-card";

export function LaneCardBody({
  cards,
  messages,
  onQueueDelete,
  onQueueReorder,
  onQueueUpdate,
  onRespondPermission,
  onRespondSessionOp,
  visible,
}: {
  cards: ComposerCards;
  messages: readonly AgentMessage[];
  onQueueDelete: (itemId: string) => Promise<void>;
  onQueueReorder: (itemIds: string[]) => Promise<void>;
  onQueueUpdate: (itemId: string, text: string) => Promise<void>;
  onRespondPermission: (input: { requestId: string; optionId: string }) => void;
  onRespondSessionOp: (input: { requestId: string; optionId: string }) => void;
  visible: CardId;
}) {
  switch (visible) {
    case "permission":
      return cards.permission ? (
        <AgentChatPermissionCard
          key={cards.permission.request_id}
          filePath={cards.planFilePath}
          onRespond={onRespondPermission}
          request={cards.permission}
        />
      ) : null;
    case "session_op":
      return cards.sessionOp ? (
        <AgentChatSessionOpCard onRespond={onRespondSessionOp} request={cards.sessionOp} />
      ) : null;
    case "plan":
      return <PlanCard text={cards.planText} />;
    case "background":
      return <BackgroundCard commands={cards.background} />;
    case "queue":
      return (
        <QueueCard
          items={cards.queue}
          onDelete={onQueueDelete}
          onReorder={onQueueReorder}
          onUpdate={onQueueUpdate}
        />
      );
    case "subagents":
      return (
        <SubagentCard items={cards.subagents} messages={messages} tools={cards.subagentTools} />
      );
    case "goal":
      return cards.goal ? <GoalCard goal={cards.goal} messages={messages} /> : null;
    case "workflow":
      return cards.workflow ? <WorkflowCard messages={messages} workflow={cards.workflow} /> : null;
    case "context":
      return cards.context ? <ContextCard stats={cards.context} /> : null;
    default: {
      const exhaustive: never = visible;
      return exhaustive;
    }
  }
}
