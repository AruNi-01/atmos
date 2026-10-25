export type ProjectGroupStatusSection = {
  items: readonly { id: string; kind: "project" | "workspace"; projectId: string }[];
  key: string;
};

export function collectProjectGroupStatusPaths(input: {
  expanded: Readonly<Record<string, boolean | undefined>>;
  grouping: string;
  projectPathById: ReadonlyMap<string, string>;
  sections: readonly ProjectGroupStatusSection[];
  workspacePathById: ReadonlyMap<string, string>;
}): string[] {
  if (input.grouping !== "project") return [];
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (path: string | undefined) => {
    const trimmed = path?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    paths.push(trimmed);
  };

  for (const section of input.sections) {
    if (input.expanded[section.key] === false) continue;
    for (const item of section.items) {
      if (item.kind === "project") add(input.projectPathById.get(item.id));
      else add(input.workspacePathById.get(item.id));
    }
  }

  return paths;
}

export type WorkspaceListGitStatus = {
  branch: string | null;
  uncommitted: number;
  additions: number;
  deletions: number;
};

export function indexGitStatus(
  results:
    | readonly {
        path: string;
        status: {
          additions?: number;
          current_branch: string | null;
          deletions?: number;
          uncommitted_count: number;
        } | null;
      }[]
    | undefined,
): Map<string, WorkspaceListGitStatus> {
  const indexed = new Map<string, WorkspaceListGitStatus>();
  if (!results) return indexed;
  for (const result of results) {
    if (!result.status) continue;
    indexed.set(result.path, {
      additions: result.status.additions ?? 0,
      branch: result.status.current_branch,
      deletions: result.status.deletions ?? 0,
      uncommitted: result.status.uncommitted_count,
    });
  }
  return indexed;
}
