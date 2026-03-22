"use client";
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryState } from "nuqs";
import { useTheme } from "next-themes";
import { useHotkeys } from "react-hotkeys-hook";
import { useContextParams } from "@/hooks/use-context-params";
import { llmProvidersModalParams, skillsModalParams } from "@/lib/nuqs/searchParams";
import {
  ArrowRight,
  Search,
  Edit2,
  Check,
  X,
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
  Button,
  ChartColumnBig,
  Laptop,
  Moon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sun,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui';
import {
  Menu,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuShortcut,
  MenuSubmenu,
  MenuSubmenuPanel,
  MenuSubmenuTrigger,
  MenuTrigger,
} from '@workspace/ui/components/animate-ui/components/base/menu';
import { QuickOpen } from './QuickOpen';
import { useGitInfoStore } from '@/hooks/use-git-info-store';
import { useGitStore } from '@/hooks/use-git-store';
import { useProjectStore } from '@/hooks/use-project-store';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { gitApi, wsWorkspaceApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { DeleteWorkspaceDialog } from '@/components/dialogs/DeleteWorkspaceDialog';
import { DeleteProjectDialog } from '@/components/dialogs/DeleteProjectDialog';
import { SkillsModal } from '@/components/skills';
import { useAgentChatLayout } from '@/hooks/use-agent-chat-layout';
import { useDesktopWebLauncher } from '@/hooks/use-desktop-web-launcher';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import { useSidebarLayout } from '@/components/layout/SidebarLayoutContext';
import { useAgentChatUrl } from '@/hooks/use-agent-chat-url';
import { ArrowBigUp, ChevronLeft, ChevronRight, Command, ExternalLink, Globe, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw, Settings, SlidersHorizontal, SunMoon } from "lucide-react";
import { UsagePopover } from './UsagePopover';
import { TokenUsageDialog } from './TokenUsageDialog';
import { SettingsModal } from '@/components/dialogs/SettingsModal';

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
  const { setGlobalSearchOpen } = useDialogStore();
  const { layout, updateLayout, loadLayout } = useAgentChatLayout();
  useEffect(() => { loadLayout(); }, [loadLayout]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [desktopWebPopoverOpen, setDesktopWebPopoverOpen] = useState(false);
  const [isTokenUsageOpen, setIsTokenUsageOpen] = useState(false);
  const [isUsagePopoverOpen, setIsUsagePopoverOpen] = useState(false);
  const [isDesktopFullscreen, setIsDesktopFullscreen] = useState(false);
  const [isDesktopFullscreenExiting, setIsDesktopFullscreenExiting] = useState(false);
  const desktopFullscreenRef = useRef<boolean | null>(null);
  const desktopFullscreenExitRafRef = useRef<number | null>(null);
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
  useEffect(() => {
    if (isLlmProvidersOpen) {
      setIsSettingsOpen(true);
    }
  }, [isLlmProvidersOpen]);
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

  const toggleFullScreen = useCallback(async () => {
    if (isTauriRuntime()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWindow = getCurrentWindow();
      await currentWindow.setFullscreen(!isDesktopFullscreen);
      return;
    }

    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }

    if (document.exitFullscreen) {
      await document.exitFullscreen();
    }
  }, [isDesktopFullscreen]);

  // Keyboard shortcuts using react-hotkeys-hook
  useHotkeys('mod+b', toggleLeftSidebar, {
    enableOnFormTags: false,
    preventDefault: true,
    description: 'Toggle left sidebar'
  });

  useHotkeys(['mod+[', 'mod+leftbracket'], (e) => {
    e.preventDefault();
    window.history.back();
  }, {
    enableOnFormTags: false,
    preventDefault: true,
    description: 'Go back'
  });

  useHotkeys(['mod+]', 'mod+rightbracket'], (e) => {
    e.preventDefault();
    window.history.forward();
  }, {
    enableOnFormTags: false,
    preventDefault: true,
    description: 'Go forward'
  });

  useHotkeys('mod+r', () => window.location.reload(), {
    enableOnFormTags: false,
    preventDefault: true,
    description: 'Refresh page'
  });

  useHotkeys('mod+u', () => setIsUsagePopoverOpen(prev => !prev), {
    enableOnFormTags: false,
    preventDefault: true,
    description: 'Toggle AI Usage'
  });

  useHotkeys('mod+m', () => setIsActionMenuOpen(prev => !prev), {
    enableOnFormTags: false,
    preventDefault: true,
    description: 'Toggle menu'
  });

  useHotkeys('mod+shift+b', () => {
    if (showRightSidebar) {
      toggleRightSidebar();
    }
  }, {
    enableOnFormTags: false,
    preventDefault: true,
    description: 'Toggle right sidebar'
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
      return 'bg-warning';
    }
    return 'bg-success';
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

  const resolvedThemeLabel = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";
  const isFullScreenActive = isTauriRuntime() ? isDesktopFullscreen : isFullScreen;

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
                <RefreshCw className="size-4" />
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
      </div>

      {/* Center: Git Context Flow */}
      {(currentWorkspace || currentProject) && (
        <div className={cn(
          "relative z-10 desktop-no-drag flex items-center space-x-2 bg-muted/40 px-3 py-1.5 rounded-md border border-transparent transition-all duration-300 ease-out h-8",
          currentWorkspace && isEditingCurrentBranch
            ? "border-sidebar-border bg-background shadow-xs w-fit"
            : "hover:bg-muted/60 hover:border-border w-fit max-w-[500px]"
        )}>
          {/* Current Branch (from workspace or project main) */}
          <div className="flex items-center space-x-1 shrink-0">
            <span
              role="status"
              aria-label={getStatusTooltip()}
              className={cn("size-2 rounded-full transition-colors shrink-0", getStatusColor())}
              title={getStatusTooltip()}
            />
            {currentWorkspace && isEditingCurrentBranch ? (
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
                  className="relative z-20 flex size-6 items-center justify-center rounded-sm text-success transition-colors hover:bg-success/10 shrink-0"
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
                role={currentWorkspace ? "button" : undefined}
                tabIndex={currentWorkspace ? 0 : undefined}
                className={cn(
                  "flex items-center space-x-1.5 py-0.5 px-1 rounded transition-colors overflow-hidden",
                  currentWorkspace && "cursor-pointer group/branch hover:bg-accent"
                )}
                onClick={currentWorkspace ? () => setIsEditingCurrentBranch(true) : undefined}
                onKeyDown={currentWorkspace ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditingCurrentBranch(true); } } : undefined}
              >
                <span className="text-[13px] font-medium text-foreground truncate block max-w-[120px]">
                  {displayCurrentBranch}
                </span>
                {(hasUncommittedChanges || hasUnpushedCommits) && (
                  <span className="text-[11px] text-warning font-medium shrink-0">
                    {hasUncommittedChanges && `+${uncommittedCount}`}
                    {hasUncommittedChanges && hasUnpushedCommits && ' '}
                    {hasUnpushedCommits && `↑${unpushedCount}`}
                  </span>
                )}
                {currentWorkspace && (
                  <Edit2 className="size-2.5 opacity-0 group-hover/branch:opacity-100 transition-opacity text-muted-foreground shrink-0" />
                )}
              </div>
            )}
          </div>

          <ArrowRight className="size-3 text-muted-foreground/50 shrink-0 -ml-1" />

          {/* Target Branch (selectable, saved to project) */}
          <div className="flex items-center shrink-0 min-w-0">
            <DropdownMenu
              open={isTargetBranchOpen}
              onOpenChange={(open) => {
                setIsTargetBranchOpen(open);
                if (open) setTargetBranchFilter('');
              }}
            >
              <DropdownMenuTrigger asChild>
                <button className="flex items-center space-x-1 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer group/target py-0.5 px-1 rounded hover:bg-accent max-w-full">
                  <span className="opacity-50 shrink-0">origin/</span>
                  <span className="truncate block max-w-[100px]">{displayTargetBranch}</span>
                  <Edit2 className="size-2.5 opacity-0 group-hover/target:opacity-100 transition-opacity ml-0.5 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-72 p-3 bg-background overflow-visible">
                <div className="space-y-2">
                  <p className="text-[12px] text-foreground/90">Select target branch</p>
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
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
            <Command className="size-3" /><span className="text-xs">K</span>
          </kbd>
        </button>

        <div className="desktop-no-drag flex items-center justify-end gap-2">
          {isDesktopRuntime ? (
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
                  className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
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
                          ? 'bg-success'
                          : desktopWebStatus === 'checking'
                            ? 'bg-warning'
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

                  {browserUrl ? (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground break-all">
                      {browserUrl}
                    </div>
                  ) : null}

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
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <UsagePopover open={isUsagePopoverOpen} onOpenChange={setIsUsagePopoverOpen} />
            </TooltipTrigger>
            <TooltipContent>
            <div className="flex items-center gap-2">
              <span>AI Usage</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                <Command className="size-3" /><span className="text-xs">U</span>
              </kbd>
            </div>
            </TooltipContent>
          </Tooltip>

          <Menu open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Open actions menu"
                      className="size-8 flex items-center justify-center rounded-md text-base font-medium tracking-[0.18em] text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="translate-x-[0.08em]">···</span>
                    </button>
                  }
                />
              </TooltipTrigger>
              <TooltipContent>
              <div className="flex items-center gap-2">
                <span>Menu</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                  <Command className="size-3" /><span className="text-xs">M</span>
                </kbd>
              </div>
              </TooltipContent>
            </Tooltip>
            <MenuPanel align="end" sideOffset={8} className="w-56">
              <MenuItem
                closeOnClick
                onClick={() => {
                  setIsSettingsOpen(true);
                  setIsActionMenuOpen(false);
                }}
              >
                <Settings className="size-4" />
                Settings
              </MenuItem>

              <MenuSubmenu>
                <MenuSubmenuTrigger className="[&_[data-slot=chevron]]:ml-2">
                  <span className="flex items-center gap-2">
                    <SunMoon className="size-4 text-foreground/90" />
                    <span>Theme</span>
                  </span>
                  <span className="ml-auto text-xs tracking-wide text-foreground/90">
                    {resolvedThemeLabel}
                  </span>
                </MenuSubmenuTrigger>
                <MenuSubmenuPanel className="w-44">
                  <MenuItem
                    closeOnClick
                    onClick={() => {
                      setTheme("light");
                      setIsActionMenuOpen(false);
                    }}
                  >
                    <Sun className="size-4" />
                    Light
                    {theme === "light" ? <MenuShortcut>Current</MenuShortcut> : null}
                  </MenuItem>
                  <MenuItem
                    closeOnClick
                    onClick={() => {
                      setTheme("dark");
                      setIsActionMenuOpen(false);
                    }}
                  >
                    <Moon className="size-4" />
                    Dark
                    {theme === "dark" ? <MenuShortcut>Current</MenuShortcut> : null}
                  </MenuItem>
                  <MenuItem
                    closeOnClick
                    onClick={() => {
                      setTheme("system");
                      setIsActionMenuOpen(false);
                    }}
                  >
                    <Laptop className="size-4" />
                    System
                    {theme === "system" ? <MenuShortcut>Current</MenuShortcut> : null}
                  </MenuItem>
                </MenuSubmenuPanel>
              </MenuSubmenu>

              <MenuItem
                closeOnClick
                onClick={() => {
                  void toggleFullScreen();
                  setIsActionMenuOpen(false);
                }}
              >
                {isFullScreenActive ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                {isFullScreenActive ? "Exit Full Screen" : "Enter Full Screen"}
              </MenuItem>

              <MenuSeparator />

              <MenuSubmenu>
                <MenuSubmenuTrigger>
                  <span className="flex items-center gap-2">
                    <Bot className="size-4 text-foreground/90" />
                    <span>Agent</span>
                  </span>
                </MenuSubmenuTrigger>
                <MenuSubmenuPanel className="w-64">
                  <MenuItem
                    closeOnClick
                    onClick={() => {
                      setAgentChatOpen(true);
                      setIsActionMenuOpen(false);
                    }}
                  >
                    Open Agent Chat
                  </MenuItem>

                  <MenuItem
                    closeOnClick={false}
                    onClick={() => updateLayout({ floatingBall: !layout.floatingBall })}
                  >
                    <span>Floating Ball</span>
                    <span className="ml-auto">
                      <Switch
                        checked={layout.floatingBall}
                        onCheckedChange={(checked) => updateLayout({ floatingBall: !!checked })}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </span>
                  </MenuItem>

                  <MenuItem closeOnClick={false} className="pr-3">
                    <div className="flex w-full items-center gap-3">
                      <span className="min-w-14 text-sm text-foreground">Opacity</span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={layout.opacity}
                        onChange={(e) => updateLayout({ opacity: Number(e.target.value) })}
                        aria-label="Agent floating ball opacity"
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/18 accent-foreground/35"
                      />
                      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                        {layout.opacity}%
                      </span>
                    </div>
                  </MenuItem>
                </MenuSubmenuPanel>
              </MenuSubmenu>

              <MenuItem
                closeOnClick
                onClick={() => {
                  setIsTokenUsageOpen(true);
                  setIsActionMenuOpen(false);
                }}
              >
                <ChartColumnBig className="size-4" />
                Token Usage
              </MenuItem>
            </MenuPanel>
          </Menu>

          <AnimatePresence initial={false}>
            {showRightSidebar ? (
              <motion.div
                key="right-sidebar-toggle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={isRightCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
                      onClick={toggleRightSidebar}
                      className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                    >
                      {isRightCollapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex items-center gap-2">
                      <span>{isRightCollapsed ? "Expand Right Sidebar" : "Collapse Right Sidebar"}</span>
                      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                        <Command className="size-3" /><ArrowBigUp className="size-3" /><span className="text-xs">B</span>
                      </kbd>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

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
          setIsSettingsOpen(false);
          if (isLlmProvidersOpen) {
            void setLlmProvidersOpen(false);
          }
        }}
        activeSectionOverride={isLlmProvidersOpen ? 'ai' : null}
      />
      </header>
    </TooltipProvider>
  );
};

export default Header;
