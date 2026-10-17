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

/** Web process rule is `h-px bg-border`: 1px, black or white at 10%. */
export const PROCESS_RULE_LIGHT = "rgba(0, 0, 0, 0.1)";
export const PROCESS_RULE_DARK = "rgba(255, 255, 255, 0.1)";
/** Web `space-y-2` / message `gap-2` between process rows. */
export const PROCESS_ROW_GAP = 8;
/** Web `AgentWorkedForLabel` is `min-h-6`. */
export const PROCESS_WORKED_FOR_HEIGHT = 24;

export function processRuleColor(isDark: boolean): string {
  return isDark ? PROCESS_RULE_DARK : PROCESS_RULE_LIGHT;
}

// @view

import { Children, isValidElement, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { chatMutedForeground } from "./chat-ink";
import {
  agentChatInspectExpandKey,
  agentChatProcessExpandKey,
  useAgentChatExpand,
  useAgentChatExpandStore,
} from "./expand-store";
import { PartReveal, shouldPlayPartReveal } from "./motion/part-reveal";
import { ExpandChevron } from "./tool-tree";

function processRowId(child: ReactNode, index: number): string {
  if (isValidElement(child) && child.key != null) return String(child.key);
  return `row:${index}`;
}

type RevealGate = { primed: boolean; seen: Set<string> };

const revealGates = new Map<string, RevealGate>();

function revealGateKey(instanceId: string, messageId: string): string {
  return `${instanceId}:${messageId}`;
}

function revealGate(instanceId: string, messageId: string): RevealGate {
  const prefix = `${instanceId}:`;
  const key = revealGateKey(instanceId, messageId);
  for (const existing of revealGates.keys()) {
    if (existing.startsWith(prefix) && existing !== key) revealGates.delete(existing);
  }
  const found = revealGates.get(key);
  if (found) return found;
  const created: RevealGate = { primed: false, seen: new Set() };
  revealGates.set(key, created);
  return created;
}

function markRevealGate(key: string, ids: readonly string[], markSeen: boolean) {
  const gate = revealGates.get(key);
  if (!gate) return;
  if (markSeen) {
    for (const id of ids) gate.seen.add(id);
  }
  gate.primed = true;
}

function ProcessRows({
  children,
  primed,
  seen,
  streaming,
}: {
  children: ReactNode;
  primed: boolean;
  seen: Set<string>;
  streaming: boolean;
}) {
  const nodes = Children.toArray(children);
  return (
    <>
      {nodes.map((child, index) => {
        const id = processRowId(child, index);
        return (
          <PartReveal
            key={id}
            play={shouldPlayPartReveal({ primed, seen: seen.has(id), streaming })}
          >
            <View style={index < nodes.length - 1 ? { marginBottom: PROCESS_ROW_GAP } : undefined}>
              {child}
            </View>
          </PartReveal>
        );
      })}
    </>
  );
}

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
  const muted = chatMutedForeground(theme.isDark);
  const processKey = agentChatProcessExpandKey(message.id);
  const [expanded, setExpanded] = useAgentChatExpand(processKey, false);
  const [userInspecting, setUserInspecting] = useAgentChatExpand(
    agentChatInspectExpandKey(message.id),
    false,
  );
  const wasCollapsibleRef = useRef(false);
  const messageIdRef = useRef(message.id);
  const instanceId = useId();
  const gateKey = revealGateKey(instanceId, message.id);
  const gate = revealGate(instanceId, message.id);
  const rowsVisible = !canCollapse || expanded;

  useLayoutEffect(() => {
    markRevealGate(
      gateKey,
      Children.toArray(children).map((child, index) => processRowId(child, index)),
      !message.streaming || rowsVisible,
    );
  });

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

  const revealedRows = (
    <View>
      <ProcessRows primed={gate.primed} seen={gate.seen} streaming={Boolean(message.streaming)}>
        {children}
      </ProcessRows>
    </View>
  );

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) setUserInspecting(true);
  };
  const worked = message.worked_ms != null && message.worked_ms > 0;
  const headerLabel = (
    <Text style={{ color: muted, ...LABEL }}>{processHeaderLabel(message.worked_ms)}</Text>
  );
  const ruleColor = processRuleColor(theme.isDark);

  if (!canCollapse) {
    return revealedRows;
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={{
          alignItems: "center",
          alignSelf: "stretch",
          flexDirection: "row",
          gap: 4,
          paddingVertical: 2,
        }}
      >
        {worked ? (
          <View style={{ height: PROCESS_WORKED_FOR_HEIGHT, justifyContent: "center" }}>
            {headerLabel}
          </View>
        ) : (
          headerLabel
        )}
        <ExpandChevron color={muted} open={expanded} size={12} />
      </Pressable>
      {expanded ? <View style={{ paddingTop: 4 }}>{revealedRows}</View> : null}
      <Pressable
        accessibilityLabel={expanded ? copy.collapseLabel : undefined}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 4 }}
      >
        <View style={{ backgroundColor: ruleColor, flex: 1, height: 1 }} />
        {expanded ? (
          <>
            <Text style={{ color: muted, fontSize: 12, lineHeight: 12 }}>{copy.collapseLabel}</Text>
            <View style={{ backgroundColor: ruleColor, flex: 1, height: 1 }} />
          </>
        ) : null}
      </Pressable>
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
  const muted = chatMutedForeground(theme.isDark);
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
        <Text style={{ color: muted, ...LABEL }}>{waitForLabel(section.anchors.length)}</Text>
        <ExpandChevron color={muted} open={open} />
      </Pressable>
      {open
        ? section.rows.map((row) => (
            <View key={`${row.part.type}:${row.index}`}>{renderPart(row.part, row.index)}</View>
          ))
        : null}
    </View>
  );
}
