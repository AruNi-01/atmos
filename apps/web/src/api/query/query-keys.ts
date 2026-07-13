import type { ComputerQueryScope, RelayQueryScope } from "@/api/query/query-scope";

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
    terminalOverview: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "terminalOverview"] as const,
    wsConnections: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.system(scope), "wsConnections"] as const,
    settingsBootstrap: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "settings", "bootstrap"] as const,
    usageOverview: (
      scope: ComputerQueryScope,
      filters?: { providerId?: string | null },
    ) =>
      [
        ...queryKeys.computer.root(scope),
        "usage",
        "overview",
        {
          providerId: filters?.providerId ?? null,
        },
      ] as const,
    tokenUsageOverview: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "tokenUsage", "overview"] as const,
    projectBootstrap: (scope: ComputerQueryScope) =>
      [...queryKeys.computer.root(scope), "projects", "bootstrap"] as const,
    git: (scope: ComputerQueryScope, repoPath: string) =>
      [...queryKeys.computer.root(scope), "git", repoPath] as const,
    files: (scope: ComputerQueryScope, rootPath: string) =>
      [...queryKeys.computer.root(scope), "files", rootPath] as const,
  },
  relay: {
    root: (scope: RelayQueryScope) =>
      ["atmos", "relay", scope.relayUrl, scope.authRevision] as const,
  },
} as const;

export type ComputerQueryRootKey = ReturnType<typeof queryKeys.computer.root>;
