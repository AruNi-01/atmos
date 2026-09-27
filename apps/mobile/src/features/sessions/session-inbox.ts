import type { SessionPrState } from "./pick-branch-pr";

export const SESSION_BUCKETS = ["permission", "attention", "running", "done"] as const;

export type SessionBucket = (typeof SESSION_BUCKETS)[number];

export const SESSION_BUCKET_LABEL: Record<SessionBucket, string> = {
  permission: "Need permission",
  attention: "Need attention",
  running: "Running",
  done: "Done",
};

const RECENT_LIMIT = 5;

export type SessionInboxCard = {
  bucket: SessionBucket;
  label: string;
  count: number;
};

export type SessionInboxCandidate = {
  id: string;
  workspaceId: string;
  label?: string | null;
  sessionId?: string | null;
  tmuxWindowName?: string | null;
  sessionTitle?: string | null;
  dynamicTitle?: string | null;
  projectName?: string | null;
  workspaceName?: string | null;
  branch?: string | null;
};

export type SessionInboxSnapshot = {
  session_id: string;
  surface: string;
  group_key: string;
  updated_at: string;
  context_id?: string | null;
  surface_id?: string | null;
};

export type SessionInboxWorkspace = {
  id: string;
  projectName?: string | null;
  workspaceName?: string | null;
  branch?: string | null;
};

export type SessionInboxProject = {
  id: string;
  name: string;
};

export type SessionInboxRow = {
  id: string;
  bucket: SessionBucket;
  title: string;
  updatedAt: string | null;
  projectName: string | null;
  workspaceName: string | null;
  branch: string | null;
  prState: SessionPrState | null;
  projectScoped: boolean;
  workspaceId: string | null;
  terminalCandidateId: string | null;
  /** Terminal panes open the terminal. Chat snapshots open that chat. */
  kind: "terminal" | "chat";
  chatId: string | null;
  /** Catalog key for `agent_session_archive`. Null when the pane never reported status. */
  archiveSessionId: string | null;
};

export type SessionInboxInput = {
  candidates: SessionInboxCandidate[];
  snapshots: SessionInboxSnapshot[];
  workspaces?: SessionInboxWorkspace[];
  projects?: SessionInboxProject[];
  archivedWorkspaceIds?: string[];
  /** Workspaces whose terminal candidates have not loaded yet. Their snapshots stay hidden. */
  pendingWorkspaceIds?: string[];
};

export type SessionWorkspaceRecord = {
  id: string;
  projectName: string | null;
  workspaceName: string | null;
  branch: string;
  localPath: string;
  githubOwner: string | null;
  githubRepo: string | null;
};

type SessionBootstrapLike = {
  projects?: ReadonlyArray<{
    guid: string;
    name: string;
    is_deleted?: boolean;
  }>;
  workspaces_by_project?: Record<
    string,
    ReadonlyArray<{
      guid: string;
      project_guid?: string;
      name: string;
      display_name?: string | null;
      branch?: string | null;
      local_path?: string | null;
      is_archived?: boolean;
      is_deleted?: boolean;
      github_pr?: { owner?: string | null; repo?: string | null } | null;
    }>
  >;
};

export function isSessionBucket(value: string): value is SessionBucket {
  return (SESSION_BUCKETS as readonly string[]).includes(value);
}

export function sessionBucketTitle(value: string): string {
  return isSessionBucket(value) ? SESSION_BUCKET_LABEL[value] : "Session";
}

export function sessionWorkspaceSources(bootstrap: SessionBootstrapLike | null | undefined): {
  active: SessionWorkspaceRecord[];
  archivedIds: string[];
  projects: SessionInboxProject[];
} {
  if (!bootstrap) return { active: [], archivedIds: [], projects: [] };

  const projectNameById = new Map((bootstrap.projects ?? []).map((project) => [project.guid, project.name]));
  const projects = (bootstrap.projects ?? [])
    .filter((project) => !project.is_deleted)
    .map((project) => ({ id: project.guid, name: project.name }));
  const active: SessionWorkspaceRecord[] = [];
  const archivedIds: string[] = [];

  for (const [projectId, workspaces] of Object.entries(bootstrap.workspaces_by_project ?? {})) {
    for (const workspace of workspaces ?? []) {
      if (workspace.is_archived) {
        archivedIds.push(workspace.guid);
        continue;
      }
      if (workspace.is_deleted) continue;
      const projectKey = workspace.project_guid || projectId;
      active.push({
        id: workspace.guid,
        projectName: projectNameById.get(projectKey) ?? projectNameById.get(projectId) ?? null,
        workspaceName: clean(workspace.display_name) ?? clean(workspace.name),
        branch: workspace.branch ?? "",
        localPath: workspace.local_path ?? "",
        githubOwner: clean(workspace.github_pr?.owner),
        githubRepo: clean(workspace.github_pr?.repo),
      });
    }
  }

  return { active, archivedIds, projects };
}

