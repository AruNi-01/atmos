import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { foldedPartIsOpen, isNestedSubagentChild, presentAgentTool } from "@atmos/agent-transcript";
import { copy, toolGroupLabels } from "./copy";

const ACTIVE_TOOL_STATUS = new Set<string>(["running", "in_progress", "pending"]);

/**
 * `presentAgentTool` has no title field. Prefer one if a future result adds it,
 * then the wire title, then the presented tool name.
 */
function activityToolTitle(part: Extract<AgentPart, { type: "tool_call" }>): string {
  const presented = presentAgentTool(part);
  const presentedTitle =
    "title" in presented && typeof presented.title === "string" ? presented.title.trim() : "";
  if (presentedTitle) return presentedTitle;
  const wireTitle = part.title?.trim() ?? "";
  if (wireTitle) return wireTitle;
  return presented.resolvedTool.trim();
}

/**
 * The last active parent tool is already a tree row in the open group.
 * A sibling activity label would repeat that last title (e.g. lone "fixture").
 */
export function activityRowDuplicatesOpenTree(message: AgentMessage | null | undefined): boolean {
  const parts = message?.role === "assistant" ? message.parts : [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part || part.type !== "tool_call" || isNestedSubagentChild(part, parts)) continue;
    if (!ACTIVE_TOOL_STATUS.has(part.status)) continue;
    return true;
  }
  return false;
}

/**
 * Hide the sibling only while that tool is actually on screen. A user-closed
 * running group still needs the activity title — the tree rows are gone.
 */
export function activityRowDuplicatesVisibleTree(
  hasActiveParentTool: boolean,
  groups: ReadonlyArray<{ key: string; running: boolean }>,
  storedByKey: Readonly<Record<string, boolean | undefined>>,
): boolean {
  if (!hasActiveParentTool) return false;
  if (groups.length === 0) return true;
  for (const group of groups) {
    if (!group.running) continue;
    const stored = storedByKey[group.key];
    const open = typeof stored === "boolean" ? stored : true;
    if (open) return true;
  }
  return false;
}

export function activityRowLabel(message: AgentMessage | null | undefined): string {
  const parts = message?.role === "assistant" ? message.parts : [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part || part.type !== "tool_call" || isNestedSubagentChild(part, parts)) continue;
    if (!ACTIVE_TOOL_STATUS.has(part.status)) continue;
    return activityToolTitle(part) || toolGroupLabels.working;
  }
  for (const part of parts) {
    if (part.type !== "thinking" || isNestedSubagentChild(part, parts)) continue;
    if (foldedPartIsOpen(part)) return copy.thinkingStream;
  }
  return toolGroupLabels.working;
}

// @view

import { View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { TextShimmer } from "./motion/text-shimmer";

export function ActivityRow({ message }: { message: AgentMessage }) {
  const theme = useMobileTheme();
  return (
    <View style={{ alignItems: "flex-start", paddingVertical: 2 }}>
      <TextShimmer
        duration={1.5}
        numberOfLines={1}
        style={{ color: theme.colors.secondaryLabel, fontSize: 14, lineHeight: 20 }}
      >
        {activityRowLabel(message)}
      </TextShimmer>
    </View>
  );
}
