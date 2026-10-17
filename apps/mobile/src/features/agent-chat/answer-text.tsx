import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldedPartIsStreamingDisplayTail } from "@atmos/agent-transcript";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { answerShowsBlockCaret } from "./answer-caret";
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
  const streamingTail = foldedPartIsStreamingDisplayTail(part, parts);
  const paced = useSmoothStreamText(part.text, !reduced && streamingTail);
  if (!part.text) return null;
  const text = answerShowsBlockCaret({ reduced, tail: streamingTail, text: paced })
    ? `${paced} ${copy.answerCaret}`
    : paced;
  return <AgentChatMarkdown chipHttpUrls fontSize={14} lineHeight={20} text={text} />;
}
