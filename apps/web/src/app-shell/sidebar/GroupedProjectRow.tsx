"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui";
import { formatRelativeTime } from "@atmos/shared";
import type { Group, Project } from "@/shared/types/domain";
import { findGroupIdForMember } from "@/app-shell/sidebar/user-groups";
import { ProjectAgentStatusMark } from "@/features/agent/components/WorkspaceAgentStatusMark";
import { ProjectLogoMark } from "@/features/project/components/ProjectLogoMark";
import { getRuntimeApiConfig, httpBase } from "@/shared/lib/desktop-runtime";
import { SidebarHeldShortcutBadge } from "@/app-shell/HeldShortcutBadge";
import { useSidebarShortcutDigit } from "@/app-shell/held-shortcut-prefix-store";
import { SIDEBAR_SHORTCUT_TARGET_ATTR } from "@/app-shell/shortcut-prefix";
import { getProjectGroupingWorkspace } from "@/app-shell/sidebar/workspace-grouping";
import { useGitStatusQuery } from "@/features/git/hooks/use-git-status-query";
import { WorkspacePrLifecycleIcon } from "@/features/github/components/WorkspacePrStatusIcon";
import { WorkspacePrSummary } from "@/features/github/components/WorkspacePrSummary";
import { useWorkspacePrStatus } from "@/features/github/hooks/use-workspace-pr-status";
import { useOpenGithubCenterTab } from "@/features/github/hooks/use-open-github-center-tab";
import {
  buildActionRunFromChecks,
  pickGroupActionTarget,
} from "@/features/github/lib/pr-detail-parts";
import {
  isWorkspaceInfoHoverKeepAliveTarget,
  useWorkspaceInfoHoverOpen,
  useWorkspaceInfoHoverPortal,
  workspaceInfoHoverSession,
} from "@/app-shell/sidebar/workspace-info-hover-session";

function isDirectLogoSource(value: string): boolean {
  return /^(https?:|data:)/i.test(value.trim());
}