export function joinSessionRows(input: SessionInboxInput): SessionInboxRow[] {
  const archived = new Set(input.archivedWorkspaceIds ?? []);
  const pending = new Set(input.pendingWorkspaceIds ?? []);
  const workspaceById = new Map((input.workspaces ?? []).map((workspace) => [workspace.id, workspace]));
  const candidateByPane = new Map<string, SessionInboxCandidate>();
  const candidateBySession = new Map<string, SessionInboxCandidate>();

  for (const candidate of input.candidates) {
    if (archived.has(candidate.workspaceId)) continue;
    const pane = paneKey(candidate);
    if (pane && !candidateByPane.has(pane)) candidateByPane.set(pane, candidate);
    const sessionId = clean(candidate.sessionId);
    if (sessionId && !candidateBySession.has(sessionId)) candidateBySession.set(sessionId, candidate);
  }

  const rows: SessionInboxRow[] = [];
  const snapshots = [...input.snapshots].sort((left, right) =>
    left.session_id.localeCompare(right.session_id),
  );

  for (const snapshot of snapshots) {
    if (snapshot.surface !== "terminal" && snapshot.surface !== "chat") continue;
    const sessionId = clean(snapshot.session_id);
    if (!sessionId) continue;
    const contextId = clean(snapshot.context_id);
    if (contextId && archived.has(contextId)) continue;

    if (snapshot.surface === "chat") {
      const chatId =
        clean(snapshot.surface_id) ??
        (sessionId.startsWith("chat:") ? clean(sessionId.slice("chat:".length)) : null);
      const workspace = contextId ? workspaceById.get(contextId) : undefined;
      if (!chatId || !workspace) continue;
      rows.push({
        id: sessionId,
        bucket: asBucket(snapshot.group_key),
        title: sessionId,
        updatedAt: snapshot.updated_at,
        projectName: clean(workspace.projectName),
        workspaceName: clean(workspace.workspaceName),
        branch: clean(workspace.branch),
        prState: null,
        projectScoped: false,
        workspaceId: workspace.id,
        terminalCandidateId: null,
        kind: "chat",
        chatId,
        archiveSessionId: sessionId,
      });
      continue;
    }

    const candidate = candidateBySession.get(sessionId) ?? candidateByPane.get(sessionId);
    if (!candidate && !(contextId && pending.has(contextId))) continue;
    const workspaceId = candidate?.workspaceId ?? contextId;
    if (!workspaceId || archived.has(workspaceId)) continue;
    const workspace = workspaceById.get(workspaceId);
    if (!candidate && !workspace) continue;
    rows.push({
      id: candidate?.id ?? sessionId,
      bucket: asBucket(snapshot.group_key),
      title: candidate ? candidateTitle(candidate) : sessionId,
      updatedAt: snapshot.updated_at,
      projectName: clean(candidate?.projectName) ?? clean(workspace?.projectName),
      workspaceName: clean(candidate?.workspaceName) ?? clean(workspace?.workspaceName),
      branch: clean(candidate?.branch) ?? clean(workspace?.branch),
      prState: null,
      projectScoped: false,
      workspaceId,
      terminalCandidateId: candidate?.id ?? null,
      kind: "terminal",
      chatId: null,
      archiveSessionId: sessionId,
    });
  }

  return rows;
}

export function sessionInboxCards(rows: SessionInboxRow[]): SessionInboxCard[] {
  return SESSION_BUCKETS.map((bucket) => ({
    bucket,
    label: SESSION_BUCKET_LABEL[bucket],
    count: rows.filter((row) => row.bucket === bucket).length,
  }));
}

export function recentSessionRows(rows: SessionInboxRow[], limit = RECENT_LIMIT): SessionInboxRow[] {
  return rows
    .filter(hasTimedRow)
    .sort((left, right) => {
      const delta = updatedAtMillis(right.updatedAt) - updatedAtMillis(left.updatedAt);
      if (delta !== 0) return delta;
      return right.id.localeCompare(left.id);
    })
    .slice(0, limit);
}

export function filterSessionRows(rows: SessionInboxRow[], bucket: SessionBucket): SessionInboxRow[] {
  return rows.filter((row) => row.bucket === bucket);
}

export function buildSessionInbox(input: SessionInboxInput) {
  const rows = joinSessionRows(input);
  return {
    rows,
    cards: sessionInboxCards(rows),
    recent: recentSessionRows(rows),
  };
}

function asBucket(value: string): SessionBucket {
  return isSessionBucket(value) ? value : "done";
}

function candidateTitle(candidate: SessionInboxCandidate): string {
  return (
    clean(candidate.sessionTitle) ??
    clean(candidate.dynamicTitle) ??
    readableWindowLabel(candidate.label) ??
    readableWindowLabel(candidate.tmuxWindowName) ??
    "Terminal"
  );
}

function readableWindowLabel(value: string | null | undefined): string | null {
  const label = clean(value);
  if (!label || /^\d+$/.test(label)) return null;
  if (/^[0-9a-f-]{16,}$/i.test(label)) return null;
  return label;
}

function paneKey(candidate: SessionInboxCandidate): string | null {
  const workspaceId = clean(candidate.workspaceId);
  const windowName = clean(candidate.tmuxWindowName);
  if (!workspaceId || !windowName) return null;
  return `${workspaceId}:${windowName}`;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasTimedRow(row: SessionInboxRow): row is SessionInboxRow & { updatedAt: string } {
  return typeof row.updatedAt === "string" && row.updatedAt.trim().length > 0;
}

function updatedAtMillis(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
