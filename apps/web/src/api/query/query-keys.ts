import type { ComputerQueryScope, RelayQueryScope } from "@/api/query/query-scope";

/** Parameters for a compare-against-ref changed-files query. All null = worktree mode. */
export interface GitCompareParams {
  baseBranch: string | null;
  baseRef: string | null;
  commitRef: string | null;
  usePreferredCompare: boolean;
}

/** Parameters for a single-file diff query. */
export interface GitFileDiffParams {
  baseBranch: string | null;
  againstIndex: boolean;
  baseRef: string | null;
  commitRef: string | null;
}

/** Worktree mode – unstaged changes against HEAD/index. */
export const GIT_WORKTREE_PARAMS: GitCompareParams = {
  baseBranch: null,
  baseRef: null,
  commitRef: null,
  usePreferredCompare: false,
};

export const queryKeys = {
  computer: {
    root: (scope: ComputerQueryScope) =>
      [
        "atmos",
        "computer",
        scope.activeInstanceId,
        scope.connectionEpoch,
        scope.relaySessionRevision,
      ] as const,
    system: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "system"] as const,
    tmuxStatus: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "tmuxStatus"] as const,
    runtimeInfo: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "runtimeInfo"] as const,
    ghCliStatus: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "ghCliStatus"] as const,
    gitStatusSystem: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "gitStatusSystem"] as const,
    terminalOverview: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "terminalOverview"] as const,
    wsConnections: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "wsConnections"] as const,
    settingsBootstrap: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "settings", "bootstrap"] as const,
    quotaOverview: (
      scope: ComputerQueryScope,
      filters?: { providerId?: string | null },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "quota",
        "overview",
        {
          providerId: filters?.providerId ?? null,
        },
      ] as const,
    tokenUsageOverview: (
      scope: ComputerQueryScope,
      filters?: {
        year?: string | null;
        since?: string | null;
        until?: string | null;
        clients?: string[] | null;
        groupBy?: string | null;
      },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "tokenUsage",
        "overview",
        {
          year: filters?.year ?? null,
          since: filters?.since ?? null,
          until: filters?.until ?? null,
          clients: filters?.clients ?? null,
          groupBy: filters?.groupBy ?? null,
        },
      ] as const,
    projectBootstrap: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "projects", "bootstrap"] as const,
    /** Root for all git queries under a given repo path. */
    git: (scope: ComputerQueryScope, repoPath: string) =>
      [...queryKeys.computer.root(scope), "git", repoPath] as const,
    /** Prefix key covering ALL git repos for a scope — used for reconnect invalidation. */
    gitAll: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "git"] as const,
    /** Git status snapshot for a repo. */
    gitStatus: (scope: ComputerQueryScope, repoPath: string) =>
      [...queryKeys.computer.git(scope, repoPath), "status"] as const,
    /** Changed-files snapshot keyed by compare params (use GIT_WORKTREE_PARAMS for worktree). */
    gitChangedFiles: (
      scope: ComputerQueryScope,
      repoPath: string,
      params: GitCompareParams,
    ) =>
      [...queryKeys.computer.git(scope, repoPath), "changedFiles", params] as const,
    /** Single-file diff snapshot keyed by filePath and diff params. */
    gitFileDiff: (
      scope: ComputerQueryScope,
      repoPath: string,
      filePath: string,
      params: GitFileDiffParams,
    ) =>
      [
        ...queryKeys.computer.git(scope, repoPath),
        "fileDiff",
        filePath,
        params,
      ] as const,
    /** Local + remote branch list for a repo. */
    gitBranches: (scope: ComputerQueryScope, repoPath: string) =>
      [...queryKeys.computer.git(scope, repoPath), "branches"] as const,
    /** Local commit log page for a repo (+ optional branch identity). */
    gitLog: (
      scope: ComputerQueryScope,
      repoPath: string,
      params: { branchKey: string | null; limit: number; page: number },
    ) => [...queryKeys.computer.git(scope, repoPath), "log", params] as const,
    /** Prefix for all filesystem queries — used for broad reconnect invalidation. */
    filesRoot: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "files"] as const,
    /** Flat files key kept for legacy compatibility. */
    files: (scope: ComputerQueryScope, rootPath: string) =>
      [...queryKeys.computer.root(scope), "files", rootPath] as const,
    /** Full recursive file-tree keyed by rootPath + showHidden. */
    fileTree: (scope: ComputerQueryScope, rootPath: string, showHidden: boolean) =>
      [
        ...queryKeys.computer.root(scope),
        "files",
        rootPath,
        "tree",
        { showHidden },
      ] as const,
    /** Single-directory listing keyed by dirPath + filter options. */
    listDir: (
      scope: ComputerQueryScope,
      dirPath: string,
      options?: { dirsOnly?: boolean; showHidden?: boolean },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "files",
        dirPath,
        "dir",
        { dirsOnly: options?.dirsOnly ?? true, showHidden: options?.showHidden ?? false },
      ] as const,
    /** File content — for read/reload only; editor buffers remain in Zustand. */
    readFile: (scope: ComputerQueryScope, path: string) =>
      [...queryKeys.computer.root(scope), "files", path, "content"] as const,
    /** Ripgrep content search keyed by rootPath + query + options. */
    searchContent: (
      scope: ComputerQueryScope,
      rootPath: string,
      query: string,
      options?: { maxResults?: number; caseSensitive?: boolean },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "files",
        rootPath,
        "search",
        "content",
        {
          query,
          maxResults: options?.maxResults ?? 50,
          caseSensitive: options?.caseSensitive ?? false,
        },
      ] as const,
    /** Directory name search keyed by rootPath + query + options. */
    searchDirs: (
      scope: ComputerQueryScope,
      rootPath: string,
      query: string,
      options?: { maxResults?: number; maxDepth?: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "files",
        rootPath,
        "search",
        "dirs",
        {
          query,
          maxResults: options?.maxResults ?? 50,
          maxDepth: options?.maxDepth ?? 4,
        },
      ] as const,

    // ── Extended domain keys ─────────────────────────────────────────────

    /** Skills: installed list root */
    skillsList: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "skills", "list"] as const,

    /** Automations: definition list */
    automationList: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "automations", "list"] as const,

    /** Automations: agent capability list */
    automationAgentCapabilities: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "automations", "agentCapabilities"] as const,

    /** Automations: run list for a specific automation */
    automationRunList: (scope: ComputerQueryScope, automationGuid: string) =>
      [
        ...queryKeys.computer.root(scope),
        "automations",
        "runs",
        automationGuid,
      ] as const,

    /** GitHub: repo-level PR list */
    githubRepoPrList: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; state?: string; limit?: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "repoPrs",
        params.owner,
        params.repo,
        params.state ?? "open",
        params.limit ?? 50,
      ] as const,

    githubIssueList: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; state: "open" | "closed"; limit: number },
    ) =>
      [...queryKeys.computer.root(scope), "github", "issues", params.owner, params.repo, params.state, params.limit] as const,
    githubIssuePage: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; state: "open" | "closed"; page: number; perPage: number },
    ) =>
      [...queryKeys.computer.root(scope), "github", "issues", params.owner, params.repo, params.state, params.page, params.perPage] as const,
    githubIssueDetail: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; issueNumber: number },
    ) =>
      [...queryKeys.computer.root(scope), "github", "issueDetail", params.owner, params.repo, params.issueNumber] as const,
    githubIssueTimeline: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; issueNumber: number },
    ) =>
      [...queryKeys.computer.root(scope), "github", "issueTimeline", params.owner, params.repo, params.issueNumber] as const,
    githubIssueLinkedPrs: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; issueNumber: number },
    ) =>
      [...queryKeys.computer.root(scope), "github", "issueLinkedPrs", params.owner, params.repo, params.issueNumber] as const,

    /** GitHub: branch-level PR list */
    githubBranchPrList: (
      scope: ComputerQueryScope,
      params: {
        owner: string;
        repo: string;
        branch: string;
        state?: string;
        emitBranchStatusRefresh?: boolean;
      },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "branchPrs",
        params.owner,
        params.repo,
        params.branch,
        params.state ?? "open",
        Boolean(params.emitBranchStatusRefresh),
      ] as const,
    githubBranchPrPage: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; branch: string; state: string; page: number; perPage: number },
    ) =>
      [...queryKeys.computer.root(scope), "github", "branchPrs", params.owner, params.repo, params.branch, params.state, params.page, params.perPage] as const,

    /** GitHub: single PR detail (conversation + commits summary) */
    githubPrDetail: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; prNumber: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "prDetail",
        params.owner,
        params.repo,
        params.prNumber,
      ] as const,

    /** GitHub: PR detail sidebar (reviewers, labels, checks, …) */
    githubPrDetailSidebar: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; prNumber: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "prDetailSidebar",
        params.owner,
        params.repo,
        params.prNumber,
      ] as const,

    /** GitHub: repository labels for PR picker */
    githubRepoLabels: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; limit?: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "repoLabels",
        params.owner,
        params.repo,
        params.limit ?? 200,
      ] as const,

    /** GitHub: repository assignable users for PR picker */
    githubRepoAssignees: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "repoAssignees",
        params.owner,
        params.repo,
      ] as const,

    /** GitHub: PR changed-files list */
    githubPrFiles: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; prNumber: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "prFiles",
        params.owner,
        params.repo,
        params.prNumber,
      ] as const,

    /** GitHub: PR timeline infinite pages */
    githubPrTimeline: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; prNumber: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "prTimeline",
        params.owner,
        params.repo,
        params.prNumber,
      ] as const,

    /** GitHub: Actions list for a branch */
    githubActionsList: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; branch: string },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "actionsList",
        params.owner,
        params.repo,
        params.branch,
      ] as const,

    /** GitHub: Actions detail for a run */
    githubActionsDetail: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; runId: number },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "actionsDetail",
        params.owner,
        params.repo,
        params.runId,
      ] as const,

    /** GitHub: PR merge-conflict file paths (local merge-tree) */
    githubPrConflictFiles: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; prNumber: number; repoPath?: string | null },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "prConflictFiles",
        params.owner,
        params.repo,
        params.prNumber,
        params.repoPath ?? "",
      ] as const,

    /** GitHub: CI Status for a branch */
    githubCiStatus: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; branch: string },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "ciStatus",
        params.owner,
        params.repo,
        params.branch,
      ] as const,

    /** GitHub: Commit detail (metadata + changed files) */
    githubCommitDetail: (
      scope: ComputerQueryScope,
      params: { owner: string; repo: string; sha: string },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "github",
        "commitDetail",
        params.owner,
        params.repo,
        params.sha,
      ] as const,

    /** Review: session list for a given target */
    reviewSessions: (
      scope: ComputerQueryScope,
      target: {
        kind: string;
        targetId: string;
        snapshotGuid?: string | null;
      },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "review",
        "sessions",
        target.kind,
        target.targetId,
        target.snapshotGuid ?? null,
      ] as const,

    /** Local services: scan result for a given request key */
    localServicesScan: (scope: ComputerQueryScope, scopeKey: string) =>
      [...queryKeys.computer.root(scope), "localServices", "scan", scopeKey] as const,

    /** Local models: installed model list + state */
    localModelList: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "localModels", "list"] as const,

    /** Agent registry: built-in registry agent list */
    agentRegistryList: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "agentRegistry", "list"] as const,

    /** Agent registry: custom agent list */
    customAgentList: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "agentRegistry", "customAgents"] as const,
  },
  relay: {
    root: (scope: RelayQueryScope) =>
      ["atmos", "relay", scope.relayUrl, scope.authRevision] as const,
  },
} as const;

export type ComputerQueryRootKey = ReturnType<typeof queryKeys.computer.root>;
