import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button
} from '@workspace/ui';
import { useGithubPRDetail } from '@/hooks/use-github';
import { useWebSocketStore } from '@/hooks/use-websocket';
import { Github, ExternalLink, GitMerge, XCircle, Expand, Loader2 } from 'lucide-react';

interface PRDetailModalProps {
  owner: string;
  repo: string;
  branch: string;
  prNumber: number | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: () => void;
  onClosed?: () => void;
}

export function PRDetailModal({ owner, repo, branch, prNumber, isOpen, onOpenChange, onMerged, onClosed }: PRDetailModalProps) {
  const { data: pr, loading } = useGithubPRDetail(prNumber || 0, owner, repo);
  const send = useWebSocketStore(s => s.send);
  const [actionLoading, setActionLoading] = React.useState<'merge' | 'close' | null>(null);

  React.useEffect(() => {
    // If we want to fetch details immediately when opening: handled by hook due to dependency
  }, [prNumber, isOpen]);

  const handleMerge = async () => {
    if (!prNumber) return;
    setActionLoading('merge');
    try {
      await send('github_pr_merge', { owner, repo, pr_number: prNumber, strategy: 'squash' });
      onMerged?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    if (!prNumber) return;
    setActionLoading('close');
    try {
      await send('github_pr_close', { owner, repo, pr_number: prNumber });
      onClosed?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenBrowser = () => {
    if (!prNumber) return;
    send('github_pr_open_browser', { owner, repo, pr_number: prNumber }).catch(console.error);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Github className="size-5" />
            <DialogTitle>Pull Request #{prNumber}</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            {owner}/{repo} • {branch}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : pr ? (
          <div className="flex flex-col gap-4 text-sm mt-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{pr.title}</h3>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground whitespace-nowrap overflow-hidden">
                <span className="bg-muted px-1.5 py-px rounded font-medium truncate shrink">
                  {pr.author?.login}
                </span>
                <span>wants to merge</span>
                <span className="bg-primary/10 text-primary px-1.5 py-px rounded font-mono truncate min-w-[30px] shadow-sm">
                  {pr.commits?.length || 0} commits
                </span>
                <span>into</span>
                <span className="bg-secondary px-1.5 py-px text-secondary-foreground rounded font-mono truncate shadow-sm">
                  {pr.baseRefName || 'main'}
                </span>
                <span>from</span>
                <span className="bg-sidebar-accent px-1.5 py-px text-sidebar-foreground rounded font-mono truncate shadow-sm">
                  {pr.headRefName || branch}
                </span>
              </div>
            </div>

            {pr.body && (
              <div className="bg-sidebar-accent/30 p-4 rounded-md text-xs whitespace-pre-wrap mt-2 overflow-y-auto max-h-[40vh] border border-sidebar-border shadow-inner">
                {pr.body}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Detailed info not found...</div>
        )}

        <DialogFooter className="mt-6 flex sm:justify-between items-center bg-muted/20 p-2 rounded-lg border-t border-border">
          <Button variant="outline" size="sm" onClick={handleOpenBrowser} className="shadow-sm hover:shadow-md transition-shadow">
            <ExternalLink className="mr-2 size-4" />
            View on GitHub
          </Button>

          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClose}
              disabled={!!actionLoading}
              className="shadow-sm hover:shadow-md hover:bg-red-600 transition-all"
            >
              {actionLoading === 'close' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <XCircle className="mr-2 size-4" />}
              Close PR
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleMerge}
              disabled={!!actionLoading}
              className="shadow-md hover:shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all transform active:scale-95"
            >
              {actionLoading === 'merge' ? <Loader2 className="mr-2 size-4 animate-spin text-white" /> : <GitMerge className="mr-2 size-4 text-white" />}
              Squash and Merge
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
