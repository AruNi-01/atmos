import type { AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import {
  countToolGroupOverview,
  formatToolGroupOverview,
  iconKindForOverview,
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

/** First overview kind, otherwise the web fallback wrench (`other`). */
export function toolGroupLeadKind(parts: AgentPart[]): AgentToolKind {
  const lead = countToolGroupOverview(toolCallPartsFromGroup(parts))[0]?.kind;
  return lead ? iconKindForOverview(lead) : "other";
}

// @view

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { chatMutedForeground } from "./chat-ink";
import { agentChatToolGroupExpandKey, useAgentChatExpandStore } from "./expand-store";
import { TextShimmer } from "./motion/text-shimmer";
import { PartReveal } from "./motion/part-reveal";
import { toolTriggerMetrics } from "./tool-chrome";
import { ToolKindIcon } from "./tool-kind-icon";
import { ToolDiffStats, toolGroupDiffTotals } from "./tool-body";
import { ExpandChevron, ToolTreeRow, useToolTreeReveal } from "./tool-tree";

/** Web group list is `mt-0.5`. The trunk already sits at x=8 (`ms-2`). */
const TOOL_GROUP_LIST_MARGIN_TOP = 2;

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
  const metrics = toolTriggerMetrics;
  const { shown, watermark } = useToolTreeReveal(parts.length, open);
  const diff = toolGroupDiffTotals(parts);
  const muted = chatMutedForeground(theme.isDark);
  const overviewStyle = {
    color: muted,
    flexShrink: 1,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
  };
  const visible = open ? parts.slice(0, shown) : [];
  const rows = visible.flatMap((part, index) => {
    const origIndex = origIndexes[index] ?? index;
    const rendered = renderPart(part, origIndex);
    if (rendered == null) return [];
    return [{ key: rowKey(part, origIndex), rendered }];
  });

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
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: metrics.gap,
          paddingVertical: metrics.padY,
        }}
      >
        <View
          style={{
            alignItems: "center",
            height: metrics.iconBox,
            justifyContent: "center",
            width: metrics.iconBox,
          }}
        >
          <ToolKindIcon color={muted} kind={toolGroupLeadKind(parts)} size={metrics.iconSize} />
        </View>
        {running ? (
          <TextShimmer duration={1} numberOfLines={1} style={overviewStyle}>
            {overview}
          </TextShimmer>
        ) : (
          <Text numberOfLines={1} style={overviewStyle}>
            {overview}
          </Text>
        )}
        <ToolDiffStats additions={diff.additions} deletions={diff.deletions} />
        <ExpandChevron color={muted} open={open} size={metrics.chevron} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: TOOL_GROUP_LIST_MARGIN_TOP }}>
          {rows.map((row, index) => (
            <PartReveal key={row.key} play={index >= watermark}>
              <ToolTreeRow
                draw={index >= watermark}
                first={index === 0}
                last={index === rows.length - 1}
              >
                {row.rendered}
              </ToolTreeRow>
            </PartReveal>
          ))}
        </View>
      ) : null}
    </View>
  );
}
