"use client";

import React from "react";
import { useGitCommitCenterTabsStore } from "@/features/git/store/use-git-commit-center-tabs";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useTaskGithubDrawerNav } from "@/features/task/components/task-github-drawer/task-github-drawer-nav-context";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import { resolveCenterOpenContextId } from "@/app-shell/center-space/center-open-context";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { buildCenterHostTabHref } from "@/app-shell/center-stage-project-context";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";

export function useOpenGitCommitCenterTab() {
  const router = useAppRouter();
  const projects = useProjects();
  const { effectiveContextId: hostContextId } = useContextParams();
  const paintContextId = useCenterPaintContextId();
  const drawerNav = useTaskGithubDrawerNav();
  const openCommit = useGitCommitCenterTabsStore((state) => state.openCommit);

  const activateTab = React.useCallback(
    (value: string, contextId: string) => {
      activateCenterChromeTab(contextId, value, { placement: "focused" });
      const targetHost = hostIdFromCenterKey(contextId);
      const currentHost = hostContextId ? hostIdFromCenterKey(hostContextId) : "";
      if (targetHost && targetHost !== currentHost) {
        router.push(buildCenterHostTabHref(targetHost, projects, value));
      }
    },
    [hostContextId, projects, router],
  );

  const resolveContextId = React.useCallback(
    (contextId?: string | null) =>
      resolveCenterOpenContextId(contextId, hostContextId, paintContextId),
    [hostContextId, paintContextId],
  );

  const openCommitTab = React.useCallback(
    ({
      owner,
      repo,
      sha,
      subject,
      authorName,
      contextId,
      repoPath,
      timestamp,
      focusFilePath,
    }: {
      owner?: string | null;
      repo?: string | null;
      sha: string;
      subject: string;
      authorName: string;
      contextId?: string | null;
      repoPath?: string | null;
      timestamp?: number | null;
      focusFilePath?: string | null;
    }) => {
      const ownerName = owner?.trim() ?? "";
      const repoName = repo?.trim() ?? "";
      if (drawerNav?.active && ownerName && repoName) {
        return drawerNav.openCommit({
          owner: ownerName,
          repo: repoName,
          sha,
          subject,
          authorName,
          contextId,
        });
      }
      const targetContextId = resolveContextId(contextId);
      if (!targetContextId) return false;
      const shortSha = sha.substring(0, 7);
      const tab = openCommit(targetContextId, {
        label: `${shortSha} ${subject}`.substring(0, 60),
        sha,
        subject,
        authorName,
        description: subject,
        repoPath: repoPath ?? null,
        timestamp: timestamp ?? null,
        owner: ownerName || null,
        repo: repoName || null,
        focusFilePath: focusFilePath ?? null,
      });
      activateTab(tab.value, targetContextId);
      return true;
    },
    [activateTab, drawerNav, openCommit, resolveContextId],
  );

  return { openCommitTab };
}
