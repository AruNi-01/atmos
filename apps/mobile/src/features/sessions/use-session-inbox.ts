import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useIsFocused } from "expo-router";
import type { MobileWsClient } from "@/api/mobile-ws-client";
import type { TerminalWorkspaceCandidate } from "@/api/types";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import {
  branchPrTarget,
  branchPrsFromPayload,
  pickBranchPr,
  type BranchPrLike,
  type SessionPrState,
} from "./pick-branch-pr";
import {
  joinSessionRows,
  recentSessionRows,
  sessionInboxCards,
  sessionWorkspaceSources,
  type SessionInboxCandidate,
  type SessionWorkspaceRecord,
} from "./session-inbox";

const SESSION_STATUS_EVENTS = new Set([
  "agent_status_changed",
  "agent_status_cleared",
  "agent_attention_raised",
  "agent_attention_cleared",
  "agent_attention_summary_updated",
  "agent_attention_summary_cleared",
]);

type CandidateLoad = {
  byWorkspaceId: Record<string, TerminalWorkspaceCandidate[]>;
  failedWorkspaceIds: string[];
};

type GitRemote = {
  github_owner: string | null;
  github_repo: string | null;
};

type PrTarget = {
  id: string;
  owner: string;
  repo: string;
  branch: string;
};

export function useSessionInbox() {
  const queryClient = useQueryClient();
  const focused = useIsFocused();
  const { client, state: wsState } = useMobileWs();
  const hasDeviceCredential = useSessionStore((state) => state.hasDeviceCredential);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const connected = hasDeviceCredential && wsState === "open";

  const bootstrapQuery = useQuery({
    queryKey: ["workspace-bootstrap", selectedServerId, wsState],
    enabled: Boolean(client && connected),
    queryFn: () => wsActions.projectWorkspaceBootstrap(client!),
  });

  const sources = useMemo(
    () => sessionWorkspaceSources(bootstrapQuery.data),
    [bootstrapQuery.data],
  );
  const workspaceKey = sources.active.map((workspace) => workspace.id).join("\n");

  const candidatesQuery = useQuery({
    queryKey: ["session-terminal-candidates", selectedServerId, workspaceKey],
    enabled: Boolean(client && connected && focused && bootstrapQuery.isSuccess),
    queryFn: () => loadSessionCandidates(client!, sources.active),
  });

  const gitTargets = useMemo(
    () => sources.active.filter((workspace) => !workspace.githubOwner || !workspace.githubRepo),
    [sources.active],
  );
  const gitKey = gitTargets.map((workspace) => `${workspace.id}:${workspace.localPath}`).join("\n");

  const gitQuery = useQuery({
    queryKey: ["session-git-status", selectedServerId, gitKey],
    enabled: Boolean(client && connected && focused && gitTargets.length > 0),
    staleTime: 60_000,
    queryFn: () => loadSessionGitStatus(client!, gitTargets),
  });

  const prPlan = useMemo(
    () => buildPrTargets(sources.active, gitQuery.data),
    [gitQuery.data, sources.active],
  );
  const prKey = prPlan.targets.map((target) => target.id).join("\n");

  const prQuery = useQuery({
    queryKey: ["session-branch-prs", selectedServerId, prKey],
    enabled: Boolean(client && connected && focused && prPlan.targets.length > 0),
    staleTime: 60_000,
    queryFn: () => loadSessionBranchPrs(client!, prPlan.targets),
  });

  const statusQuery = useQuery({
    queryKey: ["agent-session-status-list", selectedServerId],
    enabled: Boolean(client && connected),
    queryFn: () => wsActions.agentSessionStatusList(client!),
  });

  useFocusEffect(
    useCallback(() => {
      if (!client || !connected) return;
      void queryClient.invalidateQueries({
        queryKey: ["agent-session-status-list", selectedServerId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["session-terminal-candidates", selectedServerId],
      });
    }, [client, connected, queryClient, selectedServerId]),
  );

  useEffect(() => {
    if (!client || !focused || !connected) return;
    const unsubscribe = client.subscribeMessages((message) => {
      if (!isSessionInboxNotification(message)) return;
      void queryClient.invalidateQueries({
        queryKey: ["agent-session-status-list", selectedServerId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["session-terminal-candidates", selectedServerId],
      });
    });
    return () => {
      unsubscribe();
    };
  }, [client, connected, focused, queryClient, selectedServerId]);

  const model = useMemo(() => {
    if (connected && (statusQuery.isPending || bootstrapQuery.isPending)) {
      return {
        rows: [],
        cards: sessionInboxCards([]),
        recent: [],
      };
    }

    const failed = new Set(candidatesQuery.data?.failedWorkspaceIds ?? []);
    const candidatesReady = candidatesQuery.isSuccess;
    const pendingWorkspaceIds = sources.active
      .filter((workspace) => !candidatesReady || failed.has(workspace.id))
      .map((workspace) => workspace.id);

    const candidates: SessionInboxCandidate[] = [];
    if (candidatesReady && candidatesQuery.data) {
      for (const workspace of sources.active) {
        if (failed.has(workspace.id)) continue;
        for (const candidate of candidatesQuery.data.byWorkspaceId[workspace.id] ?? []) {
          candidates.push({
            id: candidate.id,
            workspaceId: candidate.workspace_id || workspace.id,
            label: candidate.label,
            sessionId: candidate.session_id,
            tmuxWindowName: candidate.tmux_window_name,
            projectName: workspace.projectName,
            workspaceName: workspace.workspaceName,
            branch: workspace.branch,
          });
        }
      }
    }

    const joined = joinSessionRows({
      candidates,
      snapshots: statusQuery.data?.sessions ?? [],
      workspaces: sources.active,
      projects: sources.projects,
      archivedWorkspaceIds: sources.archivedIds,
      pendingWorkspaceIds,
    });
    const prByWorkspace = prStateByWorkspace(sources.active, prPlan.byWorkspaceId, prQuery.data);
    const rows = joined.map((row) => ({
      ...row,
      prState: row.workspaceId ? prByWorkspace.get(row.workspaceId) ?? null : null,
    }));

    return {
      rows,
      cards: sessionInboxCards(rows),
      recent: recentSessionRows(rows),
    };
  }, [
    candidatesQuery.data,
    candidatesQuery.isSuccess,
    connected,
    bootstrapQuery.isPending,
    prPlan.byWorkspaceId,
    prQuery.data,
    sources,
    statusQuery.data?.sessions,
    statusQuery.isPending,
  ]);

  const error =
    (statusQuery.error instanceof Error ? statusQuery.error.message : null) ??
    (bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : null) ??
    (candidatesQuery.data && candidatesQuery.data.failedWorkspaceIds.length > 0
      ? "Some terminals could not be loaded."
      : null);

  const archiveSession = useCallback(
    async (sessionId: string) => {
      if (!client || !connected) return;
      await wsActions.agentSessionArchive(client, sessionId);
      await queryClient.invalidateQueries({
        queryKey: ["agent-session-status-list", selectedServerId],
      });
    },
    [client, connected, queryClient, selectedServerId],
  );

  return {
    archiveSession,
    connected,
    error,
    isLoading: connected && (statusQuery.isPending || bootstrapQuery.isPending),
    ...model,
  };
}

function prStateByWorkspace(
  workspaces: SessionWorkspaceRecord[],
  targetByWorkspaceId: Map<string, string>,
  lists: Record<string, BranchPrLike[] | null> | undefined,
): Map<string, SessionPrState | null> {
  const prByWorkspace = new Map<string, SessionPrState | null>();
  if (!lists) return prByWorkspace;
  for (const workspace of workspaces) {
    const targetId = targetByWorkspaceId.get(workspace.id);
    if (!targetId) continue;
    const prs = lists[targetId];
    if (prs == null) {
      prByWorkspace.set(workspace.id, null);
      continue;
    }
    prByWorkspace.set(workspace.id, pickBranchPr(prs, workspace.branch)?.prState ?? null);
  }
  return prByWorkspace;
}

function buildPrTargets(
  workspaces: SessionWorkspaceRecord[],
  gitStatus: Record<string, GitRemote | null> | undefined,
): { targets: PrTarget[]; byWorkspaceId: Map<string, string> } {
  const targets: PrTarget[] = [];
  const seen = new Set<string>();
  const byWorkspaceId = new Map<string, string>();

  for (const workspace of workspaces) {
    const git = gitStatus?.[workspace.id];
    const target = branchPrTarget({
      branch: workspace.branch,
      storedOwner: workspace.githubOwner,
      storedRepo: workspace.githubRepo,
      gitOwner: git?.github_owner,
      gitRepo: git?.github_repo,
    });
    if (!target) continue;
    const id = `${target.owner}\n${target.repo}\n${target.branch}`;
    byWorkspaceId.set(workspace.id, id);
    if (seen.has(id)) continue;
    seen.add(id);
    targets.push({ id, ...target });
  }

  return { targets, byWorkspaceId };
}

async function loadSessionCandidates(
  client: MobileWsClient,
  workspaces: SessionWorkspaceRecord[],
): Promise<CandidateLoad> {
  const byWorkspaceId: Record<string, TerminalWorkspaceCandidate[]> = {};
  const failedWorkspaceIds: string[] = [];
  await Promise.all(
    workspaces.map(async (workspace) => {
      try {
        const response = await wsActions.terminalWorkspaceCandidates(client, {
          workspace_id: workspace.id,
          project_name: workspace.projectName,
          workspace_name: workspace.workspaceName,
        });
        byWorkspaceId[workspace.id] = response.candidates;
      } catch {
        failedWorkspaceIds.push(workspace.id);
      }
    }),
  );
  return { byWorkspaceId, failedWorkspaceIds };
}

async function loadSessionGitStatus(
  client: MobileWsClient,
  workspaces: SessionWorkspaceRecord[],
): Promise<Record<string, GitRemote | null>> {
  const entries = await Promise.all(
    workspaces.map(async (workspace) => {
      if (!workspace.localPath) return [workspace.id, null] as const;
      try {
        const status = await wsActions.gitGetStatus(client, workspace.localPath);
        return [
          workspace.id,
          { github_owner: status.github_owner, github_repo: status.github_repo },
        ] as const;
      } catch {
        return [workspace.id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function loadSessionBranchPrs(
  client: MobileWsClient,
  targets: PrTarget[],
): Promise<Record<string, BranchPrLike[] | null>> {
  const entries = await Promise.all(
    targets.map(async (target) => {
      try {
        const response = await wsActions.githubPrList(client, {
          owner: target.owner,
          repo: target.repo,
          branch: target.branch,
          state: "all",
        });
        return [target.id, branchPrsFromPayload(response)] as const;
      } catch {
        return [target.id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

function isSessionInboxNotification(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const envelope = message as { type?: unknown; payload?: { event?: unknown } };
  if (envelope.type !== "notification") return false;
  const event = envelope.payload?.event;
  return typeof event === "string" && SESSION_STATUS_EVENTS.has(event);
}
