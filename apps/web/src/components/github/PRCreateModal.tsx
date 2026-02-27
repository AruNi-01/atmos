import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Label,
  DialogClose,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ScrollArea,
} from '@workspace/ui';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { GitPullRequest, GitBranch, Loader2, X, Check, ChevronDown, Search as SearchIcon, Github } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGitStore } from '@/hooks/use-git-store';
import { gitApi } from '@/api/ws-api';

interface PRCreateModalProps {
  owner: string;
  repo: string;
  branch: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function PRCreateModal({
  owner,
  repo,
  branch,
  isOpen,
  onOpenChange,
  onCreated
}: PRCreateModalProps) {
  const send = useWebSocketStore(s => s.send);
  const currentRepoPath = useGitStore(s => s.currentRepoPath);

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(`Update from ${branch}`);
  const [body, setBody] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [isDraft, setIsDraft] = useState(false);

  // Branch selection state
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);

  // Fetch suggested values & branches
  useEffect(() => {
    if (isOpen) {
      setTitle(`Update from ${branch}`);
      setBody('');
      setLoading(false);

      if (currentRepoPath) {
        setIsLoadingBranches(true);
        gitApi.listRemoteBranches(currentRepoPath)
          .then(branches => {
            setAvailableBranches(branches.sort());
            // Set default base branch to main if it exists in remotes
            if (branches.includes('main')) {
              setBaseBranch('main');
            } else if (branches.length > 0) {
              setBaseBranch(branches[0]);
            }
          })
          .catch(err => console.error('Failed to fetch branches:', err))
          .finally(() => setIsLoadingBranches(false));
      }
    }
  }, [isOpen, branch, currentRepoPath]);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setLoading(true);
    try {
      await send('github_pr_create', {
        owner,
        repo,
        branch,
        base_branch: baseBranch,
        title: title.trim(),
        body: body.trim(),
        draft: isDraft
      });
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to create PR:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = availableBranches.filter(b =>
    b.toLowerCase().includes(branchFilter.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="min-w-[820px] w-full p-0 overflow-hidden border border-border/60 shadow-2xl bg-background"
      >
        <div className="flex flex-col h-full relative">
          {/* Close Button in Header (matching PRDetailModal) */}
          <div className="absolute right-6 top-6 z-50">
            <DialogClose asChild>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/80 transition-colors opacity-70 hover:opacity-100"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </DialogClose>
          </div>

          <DialogHeader className="px-8 pt-8 pb-6 flex flex-row items-center gap-4 space-y-0 shrink-0 relative border-b border-border/40">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20 shrink-0">
              <GitPullRequest className="size-5.5" />
            </div>
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <div className="flex items-center gap-2.5">
                <DialogTitle className="text-lg font-bold tracking-tight">Open a Pull Request</DialogTitle>
                <span className="text-muted-foreground/30 font-light select-none">|</span>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 font-medium truncate">
                  <Github className="size-3.5" />
                  <span>{owner}/{repo}</span>
                </div>
              </div>
              <DialogDescription className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5 mt-0.5">
                Propose changes from <span className="text-foreground font-mono bg-muted/50 px-1 rounded">{branch}</span> into <span className="text-foreground font-mono bg-muted/50 px-1 rounded">{baseBranch}</span>
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* Form Content */}
          <div className="px-8 py-8 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
            {/* Title Field */}
            <div className="space-y-3">
              <Label htmlFor="pr-title" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 ml-0.5 flex items-center gap-2">
                Title
                <span className="text-red-500/80">*</span>
              </Label>
              <Input
                id="pr-title"
                placeholder="What changes did you make?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 bg-muted/20 border-border/40 focus:bg-background focus:ring-1 focus:ring-primary/20 transition-all text-[14px] font-medium px-4 rounded-lg"
              />
            </div>

            {/* Branches Selection */}
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 ml-0.5">
                  Merge from
                </Label>
                <div className="h-12 px-4 flex items-center bg-muted/10 border border-border/30 rounded-lg text-xs font-mono text-muted-foreground/70 select-none group">
                  <GitBranch className="size-3.5 mr-2.5 opacity-50" />
                  <span className="truncate">{branch}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 ml-0.5">
                  Into base
                </Label>

                <DropdownMenu
                  open={isBranchDropdownOpen}
                  onOpenChange={(open) => {
                    setIsBranchDropdownOpen(open);
                    if (open) setBranchFilter('');
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button className="h-12 w-full px-4 flex items-center justify-between bg-muted/20 border border-border/40 hover:bg-muted/30 hover:border-border/60 transition-all rounded-lg text-xs font-mono text-foreground outline-none cursor-pointer group">
                      <div className="flex items-center min-w-0">
                        <GitBranch className="size-3.5 mr-2.5 text-primary/60 group-hover:text-primary transition-colors" />
                        <span className="truncate">{baseBranch}</span>
                      </div>
                      <ChevronDown className="size-4 opacity-40 group-hover:opacity-100 transition-opacity ml-2 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[280px] p-2 bg-background/98 backdrop-blur-md border border-border/50 shadow-2xl rounded-xl">
                    <div className="p-2 space-y-2">
                      <div className="relative">
                        <SearchIcon className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                        <Input
                          value={branchFilter}
                          onChange={(e) => setBranchFilter(e.target.value)}
                          placeholder="Find branch..."
                          className="h-9 pl-9 text-[12px] bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/20"
                          autoFocus
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <ScrollArea className="h-[200px] mt-1 pr-1 overflow-x-hidden">
                      <div className="p-1">
                        {isLoadingBranches ? (
                          <div className="p-4 text-[11px] text-muted-foreground text-center flex flex-col items-center gap-2">
                            <Loader2 className="size-4 animate-spin opacity-50" />
                            <span>Loading branches...</span>
                          </div>
                        ) : filteredBranches.length > 0 ? (
                          filteredBranches.map(b => (
                            <DropdownMenuItem
                              key={b}
                              onClick={() => {
                                setBaseBranch(b);
                                setIsBranchDropdownOpen(false);
                              }}
                              className={cn(
                                "flex items-center justify-between text-[12px] h-10 px-3 cursor-pointer rounded-lg mb-0.5 transition-colors",
                                baseBranch === b ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted/50"
                              )}
                            >
                              <div className="flex items-center truncate mr-2">
                                <GitBranch className={cn("size-3.5 mr-2.5 shrink-0", baseBranch === b ? "text-primary" : "text-muted-foreground/40")} />
                                <span className="truncate">{b}</span>
                              </div>
                              {baseBranch === b && <Check className="size-3.5 shrink-0" />}
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="p-4 text-[11px] text-muted-foreground text-center italic">No branches found</div>
                        )}
                      </div>
                    </ScrollArea>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Description Field */}
            <div className="space-y-3">
              <Label htmlFor="pr-body" className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 ml-0.5">
                Description
              </Label>
              <Textarea
                id="pr-body"
                placeholder="What should the reviewer know? (Markdown is supported)"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[180px] bg-muted/20 border-border/40 focus:bg-background focus:ring-1 focus:ring-primary/20 transition-all text-[14px] leading-relaxed resize-none p-4 rounded-lg shadow-inner no-scrollbar"
              />
            </div>

            {/* Draft Option */}
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-sidebar/5 border border-border/40 hover:bg-sidebar/10 transition-colors cursor-pointer group"
              onClick={() => setIsDraft(!isDraft)}>
              <div className={cn(
                "size-5 rounded-md border-2 flex items-center justify-center transition-all",
                isDraft ? "bg-primary border-primary" : "border-border/60 group-hover:border-primary/40"
              )}>
                {isDraft && <Check className="size-3.5 text-primary-foreground stroke-[3px]" />}
              </div>
              <div className="flex flex-col gap-0.5 pointer-events-none">
                <span className="text-[13.5px] font-bold">Create as draft</span>
                <span className="text-[11px] text-muted-foreground/70 font-medium tracking-tight">Draft PRs cannot be merged until they are marked as ready for review.</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-6 border-t border-border/40 bg-muted/10 flex items-center justify-end gap-4 shrink-0">
            <DialogClose asChild>
              <Button variant="ghost" className="h-11 px-6 font-bold text-xs rounded-xl hover:bg-muted transition-all opacity-70 hover:opacity-100">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleCreate}
              disabled={loading || !title.trim()}
              className="h-11 px-10 font-bold text-xs rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all min-w-[150px]"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Pull Request'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