function useProjectLogoUrl(logoPath: string | null): {
  logoUrl: string | null;
  hasLogoLoadError: boolean;
  onLogoError: () => void;
} {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hasLogoLoadError, setHasLogoLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHasLogoLoadError(false);
    if (!logoPath) {
      setLogoUrl(null);
      return () => {
        cancelled = true;
      };
    }

    setLogoUrl(null);
    if (isDirectLogoSource(logoPath)) {
      setLogoUrl(logoPath);
      return () => {
        cancelled = true;
      };
    }

    void getRuntimeApiConfig()
      .then((config) => {
        if (cancelled) return;
        const params = new URLSearchParams({ path: logoPath });
        if (config.token) params.set("token", config.token);
        setLogoUrl(`${httpBase(config)}/api/system/file?${params.toString()}`);
      })
      .catch(() => {
        if (cancelled) return;
        setLogoUrl(null);
        setHasLogoLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  return {
    logoUrl,
    hasLogoLoadError,
    onLogoError: () => setHasLogoLoadError(true),
  };
}

function ProjectMetadataValue({
  value,
  valueClassName,
}: {
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 flex-1 text-right">
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "inline-block max-w-full truncate whitespace-nowrap align-top text-foreground",
              valueClassName,
            )}>
              {value}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="center"
            sideOffset={8}
            avoidCollisions={false}
            className="max-w-sm break-all"
          >
            {value}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function GroupedProjectRow({
  project,
  groups = [],
  isActive = false,
}: {
  project: Project;
  groups?: Group[];
  isActive?: boolean;
}) {
  const t = useTranslations("AppShell.chrome.groupedProject");
  const groupsT = useTranslations("appShell.groups");
  const locale = useLocale();
  const router = useAppRouter();
  const { openPullRequestTab, openActionRunTab } = useOpenGithubCenterTab();
  const hoverInstanceId = React.useId();
  const isInfoPopoverOpen = useWorkspaceInfoHoverOpen(hoverInstanceId);
  const infoPopoverPortalEl = useWorkspaceInfoHoverPortal(hoverInstanceId);
  const [isRowHovered, setIsRowHovered] = useState(false);
  const projectShortcutKey = `project:${project.id}`;
  const shortcutDigit = useSidebarShortcutDigit(projectShortcutKey);
  const { logoUrl, hasLogoLoadError, onLogoError } = useProjectLogoUrl(project.logoPath);
  const initialLetter = project.name.charAt(0).toUpperCase();
  const representative = getProjectGroupingWorkspace(project);
  const lastActiveSource = representative?.lastVisitedAt ?? representative?.createdAt;
  const timeAgo = lastActiveSource ? formatRelativeTime(lastActiveSource, locale) : t("notSet");
  const projectGroupId = findGroupIdForMember(groups, "project", project.id);
  const projectGroupName = projectGroupId
    ? groups.find((group) => group.id === projectGroupId)?.name
    : null;
  const ignoreNextClickRef = React.useRef(false);
  const repoPath = project.mainFilePath?.trim() || null;
  const statusQuery = useGitStatusQuery(repoPath);
  const currentBranch = statusQuery.data?.current_branch?.trim() || "";
  const { presentation: managedPr } = useWorkspacePrStatus({
    branch: currentBranch || null,
    repoPath,
    interested: isRowHovered || isInfoPopoverOpen,
  });
  const prIconClass = isActive ? "text-sidebar-foreground" : "text-muted-foreground";

  const enterInfoPopover = React.useCallback((
    trigger: HTMLElement,
    options?: { immediate?: boolean },
  ) => {
    workspaceInfoHoverSession.enter(project.id, trigger, {
      ...options,
      instanceId: hoverInstanceId,
    });
  }, [hoverInstanceId, project.id]);

  React.useEffect(() => {
    return () => {
      workspaceInfoHoverSession.detach(hoverInstanceId);
    };
  }, [hoverInstanceId]);

  const handleClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    workspaceInfoHoverSession.dismiss();
    router.push(`/project?id=${project.id}`);
  };

  const openManagedPullRequest = React.useCallback(() => {
    if (!managedPr) return;
    openPullRequestTab({
      owner: managedPr.owner,
      repo: managedPr.repo,
      prNumber: managedPr.number,
      title: managedPr.title,
      branch: currentBranch,
      contextId: project.id,
    });
    workspaceInfoHoverSession.dismiss();
  }, [currentBranch, managedPr, openPullRequestTab, project.id]);

  const openManagedChecks = React.useCallback(() => {
    if (!managedPr) return;
    const target = pickGroupActionTarget(managedPr.checks);
    if (target.runId != null) {
      openActionRunTab({
        owner: managedPr.owner,
        repo: managedPr.repo,
        runId: target.runId,
        run: buildActionRunFromChecks(
          target.groupName,
          managedPr.checks,
          target.runId,
          managedPr.owner,
          managedPr.repo,
        ),
        contextId: project.id,
      });
    } else {
      openPullRequestTab({
        owner: managedPr.owner,
        repo: managedPr.repo,
        prNumber: managedPr.number,
        title: managedPr.title,
        branch: currentBranch,
        contextId: project.id,
      });
    }
    workspaceInfoHoverSession.dismiss();
  }, [currentBranch, managedPr, openActionRunTab, openPullRequestTab, project.id]);

  const handleTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isInfoPopoverOpen) {
      ignoreNextClickRef.current = true;
      enterInfoPopover(event.currentTarget, { immediate: true });
      window.setTimeout(() => {
        ignoreNextClickRef.current = false;
      }, 500);
    }
  }, [enterInfoPopover, isInfoPopoverOpen]);

  return (
    <>
      <div
        onClick={handleClick}
        onMouseEnter={(event) => {
          setIsRowHovered(true);
          enterInfoPopover(event.currentTarget);
        }}
        onMouseLeave={(event) => {
          setIsRowHovered(false);
          if (isWorkspaceInfoHoverKeepAliveTarget(event.relatedTarget)) {
            workspaceInfoHoverSession.hold();
          }
          workspaceInfoHoverSession.leave(hoverInstanceId);
        }}
        onTouchStart={handleTouchStart}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={0}
        data-ws-row=""
        {...{ [SIDEBAR_SHORTCUT_TARGET_ATTR]: projectShortcutKey }}
        className={cn(
          "relative flex cursor-pointer items-center rounded-md border border-transparent px-3 py-1.5 hover:bg-sidebar-accent group/ws",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:text-sidebar-accent-foreground",
        )}
      >
        <div className="relative flex min-w-0 w-full items-center gap-1">
          <div className="absolute -left-1 flex size-5 items-center justify-center overflow-hidden rounded-md border border-sidebar-border bg-sidebar text-[9px] font-bold text-muted-foreground"
            style={{
              borderLeft: project.borderColor ? `2px solid ${project.borderColor}` : undefined,
            }}
          >
            {logoUrl && !hasLogoLoadError ? (
              <ProjectLogoMark src={logoUrl} onError={onLogoError} />
            ) : (
              <span>{initialLetter}</span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-5">
            <span className="truncate text-[13px] font-medium">{project.name}</span>
            {managedPr ? (
              <WorkspacePrLifecycleIcon
                state={managedPr.state}
                checksTone={managedPr.checksTone}
                className="shrink-0"
                fallbackClassName={prIconClass}
              />
            ) : null}
            <ProjectAgentStatusMark
              projectId={project.id}
              workspaceIds={project.workspaces.map((workspace) => workspace.id)}
              rollupAttention
            />
          </div>
          <div
            className={cn(
              "flex shrink-0 items-center justify-end gap-1.5",
              shortcutDigit != null && "invisible",
            )}
          >
            <span className="hidden text-[11px] text-muted-foreground group-hover/ws:inline">
              {timeAgo}
            </span>
            <span className="inline-flex h-4 shrink-0 items-center rounded-md border border-border/60 bg-muted/40 px-1.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
              {t("chip")}
            </span>
          </div>
          {shortcutDigit != null ? (
            <div className="pointer-events-none absolute right-0 top-1/2 z-10 -translate-y-1/2">
              <SidebarHeldShortcutBadge targetKey={projectShortcutKey} />
            </div>
          ) : null}
        </div>
      </div>
      {infoPopoverPortalEl
        ? createPortal(
            <div className="space-y-3">
              {managedPr ? (
                <WorkspacePrSummary
                  presentation={managedPr}
                  onOpenPr={openManagedPullRequest}
                  onOpenChecks={openManagedChecks}
                  className="-mx-1"
                />
              ) : null}
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap">{t("name")}</span>
                  <ProjectMetadataValue value={project.name} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap">{t("currentBranch")}</span>
                  <ProjectMetadataValue
                    value={currentBranch || t("notSet")}
                    valueClassName="font-semibold text-foreground"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap">{t("targetBranch")}</span>
                  <ProjectMetadataValue value={project.targetBranch?.trim() || t("notSet")} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap">{t("path")}</span>
                  <ProjectMetadataValue
                    value={project.mainFilePath}
                    valueClassName="rounded-md bg-muted/60 px-2 py-1 text-left [direction:rtl]"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap">{t("workspaces")}</span>
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-right text-foreground">
                    {t("workspaceCount", { count: project.workspaces.length })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap">{t("group")}</span>
                  <ProjectMetadataValue value={projectGroupName ?? groupsT("ungrouped")} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 whitespace-nowrap">{t("lastActive")}</span>
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-right text-foreground">
                    {timeAgo}
                  </span>
                </div>
              </div>
            </div>,
            infoPopoverPortalEl,
          )
        : null}
    </>
  );
}
