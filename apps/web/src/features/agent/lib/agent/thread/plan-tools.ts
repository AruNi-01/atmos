import { extractPlanMarkdown } from "./reducer";
import type { ToolCallBlock } from "./types";

export function isSwitchModePlanToolCall(block: ToolCallBlock): boolean {
  const tool = (block.tool || "").toLowerCase();
  const description = (block.description || "").toLowerCase();
  return (
    (tool === "switchmode" || tool === "switch_mode") &&
    (description.includes("ready to code") || extractPlanMarkdown(block.raw_input) !== null)
  );
}

export function isPlanUpdateToolCall(block: ToolCallBlock): boolean {
  const tool = (block.tool || "").toLowerCase();
  const description = (block.description || "").toLowerCase();
  if (tool === "todowrite" || tool === "todo_write") return true;
  if (description.includes("todo list updated")) return true;
  if (block.raw_output && typeof block.raw_output === "object") {
    const text = (block.raw_output as Record<string, unknown>).text;
    if (typeof text === "string" && text.toLowerCase().includes("todo list updated")) {
      return true;
    }
  }
  return false;
}
