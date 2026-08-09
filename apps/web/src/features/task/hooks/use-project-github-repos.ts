"use client";

import { useEffect, useMemo, useState } from "react";
import { gitApi } from "@/api/ws-api";
import type { Project } from "@/shared/types/domain";

export type ProjectGithubRepo = {
  projectId: string;
  projectName: string;
  owner: string;
  repo: string;
  /** `owner/repo` */
  fullName: string;
  path: string;
};

/**
 * Resolve GitHub owner/repo for each Atmos project via git status batch.
 * Dedupes by fullName (multiple projects can map to the same remote).
 */
export function useProjectGithubRepos(projects: Project[], enabled = true) {
  const pathKey = useMemo(
    () =>
      projects
        .map((p) => p.mainFilePath)
        .filter(Boolean)
        .sort()
        .join("\0"),
    [projects],
  );

  const [repos, setRepos] = useState<ProjectGithubRepo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !pathKey) {
      setRepos([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const paths = pathKey.split("\0").filter(Boolean);
    const projectByPath = new Map(
      projects
        .filter((p) => p.mainFilePath)
        .map((p) => [p.mainFilePath, p] as const),
    );

    setLoading(true);
    void gitApi
      .getStatuses(paths)
      .then((response) => {
        if (cancelled) return;
        const byFullName = new Map<string, ProjectGithubRepo>();
        for (const result of response.results) {
          const owner = result.status?.github_owner ?? null;
          const repo = result.status?.github_repo ?? null;
          if (!owner || !repo) continue;
          const project = projectByPath.get(result.path);
          if (!project) continue;
          const fullName = `${owner}/${repo}`;
          if (byFullName.has(fullName)) continue;
          byFullName.set(fullName, {
            projectId: project.id,
            projectName: project.name,
            owner,
            repo,
            fullName,
            path: result.path,
          });
        }
        setRepos(Array.from(byFullName.values()).sort((a, b) => a.fullName.localeCompare(b.fullName)));
      })
      .catch(() => {
        if (!cancelled) setRepos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, pathKey, projects]);

  return { repos, loading };
}
