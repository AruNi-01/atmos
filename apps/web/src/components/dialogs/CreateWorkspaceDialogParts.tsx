import React from 'react';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui';
import { cn } from '@/lib/utils';
import {
  Check,
  ChevronDown,
  CircleDot,
  GitBranch,
  GitPullRequestArrow,
  Github,
  Loader2,
  LoaderCircle,
  RotateCw,
} from 'lucide-react';
import type { WorkspaceLabel, WorkspacePriority, WorkspaceWorkflowStatus } from '@/types/types';
import type {
  ProjectOption,
  RepoContext,
  WorkspaceLinkType,
} from '@/components/dialogs/CreateWorkspaceDialogTypes';
import {
  WorkspaceLabelDots,
  WorkspaceLabelPicker,
  WorkspacePrioritySelect,
  WorkspaceStatusSelect,
} from '@/components/layout/sidebar/workspace-metadata-controls';

interface CreateWorkspaceHeaderProps {
  isBuildFromIssue: boolean;
  projectSelectionInHeader: boolean;
  selectedProjectName: string | null;
  isRepoLoading: boolean;
  repoLabel: string;
}

export function CreateWorkspaceHeader({
  isBuildFromIssue,
  projectSelectionInHeader,
  selectedProjectName,
  isRepoLoading,
  repoLabel,
}: CreateWorkspaceHeaderProps) {
  return (
    <DialogHeader className="flex flex-row items-start justify-between gap-4 pr-8">
      <DialogTitle>{isBuildFromIssue ? 'Build Workspace from Issue' : 'Create New Workspace'}</DialogTitle>
      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <Github className="size-3.5" />
        {!projectSelectionInHeader ? (
          <>
            <span>{selectedProjectName ?? 'Unknown project'}</span>
            <span className="opacity-40">•</span>
          </>
        ) : null}
        {isRepoLoading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            Detecting repository
          </span>
        ) : (
          <span>{repoLabel}</span>
        )}
      </div>
    </DialogHeader>
  );
}

interface ProjectSelectFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  projects: ProjectOption[];
  onChange: (projectId: string) => void;
  disabled?: boolean;
  requireSelectionMessage?: string;
}

export function ProjectSelectField({
  id,
  label,
  placeholder,
  value,
  projects,
  onChange,
  disabled,
  requireSelectionMessage,
}: ProjectSelectFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!value && requireSelectionMessage ? (
        <p className="text-xs text-destructive">{requireSelectionMessage}</p>
      ) : null}
    </div>
  );
}

interface BaseBranchFieldProps {
  baseBranch: string;
  isOpen: boolean;
  isLoading: boolean;
  remoteBranches: string[];
  branchFilter: string;
  filteredRemoteBranches: string[];
  selectedProjectId: string | null;
  onOpenChange: (open: boolean) => void;
  onFilterChange: (value: string) => void;
  onSelectBranch: (branch: string) => void;
}

