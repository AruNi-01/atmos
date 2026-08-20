"use client";
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryState } from "nuqs";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  llmProvidersModalParams,
  skillsModalParams,
} from "@/shared/lib/nuqs/searchParams";
import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import { motion } from "motion/react";
import { QuickOpen } from './QuickOpen';
import { HeaderAttentionBell } from './HeaderAttentionBell';
import { useGitInfoStore } from '@/features/git/store/use-git-info-store';
import { useGitStatusQuery } from '@/features/git/hooks/use-git-status-query';
import { useGitBranchesQuery } from '@/features/git/hooks/use-git-branches-query';
import { invalidateGitQueries } from '@/features/git/hooks/use-git-changed-files-query';
import { useGithubPRList } from '@/features/github/hooks/use-github';
import { useProjectStore } from '@/features/project/store/use-project-store';
import { useProjects } from '@/features/project/hooks/use-project-bootstrap-query';
import { useDialogStore } from '@/app-shell/state/use-dialog-store';
import { useEditorStore } from '@/features/editor/store/use-editor-store';
import { gitApi, wsWorkspaceApi } from '@/api/ws-api';
import { getAtmosWebQueryClient } from '@/providers/app/query-client';
import { getComputerQueryScope } from '@/api/query/query-scope';
import { queryKeys } from '@/api/query/query-keys';
import { toastManager } from '@workspace/ui';
import { DeleteWorkspaceDialog } from '@/features/workspace/components/DeleteWorkspaceDialog';
import { DeleteProjectDialog } from '@/features/project/components/DeleteProjectDialog';
import { SkillsModal } from '@/features/skills';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { useFocusRestore } from '@/shared/hooks/use-focus-restore';
import { useDesktopWindowDrag } from '@/shared/hooks/use-desktop-window-drag';
import { useDesktopTrafficLightsPadding } from '@/shared/hooks/use-desktop-traffic-lights-padding';
import { useDesktopWebLauncher } from '@/shared/hooks/use-desktop-web-launcher';
import { isDesktopRuntime as detectDesktopShell } from '@/shared/lib/desktop-runtime';
import { useTunnelConnector } from '@/features/connection/hooks/use-tunnel-connector';
import { useSidebarLayout } from '@/app-shell/SidebarLayoutContext';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import {
  ChevronLeft,
  ChevronRight,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
} from "lucide-react";
import { HeaderWorkspaceJobs } from './HeaderWorkspaceJobs';
import { isWorkspaceSetupBlocking } from '@/features/workspace/lib/workspace-setup';
import { useTranslations } from "next-intl";
import { getBranchSyncIndicatorState, getSessionUrgency } from './header-parts';
import { HeaderActionControls } from './header-action-controls';
import { HeaderGitContext } from './header-git-context';
import { useHeaderFullscreen } from './use-header-fullscreen';
import { useHeaderHotkeys } from './use-header-hotkeys';
import { useOpenGithubCenterTab } from '@/features/github/hooks/use-open-github-center-tab';
import { settingsHref } from '@/features/settings/lib/open-settings';

