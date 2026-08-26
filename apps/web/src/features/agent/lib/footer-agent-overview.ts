import {
  AGENT_STATE,
  AGENT_TOOL,
  AGENT_TOOL_LABELS,
  type AgentHookSession,
  type AgentToolType,
} from "@/features/agent/store/agent-hooks-store";
import type { PaneAttention } from "@/features/agent/store/agent-attention-store";
import {
  resolveWorkspaceAgentGroupKey,
  type WorkspaceAgentGroupKey,
} from "@/features/agent/lib/workspace-agent-status";

/** Footer overview buckets. `idle` is the session remainder; sidebar uses `done`. */
export type FooterAgentOverviewBucket = "running" | "idle" | "attention" | "permission";

export const FOOTER_AGENT_OVERVIEW_ORDER: FooterAgentOverviewBucket[] = [
  "running",
  "idle",
  "attention",
  "permission",
];

export type FooterAgentOverviewCounts = Record<FooterAgentOverviewBucket, number>;

export type FooterAgentOverviewRow = {
  bucket: FooterAgentOverviewBucket;
  session: AgentHookSession;
};

const EMPTY_COUNTS: FooterAgentOverviewCounts = {
  running: 0,
  idle: 0,
  attention: 0,
  permission: 0,
};

function emptyCounts(): FooterAgentOverviewCounts {
  return { ...EMPTY_COUNTS };
}

function isAgentToolType(value: string | undefined): value is AgentToolType {
  return Boolean(value && value in AGENT_TOOL_LABELS);
}

function sessionIdentityKeys(session: AgentHookSession): string[] {
  const keys = [session.session_id?.trim(), session.pane_id?.trim()].filter(
    (key): key is string => Boolean(key),
  );
  return [...new Set(keys)];
}

function latchIdentityKeys(latch: PaneAttention): string[] {
  const keys = [latch.stablePaneId?.trim(), latch.sessionId?.trim()].filter(
    (key): key is string => Boolean(key),
  );
  return [...new Set(keys)];
}

function footerBucketFromGroupKey(
  key: WorkspaceAgentGroupKey,
): FooterAgentOverviewBucket {
  return key === "done" ? "idle" : key;
}

function findLatchForSession(
  session: AgentHookSession,
  latches: readonly PaneAttention[],
): PaneAttention | undefined {
  const keys = new Set(sessionIdentityKeys(session));
  if (keys.size === 0) return undefined;
  return latches.find((latch) =>
    latchIdentityKeys(latch).some((key) => keys.has(key)),
  );
}

function sessionFromAttentionLatch(latch: PaneAttention): AgentHookSession {
  const tool = isAgentToolType(latch.tool) ? latch.tool : AGENT_TOOL.CLAUDE_CODE;
  return {
    session_id: latch.sessionId || latch.stablePaneId,
    tool,
    state:
      latch.reason === "permission_request"
        ? AGENT_STATE.PERMISSION_REQUEST
        : AGENT_STATE.IDLE,
    timestamp: new Date(latch.raisedAt).toISOString(),
    context_id: latch.contextId,
    pane_id: latch.stablePaneId,
  };
}

function bucketForSession(
  session: AgentHookSession,
  latch: PaneAttention | undefined,
): FooterAgentOverviewBucket {
  return footerBucketFromGroupKey(
    resolveWorkspaceAgentGroupKey({
      agentState: session.state,
      attentionReason: latch?.reason ?? null,
    }),
  );
}

/**
 * Mutually exclusive session/pane counts for the footer Agent status overview.
 * Reuses sidebar By Agent Status priority: permission > running > attention > idle.
 * Attention latches without a hook session still count (Need attention / permission).
 */
export function buildFooterAgentOverview(
  sessions: Iterable<AgentHookSession>,
  attentionPanes: Iterable<PaneAttention>,
): { counts: FooterAgentOverviewCounts; rows: FooterAgentOverviewRow[] } {
  const counts = emptyCounts();
  const rows: FooterAgentOverviewRow[] = [];
  const sessionList = [...sessions];
  const latches = [...attentionPanes];
  const covered = new Set<string>();

  for (const session of sessionList) {
    const latch = findLatchForSession(session, latches);
    const bucket = bucketForSession(session, latch);
    counts[bucket] += 1;
    rows.push({ bucket, session });
    for (const key of sessionIdentityKeys(session)) covered.add(key);
    if (latch) {
      for (const key of latchIdentityKeys(latch)) covered.add(key);
    }
  }

  for (const latch of latches) {
    if (latchIdentityKeys(latch).some((key) => covered.has(key))) continue;
    const session = sessionFromAttentionLatch(latch);
    const bucket = bucketForSession(session, latch);
    counts[bucket] += 1;
    rows.push({ bucket, session });
  }

  return { counts, rows };
}

export function countFooterAgentOverview(
  sessions: Iterable<AgentHookSession>,
  attentionPanes: Iterable<PaneAttention>,
): FooterAgentOverviewCounts {
  return buildFooterAgentOverview(sessions, attentionPanes).counts;
}

export function footerAgentOverviewTotal(counts: FooterAgentOverviewCounts): number {
  return FOOTER_AGENT_OVERVIEW_ORDER.reduce((sum, key) => sum + counts[key], 0);
}
