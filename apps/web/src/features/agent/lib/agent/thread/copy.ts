import { isPlanUpdateToolCall } from "./plan-tools";
import type { AssistantEntry, ThreadEntry } from "./types";

export function getAssistantCopyText(entry: AssistantEntry): string {
  const parts: string[] = [];
  for (const block of entry.blocks) {
    if (block.type === "text" || block.type === "thinking") {
      if (block.content?.trim()) parts.push(block.content.trim());
      continue;
    }
    if (block.type === "tool_call") {
      if (isPlanUpdateToolCall(block)) continue;
      if (typeof block.raw_output === "string" && block.raw_output.trim()) {
        parts.push(block.raw_output.trim());
      } else if (typeof block.description === "string" && block.description.trim()) {
        parts.push(block.description.trim());
      }
    }
  }
  return parts.join("\n\n").trim();
}

export function getAllAssistantMessagesCopyText(entries: ThreadEntry[]): string {
  const all = entries
    .filter((entry): entry is AssistantEntry => entry.role === "assistant")
    .map((entry) => getAssistantCopyText(entry))
    .filter((text) => !!text);
  return all.join("\n\n").trim();
}
