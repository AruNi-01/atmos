import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";

type FoldedAgentPart = AgentPart & {
  part_id?: string;
  ordinal?: number;
  closed_at?: string | null;
};

function foldedAgentPart(part: AgentPart): FoldedAgentPart {
  return part as FoldedAgentPart;
}

/** Live text/thinking follows explicit `closed_at === null` from the fold, not omitted fields. */
export function foldedPartIsOpen(part: AgentPart): boolean {
  if (part.type !== "text" && part.type !== "thinking") return false;
  return foldedAgentPart(part).closed_at === null;
}

/** Display-buffer the last open answer text; earlier open blocks keep caret only. */
export function foldedPartIsStreamingDisplayTail(
  part: AgentPart,
  parts: readonly AgentPart[],
): boolean {
  if (part.type !== "text" || !foldedPartIsOpen(part)) return false;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const item = parts[index];
    if (item?.type === "text" && foldedPartIsOpen(item)) {
      return item === part;
    }
  }
  return false;
}
