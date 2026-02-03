"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import {
  ArrowRight,
  Archive,
  Bell,
  Search,
  Hexagon,
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
  Puzzle,
} from '@workspace/ui';
import { QuickOpen } from './QuickOpen';
import { useGitInfoStore } from '@/hooks/use-git-info-store';
import { useProjectStore } from '@/hooks/use-project-store';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { gitApi, wsWorkspaceApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import { ArchivedWorkspacesModal } from '@/components/dialogs/ArchivedWorkspacesModal';
import { DeleteWorkspaceDialog } from '@/components/dialogs/DeleteWorkspaceDialog';
import { DeleteProjectDialog } from '@/components/dialogs/DeleteProjectDialog';
import { SkillsModal } from '@/components/skills';

const Header: React.FC = () => {
  const searchParams = useSearchParams();
  const params = useParams();
  const locale = params?.locale as string || 'en';
  const currentWorkspaceId = searchParams.get('workspaceId');

  const { projects, updateWorkspaceBranch, setupProgress } = useProjectStore();
  const { setGlobalSearchOpen } = useDialogStore();
  const { setCurrentProjectPath } = useEditorStore();
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

  const currentProjectIdFromUrl = searchParams.get('projectId');
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

  // Fullscreen state
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Skills modal state
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState(false);

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

  const { deleteWorkspace, deleteProject, fetchProjects } = useProjectStore();

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
          const branches = await gitApi.listBranches(effectivePath);
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

  const handleSaveTargetBranch = async () => {
    if (!currentProject) return;
    await setTargetBranch(
      currentProject.id,
      editedTargetBranch.trim() || null
    );
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
          const branches = await gitApi.listBranches(currentWorkspace.localPath);
          setAvailableBranches(branches.sort());

          toastManager.add({
            title: 'Branch Renamed',
            description: `Renamed branch to ${newBranch}`,
            type: 'success'
          });
        }
      } catch (error: any) {
        console.error('Failed to rename branch:', error);
        toastManager.add({
          title: 'Rename Failed',
          description: error.message || 'Unknown error',
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

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-sidebar-border select-none">
      {/* Left: Identity */}
      <div className="flex items-center space-x-4">
        <div className={cn("flex items-center text-foreground font-semibold text-balance")}>
          <Hexagon className="size-4 mr-2 text-emerald-500 fill-emerald-500/10" />
          <span className="text-[14px]">ATMOS</span>
        </div>
        <span className="text-muted-foreground/30 text-lg font-light">/</span>
        <span className="text-[12px] text-muted-foreground font-medium whitespace-nowrap text-balance">
          {currentProject?.name || 'Visual Vibe Space'}
        </span>

        <div className="pl-2">
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
          "flex items-center space-x-3 bg-muted/40 px-3 py-1.5 rounded-md border border-transparent transition-all duration-300 ease-out h-8",
          isEditingCurrentBranch
            ? "border-sidebar-border bg-background shadow-xs w-fit"
            : "hover:bg-muted/60 hover:border-border w-fit max-w-[500px]"
        )}>
          {/* Current Branch (from workspace) */}
          <div className="flex items-center space-x-2 shrink-0">
            <span
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
                className="flex items-center space-x-1.5 cursor-pointer group/branch py-0.5 px-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors overflow-hidden"
                onClick={() => setIsEditingCurrentBranch(true)}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center space-x-1 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer group/target py-0.5 px-1 rounded hover:bg-black/5 dark:hover:bg-white/5 max-w-full">
                  <span className="opacity-50 shrink-0">origin/</span>
                  <span className="truncate block max-w-[100px]">{displayTargetBranch}</span>
                  <Edit2 className="size-2.5 opacity-0 group-hover/target:opacity-100 transition-opacity ml-0.5 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56 p-0">
                <ScrollArea className="h-[200px]">
                  <div className="p-1">
                    {isLoadingBranches ? (
                      <div className="p-2 text-[12px] text-muted-foreground text-center">Loading branches...</div>
                    ) : availableBranches.length > 0 ? (
                      availableBranches.map(branch => (
                        <DropdownMenuItem
                          key={branch}
                          onClick={() => setTargetBranch(currentProject!.id, branch)}
                          className={cn(
                            "flex items-center justify-between text-[13px] cursor-pointer",
                            displayTargetBranch === branch && "bg-accent text-accent-foreground font-medium"
                          )}
                        >
                          <div className="flex items-center">
                            <GitBranch className="size-3.5 mr-2 text-muted-foreground" />
                            <span className="truncate text-muted-foreground/60 mr-1">origin/</span>
                            <span className="truncate">{branch}</span>
                          </div>
                          {displayTargetBranch === branch && <Check className="size-3.5" />}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <div className="p-2 text-[12px] text-muted-foreground text-center">No branches found</div>
                    )}
                  </div>
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center space-x-3 justify-end">
        <button
          aria-label="Search"
          className="flex items-center gap-3 px-3 py-1.5 h-8 min-w-[180px] bg-muted/40 hover:bg-muted/60 text-muted-foreground text-[12px] rounded-md border border-transparent hover:border-border transition-colors ease-out duration-200 cursor-pointer"
          onClick={() => setGlobalSearchOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>

        <ThemeToggle className="size-8 hover:bg-accent text-muted-foreground hover:text-accent-foreground" />
        <button
          onClick={() => window.open(`/${locale}/skills`, '_blank')}
          aria-label="Skills"
          className="size-8 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200 cursor-pointer"
        >
          <Puzzle className="size-4" />
        </button>
        <button
          onClick={toggleFullScreen}
          aria-label={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          className="size-8 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
        >
          {isFullScreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </button>
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
        onClose={() => setIsSkillsModalOpen(false)}
      />
    </header>
  );
};

export default Header;
