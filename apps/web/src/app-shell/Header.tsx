"use client";
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryState, useQueryStates } from "nuqs";
import { useTheme } from "next-themes";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  llmProvidersModalParams,
  rightSidebarModalParams,
  settingsModalParams,
  skillsModalParams,
  tokenUsageParams,
} from "@/shared/lib/nuqs/searchParams";
import {
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import { QuickOpen } from './QuickOpen';
import { useGitInfoStore } from '@/features/git/store/use-git-info-store';
import { useGithubPRList } from '@/features/github/hooks/use-github';
import { useGitStore } from '@/features/git/store/use-git-store';
import { useProjectStore } from '@/features/project/store/use-project-store';
import { useDialogStore } from '@/app-shell/state/use-dialog-store';
import { useEditorStore } from '@/features/editor/store/use-editor-store';
import { gitApi, wsWorkspaceApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { DeleteWorkspaceDialog } from '@/features/workspace/components/DeleteWorkspaceDialog';
import { DeleteProjectDialog } from '@/features/project/components/DeleteProjectDialog';
import { SkillsModal } from '@/features/skills';
import { useAgentChatLayoutStore } from '@/features/agent/store/agent-chat-layout-store';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import { useFocusRestore } from '@/shared/hooks/use-focus-restore';
import { useDesktopWebLauncher } from '@/shared/hooks/use-desktop-web-launcher';
import { useTunnelConnector } from '@/features/connection/hooks/use-tunnel-connector';
import { isTauriRuntime } from '@/shared/lib/desktop-runtime';
import { useSidebarLayout } from '@/app-shell/SidebarLayoutContext';
import { useAgentChatUrl } from '@/features/agent/hooks/use-agent-chat-url';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';
import {
  ChevronLeft,
  ChevronRight,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCw,
} from "lucide-react";
import { TokenUsageDialog } from './TokenUsageDialog';
import { SettingsModal } from '@/features/settings/components/SettingsModal';
import { WorkspaceStatusPopover } from './WorkspaceStatusPopover';
import { isWorkspaceSetupBlocking } from '@/features/workspace/lib/workspace-setup';
import { getBranchSyncIndicatorState, getSessionUrgency } from './header-parts';
import { HeaderActionControls } from './header-action-controls';
import { HeaderGitContext } from './header-git-context';
import { useHeaderFullscreen } from './use-header-fullscreen';
import { useHeaderHotkeys } from './use-header-hotkeys';

const Header: React.FC = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setTheme, theme } = useTheme();
  const { workspaceId: currentWorkspaceId, projectId: currentProjectIdFromUrl } = useContextParams();
  const { isLeftCollapsed, isRightCollapsed, showRightSidebar, toggleLeftSidebar, toggleRightSidebar } = useSidebarLayout();
  const [, setAgentChatOpen] = useAgentChatUrl();

  const projects = useProjectStore(s => s.projects);
  const updateWorkspaceBranch = useProjectStore(s => s.updateWorkspaceBranch);
  const setupProgress = useProjectStore(s => s.setupProgress);
  const refreshChangedFiles = useGitStore(s => s.refreshChangedFiles);
  const { setGlobalSearchOpen, setHeaderHasOpenOverlay } = useDialogStore();
  const { layout, updateLayout, loadLayout } = useAgentChatLayoutStore();
  useEffect(() => { loadLayout(); }, [loadLayout]);
  const managementAgentsEnabled = useExperimentSettingsStore((s) => s.managementAgentsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);
  useEffect(() => {
    void loadExperimentSettings();
  }, [loadExperimentSettings]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [desktopWebPopoverOpen, setDesktopWebPopoverOpen] = useState(false);
  const [isTokenUsageOpen, setIsTokenUsageOpen] = useQueryState("tokenUsage", tokenUsageParams.tokenUsage);
  const [isUsagePopoverOpen, setIsUsagePopoverOpen] = useState(false);
  const { onCloseAutoFocusPrevent } = useFocusRestore(isUsagePopoverOpen);
  const actionMenuFocusRef = useRef<HTMLElement | null>(null);
  const {
    isDesktopFullscreen,
    isDesktopFullscreenExiting,
    isFullScreenActive,
    toggleFullScreen,
  } = useHeaderFullscreen();
  const setCurrentProjectPath = useEditorStore(s => s.setCurrentProjectPath);
  const {
    currentBranch,
    targetBranch,
    hasUncommittedChanges,
    hasUnpushedCommits,
    uncommittedCount,
    unpushedCount,
    defaultBranch,
    defaultBranchAhead,
    defaultBranchBehind,
    setCurrentContext,
    setTargetBranch,
    refreshGitStatus,
    githubOwner,
    githubRepo,
  } = useGitInfoStore();

  const [, setModalParams] = useQueryStates(rightSidebarModalParams);

  const onWsEvent = useWebSocketStore(s => s.onEvent);
  const { data: prListData, refresh: refreshHeaderPrList } = useGithubPRList({
    owner: githubOwner ?? undefined,
    repo: githubRepo ?? undefined,
    branch: currentBranch ?? undefined,
    state: 'all',
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

  // Find current project based on workspaceId OR projectId
  const currentProject = projects.find(p =>
    (currentWorkspaceId && p.workspaces.some(w => w.id === currentWorkspaceId)) ||
    (!currentWorkspaceId && currentProjectIdFromUrl === p.id)
  );
  const currentWorkspace = currentProject?.workspaces.find(
    w => w.id === currentWorkspaceId
  );
  const currentWorkspaceSetupProgress = currentWorkspaceId ? setupProgress[currentWorkspaceId] : null;
  const isSettingUp = isWorkspaceSetupBlocking(currentWorkspaceSetupProgress);

  // Editable state for target branch

  // Editable state for current branch
  const [isEditingCurrentBranch, setIsEditingCurrentBranch] = useState(false);
  const [editedCurrentBranch, setEditedCurrentBranch] = useState('');

  // Available branches list
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isTargetBranchOpen, setIsTargetBranchOpen] = useState(false);
  const [targetBranchFilter, setTargetBranchFilter] = useState('');

  // Settings modal state (URL-persisted via nuqs)
  const [isSettingsOpen, setIsSettingsOpen] = useQueryState("settingsModal", settingsModalParams.settingsModal);

  // Skills modal state (URL-persisted via nuqs)
  const [isSkillsModalOpen, setSkillsModalOpen] = useQueryState("skillsModal", skillsModalParams.skillsModal);
  const [isLlmProvidersOpen, setLlmProvidersOpen] = useQueryState(
    "llmProvidersModal",
    llmProvidersModalParams.llmProvidersModal
  );
  const [remoteAccessSettingsSection, setRemoteAccessSettingsSection] = useState<'atmos-computer' | 'tunnel-connector' | null>(null);
  useEffect(() => {
    if (isLlmProvidersOpen) {
      void setIsSettingsOpen(true);
    }
  }, [isLlmProvidersOpen, setIsSettingsOpen]);
  const desktopWebSearch = useMemo(() => {
    const query = searchParams.toString();
    return query ? `?${query}` : '';
  }, [searchParams]);
  const {
    browserUrl,
    isDesktopRuntime,
    isLaunching: isOpeningDesktopWeb,
    openInBrowser,
    refreshStatus: refreshDesktopWebStatus,
    status: desktopWebStatus,
  } = useDesktopWebLauncher(pathname, desktopWebSearch);

  const {
    statusMap: tunnelConnectorStatusMap,
    refreshStatus: refreshTunnelConnectorStatus,
    renew: renewTunnelConnector,
  } = useTunnelConnector();
  // Collect all active (Running) tunnels for display in the header.
  const activeTunnelConnectors = useMemo(() =>
    Object.values(tunnelConnectorStatusMap).filter(
      (s): s is NonNullable<typeof s> => !!s && s.provider_status.state === 'Running'
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
  const fetchProjects = useProjectStore(s => s.fetchProjects);
  const clearSetupProgress = useProjectStore(s => s.clearSetupProgress);

  useHeaderHotkeys({
    actionMenuFocusRef,
    isActionMenuOpen,
    setIsActionMenuOpen,
    setIsUsagePopoverOpen,
    showRightSidebar,
    toggleLeftSidebar,
    toggleRightSidebar,
  });

  // Sync context when project/workspace changes
  useEffect(() => {
    if (currentProject) {
      const effectivePath = currentWorkspace?.localPath || currentProject.mainFilePath;
      if (currentWorkspaceId) {
        if (isSettingUp) {
          // Clear context while setting up to avoid showing stale info from previous workspace
          setCurrentContext(null, null, null);
          setCurrentProjectPath(null);
        } else {
          setCurrentContext(
            currentProject.id,
            currentWorkspaceId,
            effectivePath
          );
          // Set path first, then git status will be refreshed by the git store
          setCurrentProjectPath(effectivePath);
        }
      } else {
        // Main dev mode
        setCurrentContext(currentProject.id, null, effectivePath);
        setCurrentProjectPath(effectivePath);
      }
    } else {
      // No project selected, clear context
      setCurrentContext(null, null, null);
      setCurrentProjectPath(null);
    }
  }, [currentProject, currentWorkspaceId, currentWorkspace?.localPath, isSettingUp, setCurrentContext, setCurrentProjectPath]);

  // Fetch available branches when project/workspace changes
  useEffect(() => {
    const effectivePath = currentWorkspace?.localPath || currentProject?.mainFilePath;
    if (effectivePath && !isSettingUp) {
      const fetchBranches = async () => {
        setIsLoadingBranches(true);
        try {
          const branches = await gitApi.listRemoteBranches(effectivePath);
          setAvailableBranches(branches.sort());
        } catch (error) {
          console.error('Failed to fetch branches:', error);
        } finally {
          setIsLoadingBranches(false);
        }
      };
      fetchBranches();
    } else {
      setAvailableBranches([]);
    }
  }, [currentProject?.mainFilePath, currentWorkspace?.localPath, isSettingUp]);

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

          // 3. Refresh git info and branches list
          refreshGitStatus();
          // Update local branches list immediately if needed
          const branches = await gitApi.listRemoteBranches(currentWorkspace.localPath);
          setAvailableBranches(branches.sort());
        }
      } catch (error) {
        console.error('Failed to rename branch:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toastManager.add({
          title: 'Rename Failed',
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
  const displayCurrentBranch = currentWorkspace?.branch || currentBranch || 'No branch';
  const displayTargetBranch = currentProject?.targetBranch || targetBranch || 'main';
  const branchSyncState = useMemo(
    () => getBranchSyncIndicatorState({
      defaultBranch,
      ahead: defaultBranchAhead,
      behind: defaultBranchBehind,
    }),
    [defaultBranch, defaultBranchAhead, defaultBranchBehind]
  );

  const handleOpenDesktopWeb = useCallback(async () => {
    const opened = await openInBrowser();
    if (opened) {
      setDesktopWebPopoverOpen(false);
      return;
    }

    toastManager.add({
      title: 'Web not ready',
      description: 'The desktop web endpoint is still starting. Try again in a moment.',
      type: 'error',
    });
  }, [openInBrowser]);

  const isAnyHeaderOverlayOpen =
    isActionMenuOpen || desktopWebPopoverOpen || isUsagePopoverOpen ||
    isTokenUsageOpen || isSettingsOpen || isSkillsModalOpen || isTargetBranchOpen;

  useEffect(() => {
    setHeaderHasOpenOverlay(isAnyHeaderOverlayOpen);
  }, [isAnyHeaderOverlayOpen, setHeaderHasOpenOverlay]);

  const resolvedThemeLabel = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";
  const handleHeaderMouseDown = useCallback(async (event: React.MouseEvent<HTMLElement>) => {
    if (!isTauriRuntime()) return;
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    const interactiveAncestor = target.closest(
      '.desktop-no-drag, button, a, input, textarea, select, summary, [role="button"], [contenteditable="true"]'
    );
    if (interactiveAncestor) return;

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().startDragging();
    } catch {
      // Ignore drag failures; native drag-region remains as fallback.
    }
  }, []);

  return (
    <TooltipProvider>
      <header
        onMouseDown={handleHeaderMouseDown}
        className={cn(
          "relative flex h-12 items-center justify-between border-b border-sidebar-border px-4 select-none transition-[padding] duration-300 ease-out",
          isTauriRuntime() && "desktop-drag-region",
          isTauriRuntime() && (isDesktopFullscreen ? "pl-4" : "pl-[92px]")
        )}
      >
        {isTauriRuntime() ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 desktop-drag-region"
            data-tauri-drag-region="true"
          />
        ) : null}

        {/* Left: Identity */}
        <div
          className={cn(
            "relative z-10 flex items-center space-x-4 transition-[opacity,transform] duration-300 ease-out",
            isDesktopFullscreenExiting ? "opacity-0 translate-x-2" : "opacity-100 translate-x-0"
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={isLeftCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
                onClick={toggleLeftSidebar}
                className="desktop-no-drag inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {isLeftCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-2">
                <span>{isLeftCollapsed ? "Expand Left Sidebar" : "Collapse Left Sidebar"}</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                  <Command className="size-3" /><span className="text-xs">B</span>
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
          <div className="desktop-no-drag flex h-8 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Go back"
                  onClick={() => window.history.back()}
                  className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>Back</span>
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
                  aria-label="Go forward"
                  onClick={() => window.history.forward()}
                  className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ChevronRight className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>Forward</span>
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
                  aria-label="Refresh page"
                  onClick={() => window.location.reload()}
                  className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <RotateCw className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>Refresh</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                    <Command className="size-3" /><span className="text-xs">R</span>
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <div
            className={cn(
              "flex items-center overflow-hidden transition-[opacity,max-width] duration-200 ease-out",
              isLeftCollapsed ? "max-w-[340px] opacity-100" : "max-w-0 opacity-0"
            )}
          >
            <span className="mr-4 text-lg font-light text-muted-foreground/30">/</span>
            <span className="text-[12px] text-muted-foreground font-medium whitespace-nowrap text-balance">
              {currentProject?.name || 'Atmosphere for Agentic Builders'}
            </span>
          </div>

          <div className="desktop-no-drag pl-2">
            {(currentWorkspace || currentProject) && (
              <QuickOpen
                workspace={currentWorkspace}
                path={!currentWorkspace ? currentProject?.mainFilePath : null}
              />
            )}
          </div>
          {currentWorkspace && currentWorkspaceSetupProgress && (
            <div className="desktop-no-drag">
              <WorkspaceStatusPopover
                progress={currentWorkspaceSetupProgress}
                onFinish={() => clearSetupProgress(currentWorkspace.id)}
              />
            </div>
          )}
        </div>

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
          onOpenPr={(prNumber) => setModalParams({ rsPr: prNumber })}
          onRefreshChangedFiles={refreshChangedFiles}
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

        <HeaderActionControls
          actionMenuFocusRef={actionMenuFocusRef}
          activeTunnelConnectors={activeTunnelConnectors}
          browserUrl={browserUrl}
          desktopWebPopoverOpen={desktopWebPopoverOpen}
          desktopWebStatus={desktopWebStatus}
          isActionMenuOpen={isActionMenuOpen}
          isDesktopRuntime={isDesktopRuntime}
          isFullScreenActive={isFullScreenActive}
          isOpeningDesktopWeb={isOpeningDesktopWeb}
          isTunnelConnectorRunning={isTunnelConnectorRunning}
          isRightCollapsed={isRightCollapsed}
          isUsagePopoverOpen={isUsagePopoverOpen}
          layout={layout}
          managementAgentsEnabled={managementAgentsEnabled}
          onCloseAutoFocusPrevent={onCloseAutoFocusPrevent}
          onOpenDesktopWeb={handleOpenDesktopWeb}
          refreshDesktopWebStatus={refreshDesktopWebStatus}
          refreshTunnelConnectorStatus={refreshTunnelConnectorStatus}
          tunnelConnectorDotColor={tunnelConnectorDotColor}
          renewTunnelConnector={renewTunnelConnector}
          resolvedThemeLabel={resolvedThemeLabel}
          setAgentChatOpen={setAgentChatOpen}
          setDesktopWebPopoverOpen={setDesktopWebPopoverOpen}
          setGlobalSearchOpen={setGlobalSearchOpen}
          setIsActionMenuOpen={setIsActionMenuOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          setIsTokenUsageOpen={setIsTokenUsageOpen}
          setIsUsagePopoverOpen={setIsUsagePopoverOpen}
          setRemoteAccessSettingsSection={setRemoteAccessSettingsSection}
          setTheme={setTheme}
          showRightSidebar={showRightSidebar}
          theme={theme}
          toggleFullScreen={toggleFullScreen}
          toggleRightSidebar={toggleRightSidebar}
          updateLayout={updateLayout}
        />

        <TokenUsageDialog
          open={isTokenUsageOpen}
          onOpenChange={setIsTokenUsageOpen}
          hideTrigger
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
                // Also update local state if workspace exists in projects
                const projectId = projects.find(p =>
                  p.workspaces.some(w => w.id === deleteWorkspaceDialog.workspaceId)
                )?.id;
                if (projectId) {
                  await fetchProjects();
                }
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

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => {
            void setIsSettingsOpen(false);
            if (isLlmProvidersOpen) {
              void setLlmProvidersOpen(false);
            }
            if (remoteAccessSettingsSection) {
              setRemoteAccessSettingsSection(null);
            }
          }}
          activeSectionOverride={isLlmProvidersOpen ? 'ai' : remoteAccessSettingsSection}
        />
      </header>
    </TooltipProvider>
  );
};

export default Header;
