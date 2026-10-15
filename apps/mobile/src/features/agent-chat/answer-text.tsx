import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldedPartIsOpen } from "@atmos/agent-transcript";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { copy } from "./copy";

export function AnswerText({ part }: { part: Extract<AgentPart, { type: "text" }> }) {
  if (!part.text) return null;
  const open = foldedPartIsOpen(part);
  const text = open ? `${part.text}${copy.answerCaret}` : part.text;
  return <AgentChatMarkdown fontSize={14} lineHeight={20} text={text} />;
}
