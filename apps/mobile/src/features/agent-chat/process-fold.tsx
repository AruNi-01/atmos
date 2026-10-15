import {
  formatWorkDuration,
  shouldAutoCollapseProcessOnSettle,
  waitForSection,
} from "@atmos/agent-transcript";
import { copy, fillTemplate } from "./copy";

/** Worked-for when the turn recorded time; otherwise the settled process label. */
export function processHeaderLabel(workedMs: number | null | undefined): string {
  if (workedMs != null && workedMs > 0) {
    return fillTemplate(copy.workedFor, { duration: formatWorkDuration(workedMs) });
  }
  return copy.processLabel;
}

/**
 * On the transition into a collapsible process, write expanded only when settle
 * says not to auto-collapse. Compact density is never detailed. A stored
 * process flag, including false, is left alone.
 */
export function processExpandOnSettle(input: {
  canCollapse: boolean;
  wasCollapsible: boolean;
  hasStoredProcess: boolean;
  userInspecting: boolean;
}): { expanded: boolean | null; wasCollapsible: boolean } {
  const becameCollapsible = input.canCollapse && !input.wasCollapsible;
  const expanded =
    becameCollapsible && !input.hasStoredProcess
      ? !shouldAutoCollapseProcessOnSettle(input.userInspecting)
      : null;
  return { expanded, wasCollapsible: input.canCollapse };
}

export function waitForLabel(count: number): string {
  const n = Math.max(1, count);
  return n === 1 ? "Wait for 1 background agent" : `Wait for ${n} background agents`;
}

export function agentChatWaitExpandKey(messageId: string): string {
  return `wait:${messageId}`;
}

// @view

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import {
  agentChatInspectExpandKey,
  agentChatProcessExpandKey,
  useAgentChatExpand,
  useAgentChatExpandStore,
} from "./expand-store";
import { ExpandChevron } from "./tool-tree";

const LABEL = { fontSize: 12, lineHeight: 16 } as const;

export function ProcessFold({
  canCollapse,
  children,
  message,
}: {
  canCollapse: boolean;
  children: ReactNode;
  message: AgentMessage;
}) {
  const theme = useMobileTheme();
  const processKey = agentChatProcessExpandKey(message.id);
  const [expanded, setExpanded] = useAgentChatExpand(processKey, false);
  const [userInspecting, setUserInspecting] = useAgentChatExpand(
    agentChatInspectExpandKey(message.id),
    false,
  );
  const wasCollapsibleRef = useRef(false);
  const messageIdRef = useRef(message.id);

  useLayoutEffect(() => {
    if (messageIdRef.current !== message.id) {
      messageIdRef.current = message.id;
      wasCollapsibleRef.current = false;
    }
    const stored = useAgentChatExpandStore.getState().values;
    const decision = processExpandOnSettle({
      canCollapse,
      wasCollapsible: wasCollapsibleRef.current,
      hasStoredProcess: Object.prototype.hasOwnProperty.call(stored, processKey),
      userInspecting,
    });
    if (decision.expanded !== null) setExpanded(decision.expanded);
    wasCollapsibleRef.current = decision.wasCollapsible;
  }, [canCollapse, message.id, processKey, setExpanded, userInspecting]);

  if (!canCollapse) {
    return <View style={{ gap: 6 }}>{children}</View>;
  }

  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => {
          const next = !expanded;
          setExpanded(next);
          if (next) setUserInspecting(true);
        }}
        style={{
          alignItems: "center",
          alignSelf: "flex-start",
          flexDirection: "row",
          gap: 4,
          paddingVertical: 2,
        }}
      >
        <Text style={{ color: theme.colors.secondaryLabel, ...LABEL }}>
          {processHeaderLabel(message.worked_ms)}
        </Text>
        <ExpandChevron open={expanded} />
      </Pressable>
      {expanded ? (
        <>
          <View style={{ gap: 6 }}>{children}</View>
          <Pressable
            accessibilityLabel={copy.collapseLabel}
            accessibilityRole="button"
            onPress={() => setExpanded(false)}
            style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 4 }}
          >
            <View
              style={{
                backgroundColor: theme.colors.glassBorder,
                flex: 1,
                height: StyleSheet.hairlineWidth,
              }}
            />
            <Text style={{ color: theme.colors.secondaryLabel, ...LABEL }}>
              {copy.collapseLabel}
            </Text>
            <View
              style={{
                backgroundColor: theme.colors.glassBorder,
                flex: 1,
                height: StyleSheet.hairlineWidth,
              }}
            />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export function WaitForBlock({
  messageId,
  parts,
  renderPart,
}: {
  messageId: string;
  parts: AgentPart[];
  renderPart: (part: AgentPart, index: number) => ReactNode;
}) {
  const theme = useMobileTheme();
  const section = waitForSection(parts);
  const [open, setOpen] = useAgentChatExpand(agentChatWaitExpandKey(messageId), false);
  if (!section) return null;

  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ alignItems: "center", flexDirection: "row", gap: 4, paddingVertical: 2 }}
      >
        <Text style={{ color: theme.colors.secondaryLabel, ...LABEL }}>
          {waitForLabel(section.anchors.length)}
        </Text>
        <ExpandChevron open={open} />
      </Pressable>
      {open
        ? section.rows.map((row) => (
            <View key={`${row.part.type}:${row.index}`}>{renderPart(row.part, row.index)}</View>
          ))
        : null}
    </View>
  );
}
