import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
  sentenceCaseOverview,
  toolCallPartsFromGroup,
  toolGroupHasRunning,
} from "@atmos/agent-transcript";
import { toolGroupCountLabel, toolGroupLabels } from "./copy";

/** First tool call id, otherwise the original indexes joined the way web does. */
export function toolGroupKey(parts: AgentPart[], origIndexes: number[]): string {
  return toolCallPartsFromGroup(parts)[0]?.tool_call_id ?? origIndexes.join("-");
}

export function toolGroupOverviewLabel(parts: AgentPart[]): string {
  const counts = countToolGroupOverview(toolCallPartsFromGroup(parts));
  if (counts.length === 0) {
    return parts.some((part) => part.type === "thinking")
      ? toolGroupLabels.thinking
      : toolGroupLabels.working;
  }
  return sentenceCaseOverview(
    formatToolGroupOverview(counts, toolGroupCountLabel, toolGroupLabels.join),
    toolGroupLabels.locale,
  );
}

/**
 * Persistent groups use autoOpen false. A running group stays open until the
 * user stores a boolean; that stored value wins.
 */
export function persistentToolGroupOpen(stored: boolean | undefined, running: boolean): boolean {
  if (typeof stored === "boolean") return stored;
  return running;
}

// @view

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { agentChatToolGroupExpandKey, useAgentChatExpandStore } from "./expand-store";
import { TextShimmer } from "./motion/text-shimmer";
import { ExpandChevron, ToolTreeRow } from "./tool-tree";

function rowKey(part: AgentPart, origIndex: number): string {
  if (part.type === "tool_call") return part.tool_call_id;
  return `${part.type}:${origIndex}`;
}

export function ToolGroup({
  groupKey,
  messageId,
  onInspect,
  origIndexes,
  parts,
  renderPart,
}: {
  groupKey: string;
  messageId: string;
  onInspect: () => void;
  origIndexes: number[];
  parts: AgentPart[];
  renderPart: (part: AgentPart, origIndex: number) => ReactNode;
}) {
  const theme = useMobileTheme();
  const expandKey = agentChatToolGroupExpandKey(messageId, groupKey);
  const stored = useAgentChatExpandStore((state) => state.values[expandKey]);
  const setExpand = useAgentChatExpandStore((state) => state.setExpand);
  const running = toolGroupHasRunning(parts);
  const open = persistentToolGroupOpen(stored, running);
  const overview = toolGroupOverviewLabel(parts);
  const overviewStyle = {
    color: theme.colors.secondaryLabel,
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
  };
  const rows = open
    ? parts.flatMap((part, index) => {
        const origIndex = origIndexes[index] ?? index;
        const rendered = renderPart(part, origIndex);
        if (rendered == null) return [];
        return [{ key: rowKey(part, origIndex), rendered }];
      })
    : [];

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          const next = !open;
          setExpand(expandKey, next);
          if (next) onInspect();
        }}
        style={{ alignItems: "center", flexDirection: "row", gap: 4, paddingVertical: 2 }}
      >
        {running ? (
          <TextShimmer duration={1} numberOfLines={1} style={overviewStyle}>
            {overview}
          </TextShimmer>
        ) : (
          <Text numberOfLines={1} style={overviewStyle}>
            {overview}
          </Text>
        )}
        <ExpandChevron open={open} />
      </Pressable>
      {open
        ? rows.map((row, index) => (
            <ToolTreeRow
              count={rows.length}
              draw={running}
              first={index === 0}
              index={index}
              key={row.key}
              last={index === rows.length - 1}
            >
              {row.rendered}
            </ToolTreeRow>
          ))
        : null}
    </View>
  );
}
