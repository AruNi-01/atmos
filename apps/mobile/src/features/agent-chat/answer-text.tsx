import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldedPartIsOpen, foldedPartIsStreamingDisplayTail } from "@atmos/agent-transcript";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { copy } from "./copy";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { useSmoothStreamText } from "./smooth-stream";

export function AnswerText({
  part,
  parts,
}: {
  part: Extract<AgentPart, { type: "text" }>;
  parts: readonly AgentPart[];
}) {
  const reduced = useReducedMotion();
  const paced = useSmoothStreamText(
    part.text,
    !reduced && foldedPartIsStreamingDisplayTail(part, parts),
  );
  if (!part.text) return null;
  const open = foldedPartIsOpen(part);
  const text = open ? `${paced}${copy.answerCaret}` : paced;
  return <AgentChatMarkdown fontSize={14} lineHeight={20} text={text} />;
}