export function BaseBranchField({
  baseBranch,
  isOpen,
  isLoading,
  remoteBranches,
  branchFilter,
  filteredRemoteBranches,
  selectedProjectId,
  onOpenChange,
  onFilterChange,
  onSelectBranch,
}: BaseBranchFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="workspace-base-branch-trigger">Base branch</Label>
      <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            id="workspace-base-branch-trigger"
            type="button"
            disabled={isLoading || remoteBranches.length === 0}
            className="border-input placeholder:text-muted-foreground ring-offset-background focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-9 w-full min-w-0 items-center justify-between rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          >
            <div className="flex items-center min-w-0 text-muted-foreground">
              <span className="opacity-50 shrink-0 mr-1">origin/</span>
              <span className="truncate">{baseBranch}</span>
            </div>
            <ChevronDown className="size-4 opacity-40 ml-2 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] p-3 bg-background overflow-visible"
        >
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">Select target branch</p>
            <Input
              value={branchFilter}
              onChange={(event) => onFilterChange(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search branches..."
              className="h-8 text-[12px] bg-background"
            />
          </div>
          <ScrollArea className="h-[240px] mt-2 overflow-x-auto">
            <div className="p-1 w-max min-w-full">
              {isLoading ? (
                <div className="p-2 text-[12px] text-muted-foreground text-center">Loading branches...</div>
              ) : filteredRemoteBranches.length > 0 ? (
                filteredRemoteBranches.map((remoteBranch) => (
                  <DropdownMenuItem
                    key={remoteBranch}
                    onClick={() => onSelectBranch(remoteBranch)}
                    className={cn(
                      'flex items-center justify-between text-[13px] cursor-pointer whitespace-nowrap min-w-max',
                      baseBranch === remoteBranch && 'bg-accent text-accent-foreground font-medium',
                    )}
                  >
                    <div className="flex items-center whitespace-nowrap">
                      {baseBranch === remoteBranch ? (
                        <Check className="size-3.5 mr-2 text-emerald-500 shrink-0" />
                      ) : (
                        <GitBranch className="size-3.5 mr-2 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-muted-foreground/60 mr-1">origin/</span>
                      <span>{remoteBranch}</span>
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
      <p className="text-xs text-muted-foreground">
        Workspace worktree and downstream Git comparisons will use this remote branch.
      </p>
      {!!selectedProjectId && !isLoading && remoteBranches.length === 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          No remote branches found for this project.
        </div>
      )}
    </div>
  );
}

interface WorkspaceBranchFieldProps {
  branchFieldRef: React.RefObject<HTMLDivElement | null>;
  branchInputRef: React.RefObject<HTMLInputElement | null>;
  branch: string;
  branchError: string | null;
  canRegenerateBranch: boolean;
  onBranchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRegenerateBranch: () => void;
}

export function WorkspaceBranchField({
  branchFieldRef,
  branchInputRef,
  branch,
  branchError,
  canRegenerateBranch,
  onBranchChange,
  onRegenerateBranch,
}: WorkspaceBranchFieldProps) {
  return (
    <div ref={branchFieldRef} className="grid gap-2">
      <Label htmlFor="workspace-branch">Current workspace branch</Label>
      <Input
        id="workspace-branch"
        ref={branchInputRef}
        value={branch}
        onChange={onBranchChange}
        placeholder="Workspace branch, typing..."
      />
      {branchError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span>{branchError}</span>
          {canRegenerateBranch && (
            <Button
              type="button"
              variant="link"
              className="ml-1 h-auto p-0 text-xs align-baseline"
              onClick={onRegenerateBranch}
            >
              Random generate again
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Branch name is independent from the displayed workspace name.
      </p>
    </div>
  );
}

interface GithubLinkImportSectionProps {
  linkType: WorkspaceLinkType;
  displayedLinkType: Exclude<WorkspaceLinkType, 'none'>;
  isPreselectedIssue: boolean;
  repoContext: RepoContext | null;
  isIssuesLoading: boolean;
  isPrsLoading: boolean;
  issuePanel: React.ReactNode;
  prPanel: React.ReactNode;
  onSelectLinkType: (next: Exclude<WorkspaceLinkType, 'none'>) => void;
  onRefreshIssues: () => void;
  onRefreshPrs: () => void;
}

export function GithubLinkImportSection({
  linkType,
  displayedLinkType,
  isPreselectedIssue,
  repoContext,
  isIssuesLoading,
  isPrsLoading,
  issuePanel,
  prPanel,
  onSelectLinkType,
  onRefreshIssues,
  onRefreshPrs,
}: GithubLinkImportSectionProps) {
  return (
    <div className="mt-1 rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 p-1.5">
        <button
          type="button"
          onClick={() => onSelectLinkType('issue')}
          disabled={isPreselectedIssue}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
            linkType === 'issue'
              ? 'bg-muted text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            isPreselectedIssue && 'cursor-not-allowed opacity-80',
          )}
        >
          <CircleDot className="size-4" />
          <span className="font-medium">GitHub Issue</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectLinkType('pr')}
          disabled={isPreselectedIssue}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
            linkType === 'pr'
              ? 'bg-muted text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            isPreselectedIssue && 'cursor-not-allowed opacity-50',
          )}
        >
          <GitPullRequestArrow className="size-4" />
          <span className="font-medium">GitHub PR</span>
        </button>
        {repoContext && linkType === 'issue' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onRefreshIssues}
            disabled={isIssuesLoading}
            title="Refresh issues"
          >
            {isIssuesLoading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
          </Button>
        ) : repoContext && linkType === 'pr' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onRefreshPrs}
            disabled={isPrsLoading}
            title="Refresh PRs"
          >
            {isPrsLoading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
          </Button>
        ) : null}
      </div>

      <Collapsible open={linkType !== 'none'}>
        <CollapsibleContent>
          {displayedLinkType === 'issue' ? issuePanel : null}
          {displayedLinkType === 'pr' ? prPanel : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface CreateWorkspaceFooterProps {
  priority: WorkspacePriority;
  workflowStatus: WorkspaceWorkflowStatus;
  selectedLabels: WorkspaceLabel[];
  workspaceLabels: WorkspaceLabel[];
  isSubmitting: boolean;
  canSubmit: boolean;
  onPriorityChange: (priority: WorkspacePriority) => void;
  onWorkflowStatusChange: (status: WorkspaceWorkflowStatus) => void;
  onLabelsChange: (labels: WorkspaceLabel[]) => void;
  onCreateLabel: Parameters<typeof WorkspaceLabelPicker>[0]['onCreateLabel'];
  onClose: () => void;
}

export function CreateWorkspaceFooter({
  priority,
  workflowStatus,
  selectedLabels,
  workspaceLabels,
  isSubmitting,
  canSubmit,
  onPriorityChange,
  onWorkflowStatusChange,
  onLabelsChange,
  onCreateLabel,
  onClose,
}: CreateWorkspaceFooterProps) {
  return (
    <DialogFooter className="mt-4 flex w-full flex-row items-center justify-between sm:justify-between">
      <div className="flex items-center gap-2">
        <WorkspacePrioritySelect
          value={priority}
          onChange={onPriorityChange}
          triggerVariant="icon"
          contentSide="top"
        />
        <WorkspaceStatusSelect
          value={workflowStatus}
          onChange={onWorkflowStatusChange}
          triggerVariant="icon"
          contentSide="top"
        />
        <WorkspaceLabelPicker
          labels={selectedLabels}
          availableLabels={workspaceLabels}
          onChange={onLabelsChange}
          onCreateLabel={onCreateLabel}
          triggerVariant="icon"
          contentSide="top"
          editorSide="left"
        />
        <WorkspaceLabelDots labels={selectedLabels} overlap className="pl-1" />
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {isSubmitting ? 'Creating...' : 'Create Workspace'}
        </Button>
      </div>
    </DialogFooter>
  );
}
