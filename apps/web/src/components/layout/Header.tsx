"use client";
import React, { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useQueryState } from "nuqs";
import { useContextParams } from "@/hooks/use-context-params";
import { llmProvidersModalParams, skillsModalParams } from "@/lib/nuqs/searchParams";
import {
  ArrowRight,
  Archive,
  Bell,
  Search,
  ThemeToggle,
  Edit2,
  Check,
  X,
  AlertCircle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Input,
  cn,
  GitBranch,
  ScrollArea,
  Maximize,
  Minimize,
  Bot,
  PopoverTrigger,
  PopoverContent,
  Popover,
  Switch,
  Button,
} from '@workspace/ui';
import { QuickOpen } from './QuickOpen';
import { useGitInfoStore } from '@/hooks/use-git-info-store';
import { useGitStore } from '@/hooks/use-git-store';
import { useProjectStore } from '@/hooks/use-project-store';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { useAgentChatUrl } from '@/hooks/use-agent-chat-url';
import { useEditorStore } from '@/hooks/use-editor-store';
import { gitApi, wsWorkspaceApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { ArchivedWorkspacesModal } from '@/components/dialogs/ArchivedWorkspacesModal';
import { DeleteWorkspaceDialog } from '@/components/dialogs/DeleteWorkspaceDialog';
import { DeleteProjectDialog } from '@/components/dialogs/DeleteProjectDialog';
import { SkillsModal } from '@/components/skills';
import { useAgentChatLayout } from '@/hooks/use-agent-chat-layout';
import { useDesktopWebLauncher } from '@/hooks/use-desktop-web-launcher';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import { useSidebarLayout } from '@/components/layout/SidebarLayoutContext';
import { BrainCircuit, ChevronLeft, ChevronRight, ExternalLink, Globe, PanelLeftClose, PanelLeftOpen, RefreshCw, Settings } from "lucide-react";
import { UsagePopover } from './UsagePopover';
import { LlmProvidersModal } from './LlmProvidersModal';
import { TokenUsageDialog } from './TokenUsageDialog';
import { SettingsModal } from '@/components/dialogs/SettingsModal';

const Header: React.FC = () => {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = params?.locale as string || 'en';
  const { workspaceId: currentWorkspaceId, projectId: currentProjectIdFromUrl } = useContextParams();
  const { isLeftCollapsed, toggleLeftSidebar } = useSidebarLayout();

  const projects = useProjectStore(s => s.projects);
  const updateWorkspaceBranch = useProjectStore(s => s.updateWorkspaceBranch);
  const setupProgress = useProjectStore(s => s.setupProgress);
  const refreshChangedFiles = useGitStore(s => s.refreshChangedFiles);
  const { setGlobalSearchOpen } = useDialogStore();
  const [, setAgentChatOpen] = useAgentChatUrl();
  const { layout, updateLayout, loadLayout } = useAgentChatLayout();
  useEffect(() => { loadLayout(); }, [loadLayout]);
  const [chatPopoverOpen, setChatPopoverOpen] = useState(false);
  const [desktopWebPopoverOpen, setDesktopWebPopoverOpen] = useState(false);
  const [isDesktopFullscreen, setIsDesktopFullscreen] = useState(false);
  const [isDesktopFullscreenExiting, setIsDesktopFullscreenExiting] = useState(false);
  const [actionsCollapsed, setActionsCollapsed] = useState(false);
  useEffect(() => {
    try { const v = localStorage.getItem("header-actions-collapsed"); if (v === "true") setActionsCollapsed(true); } catch {}
  }, []);
  const [actionsWidth, setActionsWidth] = useState(0);
  const actionsContentRef = useRef<HTMLDivElement | null>(null);
  const chatPopoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopFullscreenRef = useRef<boolean | null>(null);
  const desktopFullscreenExitRafRef = useRef<number | null>(null);
  const scheduleChatPopoverClose = useCallback(() => {
    chatPopoverTimerRef.current = setTimeout(() => setChatPopoverOpen(false), 200);
  }, []);
  const cancelChatPopoverClose = useCallback(() => {
    if (chatPopoverTimerRef.current) { clearTimeout(chatPopoverTimerRef.current); chatPopoverTimerRef.current = null; }
  }, []);

  useLayoutEffect(() => {
    const node = actionsContentRef.current;
    if (!node) return;

    const updateWidth = () => {
      setActionsWidth(node.scrollWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    window.addEventListener('resize', updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlistenResize: (() => void) | undefined;

    const clearDesktopFullscreenExitRaf = () => {
      if (desktopFullscreenExitRafRef.current !== null) {
        window.cancelAnimationFrame(desktopFullscreenExitRafRef.current);
        desktopFullscreenExitRafRef.current = null;
      }
    };

    const applyFullscreenState = (fullscreen: boolean) => {
      const previous = desktopFullscreenRef.current;
      desktopFullscreenRef.current = fullscreen;
      setIsDesktopFullscreen(fullscreen);

      clearDesktopFullscreenExitRaf();

      if (previous === true && !fullscreen) {
        setIsDesktopFullscreenExiting(true);
        desktopFullscreenExitRafRef.current = window.requestAnimationFrame(() => {
          if (!disposed) {
            setIsDesktopFullscreenExiting(false);
          }
        });
        return;
      }

      setIsDesktopFullscreenExiting(false);
    };

    const syncFullscreen = async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const fullscreen = await getCurrentWindow().isFullscreen();
      if (!disposed) {
        applyFullscreenState(fullscreen);
      }
    };

    void syncFullscreen();

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow();
      const unlisten = await currentWindow.onResized(() => {
        void syncFullscreen();
      });
      if (disposed) {
        unlisten();
        return;
      }
      unlistenResize = unlisten;
    });

    return () => {
      disposed = true;
      clearDesktopFullscreenExitRaf();
      unlistenResize?.();
    };
  }, []);
  const setCurrentProjectPath = useEditorStore(s => s.setCurrentProjectPath);
  const {
    currentBranch,
    targetBranch,
    hasUncommittedChanges,
    hasUnpushedCommits,
    uncommittedCount,
    unpushedCount,
    isLoadingStatus,
    setCurrentContext,
    setTargetBranch,
    refreshGitStatus,
  } = useGitInfoStore();

  const isSettingUp = currentWorkspaceId ? setupProgress[currentWorkspaceId]?.status !== 'completed' && !!setupProgress[currentWorkspaceId] : false;

  // Find current project based on workspaceId OR projectId
  const currentProject = projects.find(p =>
    (currentWorkspaceId && p.workspaces.some(w => w.id === currentWorkspaceId)) ||
    (!currentWorkspaceId && currentProjectIdFromUrl === p.id)
  );
  const currentWorkspace = currentProject?.workspaces.find(
    w => w.id === currentWorkspaceId
  );

  // Editable state for target branch
  const [isEditingTargetBranch, setIsEditingTargetBranch] = useState(false);
  const [editedTargetBranch, setEditedTargetBranch] = useState('');

  // Editable state for current branch
  const [isEditingCurrentBranch, setIsEditingCurrentBranch] = useState(false);
  const [editedCurrentBranch, setEditedCurrentBranch] = useState('');

  // Available branches list
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isTargetBranchOpen, setIsTargetBranchOpen] = useState(false);
  const [targetBranchFilter, setTargetBranchFilter] = useState('');

  // Fullscreen state
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Skills modal state (URL-persisted via nuqs)
  const [isSkillsModalOpen, setSkillsModalOpen] = useQueryState("skillsModal", skillsModalParams.skillsModal);
  const [isLlmProvidersOpen, setLlmProvidersOpen] = useQueryState(
    "llmProvidersModal",
    llmProvidersModalParams.llmProvidersModal
  );
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

  // Archive modal and delete dialog states
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

  const deleteWorkspace = useProjectStore(s => s.deleteWorkspace);
  const deleteProject = useProjectStore(s => s.deleteProject);
  const fetchProjects = useProjectStore(s => s.fetchProjects);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

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
  }, [currentProject?.id, currentWorkspaceId, currentWorkspace?.localPath, currentProject?.mainFilePath, isSettingUp, setCurrentContext, setCurrentProjectPath]);

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
    setEditedTargetBranch(currentProject?.targetBranch || targetBranch || '');
  }, [currentProject?.targetBranch, targetBranch]);

  useEffect(() => {
    setEditedCurrentBranch(currentWorkspace?.branch || '');
  }, [currentWorkspace?.branch]);

  const filteredBranches = useMemo(
    () => availableBranches.filter(branch =>
      branch.toLowerCase().includes(targetBranchFilter.trim().toLowerCase())
    ),
    [availableBranches, targetBranchFilter]
  );

  const handleSaveTargetBranch = async () => {
    if (!currentProject) return;
    await setTargetBranch(
      currentProject.id,
      editedTargetBranch.trim() || null
    );
    await refreshChangedFiles();
    setIsEditingTargetBranch(false);
  };

  const handleCancelEditTargetBranch = () => {
    setEditedTargetBranch(currentProject?.targetBranch || targetBranch || '');
    setIsEditingTargetBranch(false);
  };

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

          toastManager.add({
            title: 'Branch Renamed',
            description: `Renamed branch to ${newBranch}`,
            type: 'success'
          });
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

  // Status indicator color
  const getStatusColor = () => {
    if (hasUncommittedChanges || hasUnpushedCommits) {
      return 'bg-amber-500';
    }
    return 'bg-green-500';
  };

  const getStatusTooltip = () => {
    const issues: string[] = [];
    if (hasUncommittedChanges) {
      issues.push(`${uncommittedCount} uncommitted change(s)`);
    }
    if (hasUnpushedCommits) {
      issues.push(`${unpushedCount} unpushed commit(s)`);
    }
    if (issues.length === 0) {
      return 'Clean working tree';
    }
    return issues.join(', ');
  };

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
        <button
          type="button"
          aria-label={isLeftCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
          onClick={toggleLeftSidebar}
          className="desktop-no-drag inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {isLeftCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
        <div className="desktop-no-drag flex h-8 items-center gap-1">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => window.history.back()}
            className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Go forward"
            onClick={() => window.history.forward()}
            className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Refresh page"
            onClick={() => window.location.reload()}
            className="size-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="size-4" />
          </button>
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
      </div>

      {/* Center: Git Context Flow */}
      {currentWorkspace && (
        <div className={cn(
          "relative z-10 desktop-no-drag flex items-center space-x-3 bg-muted/40 px-3 py-1.5 rounded-md border border-transparent transition-all duration-300 ease-out h-8",
          isEditingCurrentBranch
            ? "border-sidebar-border bg-background shadow-xs w-fit"
            : "hover:bg-muted/60 hover:border-border w-fit max-w-[500px]"
        )}>
          {/* Current Branch (from workspace) */}
          <div className="flex items-center space-x-2 shrink-0">
            <span
              role="status"
              aria-label={getStatusTooltip()}
              className={cn("size-2 rounded-full transition-colors shrink-0", getStatusColor())}
              title={getStatusTooltip()}
            />
            {isEditingCurrentBranch ? (
              <div className="flex items-center space-x-1 animate-in fade-in zoom-in-95 duration-200">
                <Input
                  value={editedCurrentBranch}
                  onChange={(e) => setEditedCurrentBranch(e.target.value)}
                  className="h-6 w-48 text-[13px] px-2 py-0 bg-secondary/50 border-transparent focus:bg-background transition-colors rounded-sm focus:border-primary/20"
                  placeholder="branch-name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCurrentBranch();
                    if (e.key === 'Escape') handleCancelEditCurrentBranch();
                  }}
                  autoFocus
                />
                <button
                  onClick={handleSaveCurrentBranch}
                  className="size-6 flex items-center justify-center hover:bg-green-500/10 rounded-sm text-green-500 transition-colors shrink-0 relative z-20"
                  aria-label="Save current branch"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  onClick={handleCancelEditCurrentBranch}
                  className="size-6 flex items-center justify-center hover:bg-muted rounded-sm text-muted-foreground transition-colors shrink-0"
                  aria-label="Cancel editing"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className="flex items-center space-x-1.5 cursor-pointer group/branch py-0.5 px-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors overflow-hidden"
                onClick={() => setIsEditingCurrentBranch(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditingCurrentBranch(true); } }}
              >
                <span className="text-[13px] font-medium text-foreground truncate block max-w-[120px]">
                  {displayCurrentBranch}
                </span>
                {(hasUncommittedChanges || hasUnpushedCommits) && (
                  <span className="text-[11px] text-amber-500 font-medium shrink-0">
                    {hasUncommittedChanges && `+${uncommittedCount}`}
                    {hasUncommittedChanges && hasUnpushedCommits && ' '}
                    {hasUnpushedCommits && `↑${unpushedCount}`}
                  </span>
                )}
                <Edit2 className="size-2.5 opacity-0 group-hover/branch:opacity-100 transition-opacity text-muted-foreground shrink-0" />
              </div>
            )}
          </div>

          <ArrowRight className="size-3 text-muted-foreground/50 shrink-0" />

          {/* Target Branch (selectable, saved to project) */}
          <div className="flex items-center space-x-2 shrink-0 min-w-0">
            <span className="size-2 rounded-full bg-muted-foreground/30 shrink-0" />
            <DropdownMenu
              open={isTargetBranchOpen}
              onOpenChange={(open) => {
                setIsTargetBranchOpen(open);
                if (open) setTargetBranchFilter('');
              }}
            >
              <DropdownMenuTrigger asChild>
                <button className="flex items-center space-x-1 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer group/target py-0.5 px-1 rounded hover:bg-black/5 dark:hover:bg-white/5 max-w-full">
                  <span className="opacity-50 shrink-0">origin/</span>
                  <span className="truncate block max-w-[100px]">{displayTargetBranch}</span>
                  <Edit2 className="size-2.5 opacity-0 group-hover/target:opacity-100 transition-opacity ml-0.5 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-72 p-3 bg-background overflow-visible">
                <div className="space-y-2">
                  <p className="text-[12px] text-muted-foreground">Select target branch</p>
                  <Input
                    value={targetBranchFilter}
                    onChange={(e) => setTargetBranchFilter(e.target.value)}
                    placeholder="Search branches..."
                    className="h-8 text-[12px] bg-background"
                  />
                </div>
                <ScrollArea className="h-[240px] mt-2 overflow-x-auto">
                  <div className="p-1 w-max min-w-full">
                    {isLoadingBranches ? (
                      <div className="p-2 text-[12px] text-muted-foreground text-center">Loading branches...</div>
                    ) : filteredBranches.length > 0 ? (
                      filteredBranches.map(branch => (
                        <DropdownMenuItem
                          key={branch}
                          onClick={async () => {
                            await setTargetBranch(currentProject!.id, branch);
                            await refreshChangedFiles();
                          }}
                          className={cn(
                            "flex items-center justify-between text-[13px] cursor-pointer whitespace-nowrap min-w-max",
                            displayTargetBranch === branch && "bg-accent text-accent-foreground font-medium"
                          )}
                        >
                          <div className="flex items-center whitespace-nowrap">
                            {displayTargetBranch === branch ? (
                              <Check className="size-3.5 mr-2 text-emerald-500 shrink-0" />
                            ) : (
                              <GitBranch className="size-3.5 mr-2 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-muted-foreground/60 mr-1">origin/</span>
                            <span>{branch}</span>
                          </div>
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <div className="p-2 text-[12px] text-muted-foreground text-center">No matching branches</div>
                    )}
                  </div>
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Right: Actions */}
      <div className="relative z-10 flex items-center space-x-3 justify-end">
        <button
          aria-label="Search"
          className="desktop-no-drag flex items-center gap-3 px-3 py-1.5 h-8 min-w-[180px] bg-muted/40 hover:bg-muted/60 text-muted-foreground text-[12px] rounded-md border border-transparent hover:border-border transition-colors ease-out duration-200 cursor-pointer"
          onClick={() => setGlobalSearchOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>

        <div className="desktop-no-drag flex items-center justify-end">
          <motion.div
            animate={{
              width: actionsCollapsed ? 0 : actionsWidth,
              opacity: actionsCollapsed ? 0 : 1,
            }}
            transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.8 }}
            className="mr-2 shrink-0 overflow-hidden"
          >
            <div
              ref={actionsContentRef}
              className={cn(
                "flex w-max items-center gap-3",
                actionsCollapsed && "pointer-events-none"
              )}
            >
                <Popover open={chatPopoverOpen} onOpenChange={setChatPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      aria-label="Agent Chat"
                      className="size-8 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
                      onClick={() => { setChatPopoverOpen(false); setAgentChatOpen(true); }}
                      onMouseEnter={() => setChatPopoverOpen(true)}
                      onMouseLeave={() => scheduleChatPopoverClose()}
                    >
                      <Bot className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-48 p-3 bg-popover border border-border shadow-md"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onMouseEnter={() => cancelChatPopoverClose()}
                    onMouseLeave={() => scheduleChatPopoverClose()}
                  >
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-popover-foreground">Floating Ball</span>
                      <Switch
                        checked={layout.floatingBall}
                        onCheckedChange={(checked) => updateLayout({ floatingBall: !!checked })}
                      />
                    </label>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-popover-foreground">Opacity</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{layout.opacity}%</span>
                      </div>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={layout.opacity}
                        onChange={(e) => updateLayout({ opacity: Number(e.target.value) })}
                        aria-label="Chat panel opacity"
                        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted accent-primary"
                      />
                    </div>
                  </PopoverContent>
                </Popover>

                <button
                  aria-label="LLM Providers"
                  className="size-8 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
                  onClick={() => setLlmProvidersOpen(true)}
                  title="Lightweight AI Providers"
                >
                  <BrainCircuit className="size-4" />
                </button>

                <UsagePopover />
                <TokenUsageDialog />

                <div
                  aria-hidden="true"
                  className="h-4 w-px rounded-full bg-border"
                />

                {isDesktopRuntime && (
                  <Popover
                    open={desktopWebPopoverOpen}
                    onOpenChange={(open) => {
                      setDesktopWebPopoverOpen(open);
                      if (open) {
                        void refreshDesktopWebStatus();
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        aria-label="Open in Web"
                        className="size-8 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
                        title={desktopWebStatus === 'ready' ? 'Open in Web' : 'Start Web'}
                      >
                        <Globe className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" sideOffset={8} className="w-80 p-3 bg-popover border border-border shadow-md">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "size-2 rounded-full",
                              desktopWebStatus === 'ready'
                                ? 'bg-green-500'
                                : desktopWebStatus === 'checking'
                                ? 'bg-amber-500'
                                : 'bg-muted-foreground/50'
                            )} />
                            <p className="text-sm font-medium text-popover-foreground">
                              {desktopWebStatus === 'ready' ? 'Web access is ready' : 'Browser access via sidecar'}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {desktopWebStatus === 'ready'
                              ? 'Open the current page in your browser using the desktop sidecar URL, with the same API port to avoid cross-origin mismatches.'
                              : 'Use the local sidecar URL in your browser. Once the sidecar finishes warming up, the same page will open there.'}
                          </p>
                        </div>

                        {browserUrl && (
                          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground break-all">
                            {browserUrl}
                          </div>
                        )}

                        <Button
                          onClick={() => void handleOpenDesktopWeb()}
                          disabled={isOpeningDesktopWeb}
                          className="w-full cursor-pointer"
                        >
                          {isOpeningDesktopWeb
                            ? 'Starting...'
                            : desktopWebStatus === 'ready'
                            ? 'Open In Web'
                            : 'Start Web'}
                          <ExternalLink className="size-4" />
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                <ThemeToggle className="size-8 hover:bg-accent text-muted-foreground hover:text-accent-foreground" />
                {!isDesktopRuntime && (
                  <button
                    onClick={toggleFullScreen}
                    aria-label={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
                    className="size-8 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
                  >
                    {isFullScreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                  </button>
                )}
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  aria-label="Settings"
                  className="size-8 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
                >
                  <Settings className="size-4" />
                </button>
            </div>
          </motion.div>

          <button
            type="button"
            aria-label={actionsCollapsed ? "Expand header actions" : "Collapse header actions"}
            onClick={() => setActionsCollapsed((value) => { const next = !value; try { localStorage.setItem("header-actions-collapsed", String(next)); } catch {} return next; })}
            className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
          >
            {actionsCollapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>



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

      <LlmProvidersModal
        open={isLlmProvidersOpen}
        onOpenChange={setLlmProvidersOpen}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </header>
  );
};

export default Header;
