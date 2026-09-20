import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { textFromParts } from "@/features/agent/lib/agent-chat-events";
import { splitAssistantProcessParts } from "@/features/agent/lib/assistant-process-parts";
import {
  compileMarkdownFindPattern,
  type MarkdownFindQuery,
} from "@/features/editor/lib/markdown-find";

export function transcriptFindQuery(search: string): MarkdownFindQuery {
  return {
    search,
    caseSensitive: false,
    wholeWord: false,
    regexp: false,
  };
}

/** User prompt + final assistant reply — same scope as list search / FindPanel. */
export function transcriptFindText(message: AgentMessage): string {
  if (message.role === "user") return textFromParts(message.parts);
  const { tailParts } = splitAssistantProcessParts(message.parts);
  return tailParts
    .flatMap(({ part }) => (part.type === "text" && part.text ? [part.text] : []))
    .join("\n")
    .trim();
}

export function transcriptFindMessageIndexes(
  messages: readonly AgentMessage[],
  query: string | MarkdownFindQuery,
): number[] {
  const next: MarkdownFindQuery = typeof query === "string" ? transcriptFindQuery(query) : query;
  const { pattern, invalid } = compileMarkdownFindPattern(next);
  if (!pattern || invalid) return [];

  const indexes: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const text = transcriptFindText(messages[index]!);
    if (!text) continue;
    pattern.lastIndex = 0;
    if (pattern.test(text)) indexes.push(index);
  }
  return indexes;
}

export function firstTranscriptFindIndex(
  hitIndexes: readonly number[],
  atOrAfter = 0,
): number | null {
  if (hitIndexes.length === 0) return null;
  const next = hitIndexes.find((index) => index >= atOrAfter);
  return next ?? hitIndexes[0] ?? null;
}

export function resolveTranscriptFindScrollIndex(
  hitIndexes: readonly number[],
  locatorIndex: number,
): number | null {
  if (hitIndexes.length > 0) {
    if (locatorIndex >= 0 && hitIndexes.includes(locatorIndex)) return locatorIndex;
    return firstTranscriptFindIndex(hitIndexes, locatorIndex >= 0 ? locatorIndex : 0);
  }
  return locatorIndex >= 0 ? locatorIndex : null;
}