const Header: React.FC = () => {
  const pathname = usePathname();
  const router = useAppRouter();

  const searchParams = useSearchParams();
  const { workspaceId: currentWorkspaceId, projectId: currentProjectIdFromUrl } = useContextParams();
  const { isLeftCollapsed, toggleLeftSidebar } = useSidebarLayout();
  const { handleDesktopWindowMouseDown, isDesktopDragEnabled } = useDesktopWindowDrag();
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();

  const projects = useProjects();
  const updateWorkspaceBranch = useProjectStore(s => s.updateWorkspaceBranch);
  const setupProgress = useProjectStore(s => s.setupProgress);
  const { setGlobalSearchOpen, setHeaderHasOpenOverlay } = useDialogStore();
  const t = useTranslations("header");
  const showHeaderQuickOpen = useLayoutSettingsStore((s) => s.showHeaderQuickOpen);
  const showHeaderGitToolbar = useLayoutSettingsStore((s) => s.showHeaderGitToolbar);
  const showHeaderRemoteAccess = useLayoutSettingsStore((s) => s.showHeaderRemoteAccess);
  const loadLayoutSettings = useLayoutSettingsStore((s) => s.loadSettings);
  useEffect(() => {
    void loadLayoutSettings();
  }, [loadLayoutSettings]);
  const [desktopWebPopoverOpen, setDesktopWebPopoverOpen] = useState(false);
  const [isQuotaPopoverOpen, setIsQuotaPopoverOpen] = useState(false);
  const { onCloseAutoFocusPrevent } = useFocusRestore(isQuotaPopoverOpen);
  const { isDesktopFullscreenExiting } = useHeaderFullscreen();
  const refreshCurrentRoute = useCallback(() => {
    window.location.reload();
  }, []);
  const setCurrentProjectPath = useEditorStore(s => s.setCurrentProjectPath);
  const editorRepoPath = useEditorStore(s => s.currentProjectPath);
  const {
    targetBranch,
    setCurrentContext,
    setTargetBranch,
  } = useGitInfoStore();

  const { openPullRequestTab } = useOpenGithubCenterTab();

  const onWsEvent = useWebSocketStore(s => s.onEvent);

  // Find current project based on workspaceId OR projectId
  const currentProject = projects.find(p =>
    (currentWorkspaceId && p.workspaces.some(w => w.id === currentWorkspaceId)) ||
    (!currentWorkspaceId && currentProjectIdFromUrl === p.id)
  );
  const currentWorkspace = currentProject?.workspaces.find(
    w => w.id === currentWorkspaceId
  );
  const currentProjectIdForContext = currentProject?.id ?? null;
  const currentProjectMainFilePath = currentProject?.mainFilePath ?? null;
  const currentWorkspaceLocalPath = currentWorkspace?.localPath ?? null;
  const isSettingUp = isWorkspaceSetupBlocking(
    currentWorkspaceId ? setupProgress[currentWorkspaceId] : null,
  );

  const headerRepoPath = currentWorkspaceLocalPath || currentProjectMainFilePath || editorRepoPath || null;

  const statusQuery = useGitStatusQuery(headerRepoPath);
  const currentBranch = statusQuery.data?.current_branch ?? null;
  const githubOwner = statusQuery.data?.github_owner ?? null;
  const githubRepo = statusQuery.data?.github_repo ?? null;

  const { data: prListData, refresh: refreshHeaderPrList } = useGithubPRList({
    owner: githubOwner ?? undefined,
    repo: githubRepo ?? undefined,
    branch: currentBranch ?? undefined,
    state: 'all',
    enabled: showHeaderGitToolbar,
  });
  // Find the most recent PR (highest number) whose head branch matches current branch
  const currentBranchPR = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches = (prListData as any[] | null)?.filter((pr: any) => pr.headRefName === currentBranch) ?? [];
    if (matches.length === 0) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return matches.reduce((latest: any, pr: any) => pr.number > latest.number ? pr : latest, matches[0]);
  }, [prListData, currentBranch]);
  const prIconRef = useRef<{ startAnimation: () => void; stopAnimation: () => void } | null>(null);

  useEffect(() => {
    return onWsEvent('github_branch_pr_status_refreshed', (data: unknown) => {
      const payload = data as {
        owner?: string;
        repo?: string;
        branch?: string;
      } | null;

      if (!payload) return;
      if (payload.owner !== githubOwner) return;
      if (payload.repo !== githubRepo) return;
      if (payload.branch !== currentBranch) return;

      void refreshHeaderPrList();
    });
  }, [onWsEvent, githubOwner, githubRepo, currentBranch, refreshHeaderPrList]);

  const hasUncommittedChanges = statusQuery.data?.has_uncommitted_changes ?? false;
  const hasUnpushedCommits = statusQuery.data?.has_unpushed_commits ?? false;
  const uncommittedCount = statusQuery.data?.uncommitted_count ?? 0;
  const unpushedCount = statusQuery.data?.unpushed_count ?? 0;
  const defaultBranch = statusQuery.data?.default_branch ?? null;
  const defaultBranchAhead = statusQuery.data?.default_branch_ahead ?? null;
  const defaultBranchBehind = statusQuery.data?.default_branch_behind ?? null;

  const refreshGitStatus = useCallback(async () => {
    if (headerRepoPath) await invalidateGitQueries(headerRepoPath);
  }, [headerRepoPath]);

  // Editable state for target branch

  // Editable state for current branch
  const [isEditingCurrentBranch, setIsEditingCurrentBranch] = useState(false);
  const [editedCurrentBranch, setEditedCurrentBranch] = useState('');

  // Available branches — session snapshot + Query (no per-switch local refetch flash)
  const branchesQuery = useGitBranchesQuery(
    showHeaderGitToolbar && !isSettingUp ? headerRepoPath : null,
  );
  const availableBranches = useMemo(() => {
    const remote = branchesQuery.data?.remote ?? [];
    return [...remote].sort();
  }, [branchesQuery.data?.remote]);
  const isLoadingBranches = branchesQuery.isLoading;
  const [isTargetBranchOpen, setIsTargetBranchOpen] = useState(false);
  const [targetBranchFilter, setTargetBranchFilter] = useState('');

  // Skills modal state (URL-persisted via nuqs)
  const [isSkillsModalOpen, setSkillsModalOpen] = useQueryState("skillsModal", skillsModalParams.skillsModal);
  const [isLlmProvidersOpen, setLlmProvidersOpen] = useQueryState(
    "llmProvidersModal",
    llmProvidersModalParams.llmProvidersModal
  );
  useEffect(() => {
    if (!isLlmProvidersOpen) return;
    router.push(settingsHref("models"));
    void setLlmProvidersOpen(false);
  }, [isLlmProvidersOpen, router, setLlmProvidersOpen]);
  const desktopWebSearch = useMemo(() => {
    const query = searchParams.toString();
    return query ? `?${query}` : '';
  }, [searchParams]);
  const {
    browserUrl,
    isDesktopRuntime: isDesktopShellFromLauncher,
    isLaunching: isOpeningDesktopWeb,
    openInBrowser,
    refreshStatus: refreshDesktopWebStatus,
    status: desktopWebStatus,
  } = useDesktopWebLauncher(pathname, desktopWebSearch, showHeaderRemoteAccess);
  // Live shell detect for header chrome (AppShot / Atmos Computer). Launcher
  // state can race Electron preload on first paint — OR the two sources.
  const isDesktopRuntime = isDesktopShellFromLauncher || detectDesktopShell();

  const {
    statusMap: tunnelConnectorStatusMap,
    refreshStatus: refreshTunnelConnectorStatus,
    renew: renewTunnelConnector,
  } = useTunnelConnector(showHeaderRemoteAccess);
  // Collect all active (Running) tunnels for display in the header.
  const activeTunnelConnectors = useMemo(() =>
    Object.values(tunnelConnectorStatusMap).filter(
      (s): s is NonNullable<typeof s> =>
        !!s && s.provider_status?.state === 'Running',
    ),
    [tunnelConnectorStatusMap]
  );
  const isTunnelConnectorRunning = activeTunnelConnectors.length > 0;
  const tunnelConnectorDotColor = useMemo(() => {
    if (!isTunnelConnectorRunning) return 'bg-emerald-500';
    const urgencies = activeTunnelConnectors.map((t) => getSessionUrgency(t.expires_at));
    if (urgencies.some((u) => u === 'expired')) return 'bg-red-500';
    if (urgencies.some((u) => u === 'warning')) return 'bg-amber-500';
    return 'bg-emerald-500';
  }, [activeTunnelConnectors, isTunnelConnectorRunning]);

  const [deleteWorkspaceDialog, setDeleteWorkspaceDialog] = useState<{
    isOpen: boolean;
    workspaceId: string;
    workspaceName: string;
    onDeleted?: () => void;
  } | null>(null);
  const [deleteProjectDialog, setDeleteProjectDialog] = useState<{
    isOpen: boolean;
    projectId: string;
    projectName: string;
    canDelete: boolean;
    onDeleted?: () => void;
  } | null>(null);

  const deleteProject = useProjectStore(s => s.deleteProject);

  useHeaderHotkeys({
    refreshCurrentRoute,
    setIsQuotaPopoverOpen,
    toggleLeftSidebar,
  });

  // Sync context when project/workspace changes
  useEffect(() => {
    if (currentProjectIdForContext && currentProjectMainFilePath) {
      const effectivePath = currentWorkspaceLocalPath || currentProjectMainFilePath;
      if (currentWorkspaceId) {
        if (isSettingUp) {
          // Clear context while setting up to avoid showing stale info from previous workspace
          setCurrentContext(null, null, null);
          setCurrentProjectPath(null);
        } else {
          setCurrentContext(
            currentProjectIdForContext,
            currentWorkspaceId,
            effectivePath
          );
          // Set path first, then git status will be refreshed by the git store
          setCurrentProjectPath(effectivePath);
        }
      } else {
        // Main dev mode
        setCurrentContext(currentProjectIdForContext, null, effectivePath);
        setCurrentProjectPath(effectivePath);
      }
    } else {
      // No project selected, clear context
      setCurrentContext(null, null, null);
      setCurrentProjectPath(null);
    }
  }, [
    currentProjectIdForContext,
    currentProjectMainFilePath,
    currentWorkspaceId,
    currentWorkspaceLocalPath,
    isSettingUp,
    setCurrentContext,
    setCurrentProjectPath,
  ]);

  // Sync target branch from project to git info store
  useEffect(() => {
    if (currentProject?.targetBranch !== undefined) {
      // Only update if different from git store's target branch
      if (currentProject.targetBranch !== targetBranch) {
        useGitInfoStore.setState({ targetBranch: currentProject.targetBranch || null });
      }
    }
  }, [currentProject?.targetBranch, targetBranch]);

  // Initialize edited branches
  useEffect(() => {
    setEditedCurrentBranch(currentWorkspace?.branch || '');
  }, [currentWorkspace?.branch]);

  const filteredBranches = useMemo(
    () => availableBranches.filter(branch =>
      branch.toLowerCase().includes(targetBranchFilter.trim().toLowerCase())
    ),
    [availableBranches, targetBranchFilter]
  );

  const handleSaveCurrentBranch = async () => {
    if (!currentProject || !currentWorkspace) return;
    const newBranch = editedCurrentBranch.trim();
    const oldBranch = currentWorkspace.branch;

    if (newBranch && newBranch !== oldBranch) {
      try {
        // 1. Rename the actual git branch in the repo (using workspace path)
        const result = await gitApi.renameBranch(
          currentWorkspace.localPath,
          oldBranch,
          newBranch
        );

        if (result.success) {
          // 2. Update the workspace branch name in DB
          await updateWorkspaceBranch(currentProject.id, currentWorkspace.id, newBranch);

          // 3. Refresh git info and branches list (session + Query)
          refreshGitStatus();
          try {
            const client = getAtmosWebQueryClient();
            const scope = getComputerQueryScope();
            await client.invalidateQueries({
              queryKey: queryKeys.computer.gitBranches(scope, currentWorkspace.localPath),
            });
          } catch {
            // offline / tests
          }
        }
      } catch (error) {
        console.error('Failed to rename branch:', error);
        const errorMessage = error instanceof Error ? error.message : t("toast.unknownError");
        toastManager.add({
          title: t("toast.renameFailed"),
          description: errorMessage,
          type: 'error'
        });
        // Reset edited branch to original
        setEditedCurrentBranch(oldBranch);
      }
    }
    setIsEditingCurrentBranch(false);
  };

  const handleCancelEditCurrentBranch = () => {
    setEditedCurrentBranch(currentWorkspace?.branch || '');
    setIsEditingCurrentBranch(false);
  };

  // Get display values
  const displayCurrentBranch = currentWorkspace?.branch || currentBranch || t("labels.defaultBranch");
  const displayTargetBranch = currentProject?.targetBranch || targetBranch || t("labels.defaultMainBranch");
  const branchSyncState = useMemo(
    () => getBranchSyncIndicatorState({
      defaultBranch,
      ahead: defaultBranchAhead,
      behind: defaultBranchBehind,
    }, t),
    [defaultBranch, defaultBranchAhead, defaultBranchBehind, t]
  );

  const handleOpenDesktopWeb = useCallback(async () => {
    const opened = await openInBrowser();
    if (opened) {
      setDesktopWebPopoverOpen(false);
      return;
    }

    toastManager.add({
      title: t("toast.webNotReadyTitle"),
      description: t("toast.webNotReadyDescription"),
      type: 'error',
    });
  }, [openInBrowser, t]);

  const isAnyHeaderOverlayOpen =
    desktopWebPopoverOpen || isQuotaPopoverOpen ||
    isSkillsModalOpen || isTargetBranchOpen;

  useEffect(() => {
    setHeaderHasOpenOverlay(isAnyHeaderOverlayOpen);
  }, [isAnyHeaderOverlayOpen, setHeaderHasOpenOverlay]);

  return (
    <TooltipProvider>
      <header
        data-app-shell-header=""
        onMouseDown={handleDesktopWindowMouseDown}
        className={cn(
          "relative flex h-12 items-center justify-between px-4 select-none transition-[padding] duration-300 ease-out",
          isDesktopDragEnabled && "desktop-drag-region",
          // Header spans the full window, including over the left sidebar.
          needsTrafficLightsPadding && "pl-[92px]",
        )}
      >
        {isDesktopDragEnabled ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 desktop-drag-region"
            data-tauri-drag-region="true"
          />
        ) : null}

        {/* Left: Identity */}
        <div
          className={cn(
            // gap-6 separates chrome controls (left) from app actions (bell / quick open).
            "relative z-10 flex items-center gap-6 transition-[opacity,transform] duration-300 ease-out",
            isDesktopFullscreenExiting ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0"
          )}
        >
          {/* Chrome controls: sidebar toggle + history — one tight group. */}
          <div className="desktop-no-drag flex h-8 shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={isLeftCollapsed ? t("leftSidebar.expand") : t("leftSidebar.collapse")}
                  onClick={toggleLeftSidebar}
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {isLeftCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>{isLeftCollapsed ? t("leftSidebar.expandLabel") : t("leftSidebar.collapseLabel")}</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                    <Command className="size-3" /><span className="text-xs">B</span>
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("navigation.goBack")}
                  onClick={() => window.history.back()}
                  className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>{t("navigation.back")}</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                    <Command className="size-3" /><span className="text-xs">[</span>
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("navigation.goForward")}
                  onClick={() => window.history.forward()}
                  className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <ChevronRight className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>{t("navigation.forward")}</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                    <Command className="size-3" /><span className="text-xs">]</span>
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("navigation.refreshPage")}
                  onClick={refreshCurrentRoute}
                  className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <RotateCw className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>{t("navigation.refresh")}</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                    <Command className="size-3" /><span className="text-xs">R</span>
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          {isLeftCollapsed ? (
            <div className="flex min-w-0 max-w-[340px] items-center overflow-hidden">
              <span className="mr-2 text-lg font-light text-muted-foreground/30">/</span>
              <span className="text-balance truncate whitespace-nowrap text-[12px] font-medium text-muted-foreground">
                {currentProject?.name || t("projectFallback")}
              </span>
            </div>
          ) : null}

          {/* App actions (bell + quick open). Parent gap-6 always separates this from chrome,
              including when the bell is hidden and only Quick Open remains. */}
          <div className="desktop-no-drag flex shrink-0 items-center gap-1">
            <HeaderAttentionBell />
            {showHeaderQuickOpen && (currentWorkspace || currentProject) ? (
              <motion.div
                layout
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0"
              >
                <QuickOpen
                  workspace={currentWorkspace}
                  path={!currentWorkspace ? currentProject?.mainFilePath : null}
                />
              </motion.div>
            ) : null}
          </div>
          <HeaderWorkspaceJobs />
        </div>

        {showHeaderGitToolbar && (
          <HeaderGitContext
            branchSyncState={branchSyncState}
            currentBranchPR={currentBranchPR}
            currentProject={currentProject}
            currentWorkspace={currentWorkspace}
            displayCurrentBranch={displayCurrentBranch}
            displayTargetBranch={displayTargetBranch}
            editedCurrentBranch={editedCurrentBranch}
            filteredBranches={filteredBranches}
            hasUncommittedChanges={hasUncommittedChanges}
            hasUnpushedCommits={hasUnpushedCommits}
            isEditingCurrentBranch={isEditingCurrentBranch}
            isLoadingBranches={isLoadingBranches}
            isTargetBranchOpen={isTargetBranchOpen}
            onCancelEditCurrentBranch={handleCancelEditCurrentBranch}
            onOpenPr={(prNumber, prTitle) => {
              if (!currentBranch || !githubOwner || !githubRepo) return;
              openPullRequestTab({
                branch: currentBranch,
                owner: githubOwner,
                prNumber,
                repo: githubRepo,
                title: prTitle,
              });
            }}
            onRefreshChangedFiles={refreshGitStatus}
            onSaveCurrentBranch={handleSaveCurrentBranch}
            onSetTargetBranch={setTargetBranch}
            prIconRef={prIconRef}
            setEditedCurrentBranch={setEditedCurrentBranch}
            setIsEditingCurrentBranch={setIsEditingCurrentBranch}
            setIsTargetBranchOpen={setIsTargetBranchOpen}
            setTargetBranchFilter={setTargetBranchFilter}
            targetBranchFilter={targetBranchFilter}
            uncommittedCount={uncommittedCount}
            unpushedCount={unpushedCount}
          />
        )}

        <HeaderActionControls
          activeTunnelConnectors={activeTunnelConnectors}
          browserUrl={browserUrl}
          desktopWebPopoverOpen={desktopWebPopoverOpen}
          desktopWebStatus={desktopWebStatus}
          isDesktopRuntime={isDesktopRuntime}
          isOpeningDesktopWeb={isOpeningDesktopWeb}
          isTunnelConnectorRunning={isTunnelConnectorRunning}
          isQuotaPopoverOpen={isQuotaPopoverOpen}
          currentProjectName={currentProject?.name}
          currentWorkspaceDisplayName={currentWorkspace?.displayName}
          currentWorkspaceName={currentWorkspace?.name}
          headerProjectId={currentProjectIdForContext}
          headerWorkspaceId={currentWorkspaceId}
          headerContextId={currentWorkspaceId || currentProjectIdFromUrl || null}
          headerEffectivePath={currentWorkspaceLocalPath || currentProjectMainFilePath}
          onCloseAutoFocusPrevent={onCloseAutoFocusPrevent}
          onOpenDesktopWeb={handleOpenDesktopWeb}
          refreshDesktopWebStatus={refreshDesktopWebStatus}
          refreshTunnelConnectorStatus={refreshTunnelConnectorStatus}
          tunnelConnectorDotColor={tunnelConnectorDotColor}
          renewTunnelConnector={renewTunnelConnector}
          setDesktopWebPopoverOpen={setDesktopWebPopoverOpen}
          setGlobalSearchOpen={setGlobalSearchOpen}
          setIsQuotaPopoverOpen={setIsQuotaPopoverOpen}
        />

        {/* Delete Workspace Dialog */}
        {deleteWorkspaceDialog && (
          <DeleteWorkspaceDialog
            isOpen={deleteWorkspaceDialog.isOpen}
            onClose={() => setDeleteWorkspaceDialog(null)}
            workspaceId={deleteWorkspaceDialog.workspaceId}
            workspaceName={deleteWorkspaceDialog.workspaceName}
            onConfirm={async () => {
              // For archived workspaces, we need to call the API directly
              // since they're not in the projects.workspaces list
              try {
                await wsWorkspaceApi.delete(deleteWorkspaceDialog.workspaceId);
                deleteWorkspaceDialog.onDeleted?.();
              } catch (error) {
                console.error('Failed to delete workspace:', error);
              }
              setDeleteWorkspaceDialog(null);
            }}
          />
        )}

        {/* Delete Project Dialog */}
        {deleteProjectDialog && (
          <DeleteProjectDialog
            isOpen={deleteProjectDialog.isOpen}
            onClose={() => setDeleteProjectDialog(null)}
            projectId={deleteProjectDialog.projectId}
            projectName={deleteProjectDialog.projectName}
            canDelete={deleteProjectDialog.canDelete}
            onConfirm={async () => {
              await deleteProject(deleteProjectDialog.projectId);
              deleteProjectDialog.onDeleted?.();
              setDeleteProjectDialog(null);
            }}
          />
        )}

        {/* Skills Modal */}
        <SkillsModal
          isOpen={isSkillsModalOpen}
          onClose={() => setSkillsModalOpen(false)}
        />
      </header>
    </TooltipProvider>
  );
};

export default Header;
