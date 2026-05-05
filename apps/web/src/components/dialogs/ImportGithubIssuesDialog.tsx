import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/ui/dialog';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui';
import { Input } from '@workspace/ui/components/ui/input';
import { Label } from '@workspace/ui/components/ui/label';
import { Checkbox } from '@workspace/ui/components/ui/checkbox';
import { ScrollArea } from '@workspace/ui/components/ui/scroll-area';
import { Badge } from '@workspace/ui/components/ui/badge';
import { GithubIssuePayload, wsWorkspaceApi, wsGithubApi, gitApi } from '@/api/ws-api';
import { useProjectStore } from '@/hooks/use-project-store';
import { Loader2, Search, ExternalLink, Import, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';

interface ImportGithubIssuesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onImported?: () => Promise<void> | void;
}

export const ImportGithubIssuesDialog: React.FC<ImportGithubIssuesDialogProps> = ({
  isOpen,
  onClose,
  defaultProjectId,
  onImported,
}) => {
  const projects = useProjectStore((s) => s.projects);
  const addWorkspacesToProject = useProjectStore((s) => s.addWorkspacesToProject);

  const [projectId, setProjectId] = useState(() => {
    if (defaultProjectId) return defaultProjectId;
    return projects.length > 0 ? projects[0].id : '';
  });

  // Sync projectId when projects change or defaultProjectId changes
  useEffect(() => {
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    } else if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, defaultProjectId]);

  const [repoContext, setRepoContext] = useState<{ owner: string; repo: string } | null>(null);
  const [isRepoLoading, setIsRepoLoading] = useState(false);
  const [issues, setIssues] = useState<GithubIssuePayload[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'updated'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projectId, projects],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRepoContext() {
      if (!isOpen || !selectedProject?.mainFilePath) {
        setRepoContext(null);
        return;
      }

      setIsRepoLoading(true);
      setError(null);
      setIssues([]);
      setSelectedIssues(new Set());

      try {
        const status = await gitApi.getStatus(selectedProject.mainFilePath);
        if (cancelled) return;

        if (status.github_owner && status.github_repo) {
          const context = {
            owner: status.github_owner,
            repo: status.github_repo,
          };
          setRepoContext(context);
        } else {
          setRepoContext(null);
          setError('This project is not associated with a GitHub repository. Please add a GitHub remote to import issues.');
        }
      } catch (error) {
        if (!cancelled) {
          setRepoContext(null);
          setError(error instanceof Error ? error.message : 'Failed to detect GitHub repository');
        }
      } finally {
        if (!cancelled) {
          setIsRepoLoading(false);
        }
      }
    }

    loadRepoContext();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedProject]);

  const loadIssues = async () => {
    if (!repoContext) {
      setError('No GitHub repository detected');
      return;
    }

    setIsLoadingIssues(true);
    setError(null);
    try {
      const loadedIssues = await wsGithubApi.listIssues({
        owner: repoContext.owner,
        repo: repoContext.repo,
        state: 'open',
        limit: 100,
        sort: sortBy,
        direction: sortOrder,
        search: searchQuery,
      });
      setIssues(loadedIssues);
      setSelectedIssues(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    } finally {
      setIsLoadingIssues(false);
    }
  };

  const toggleIssueSelection = (issue: GithubIssuePayload) => {
    const key = `${issue.owner}/${issue.repo}#${issue.number}`;
    const newSelected = new Set(selectedIssues);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedIssues(newSelected);
  };

  const toggleSelectAll = () => {
    const filtered = getFilteredIssues();
    const filteredKeys = filtered.map((issue) => `${issue.owner}/${issue.repo}#${issue.number}`);
    
    if (filtered.every((issue) => selectedIssues.has(`${issue.owner}/${issue.repo}#${issue.number}`))) {
      // Deselect only filtered issues
      const newSelected = new Set(selectedIssues);
      filteredKeys.forEach(key => newSelected.delete(key));
      setSelectedIssues(newSelected);
    } else {
      // Select all filtered issues
      const newSelected = new Set(selectedIssues);
      filteredKeys.forEach(key => newSelected.add(key));
      setSelectedIssues(newSelected);
    }
  };

  const getFilteredIssues = () => {
    let filtered = [...issues];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (issue) =>
          issue.title.toLowerCase().includes(query) ||
          issue.number.toString().includes(query) ||
          issue.body?.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      const dateA = new Date(sortBy === 'created' ? (a.created_at || '') : (a.updated_at || '')).getTime();
      const dateB = new Date(sortBy === 'created' ? (b.created_at || '') : (b.updated_at || '')).getTime();
      const base = dateA - dateB;
      return sortOrder === 'asc' ? base : -base;
    });

    return filtered;
  };

  const handleImport = async () => {
    if (!projectId || selectedIssues.size === 0) {
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const selectedIssuePayloads = issues.filter((issue) =>
        selectedIssues.has(`${issue.owner}/${issue.repo}#${issue.number}`)
      );

      const result = await wsWorkspaceApi.importGithubIssues({
        projectGuid: projectId,
        issues: selectedIssuePayloads,
        workflowStatus: 'backlog',
        priority: 'no_priority',
        labelGuids: null,
      });

      if (result.created.length > 0) {
        await addWorkspacesToProject(projectId, result.created.map((w) => w.guid));
      }

      if (result.skipped.length > 0 && result.created.length === 0) {
        setError('Selected issues were already imported.');
        return;
      }

      await onImported?.();

      if (result.skipped.length > 0) {
        setError(`${result.skipped.length} issue(s) were already imported and skipped.`);
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
        }
        closeTimerRef.current = setTimeout(() => onClose(), 2000);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import issues');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredIssues = getFilteredIssues();
  const allSelected = filteredIssues.length > 0 && filteredIssues.every((issue) =>
    selectedIssues.has(`${issue.owner}/${issue.repo}#${issue.number}`)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import GitHub Issues</DialogTitle>
          <DialogDescription>
            Select issues to import as Issue Only workspaces for Kanban tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Project Selection */}
          <div className="grid gap-2">
            <Label htmlFor="project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* GitHub Repository Info */}
          <div className="grid gap-2">
            <Label>GitHub Repository</Label>
            {isRepoLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Detecting repository...
              </div>
            ) : repoContext ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{repoContext.owner}/{repoContext.repo}</span>
              </div>
            ) : (
              <div className="text-sm text-destructive">
                No GitHub repository detected for this project
              </div>
            )}
          </div>

          <Button onClick={loadIssues} disabled={isLoadingIssues || !repoContext}>
            {isLoadingIssues ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load Issues
          </Button>

          {error && <div className="text-sm text-destructive">{error}</div>}

          {/* Search and Sort */}
          {issues.length > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'created' | 'updated')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                title={sortOrder === 'desc' ? 'Switch to ascending' : 'Switch to descending'}
              >
                {sortOrder === 'desc' ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
              </Button>
            </div>
          )}

          {/* Issues List */}
          {issues.length > 0 && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  id="select-all"
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                />
                <Label htmlFor="select-all" className="text-sm">
                  Select All ({selectedIssues.size} selected)
                </Label>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-4 space-y-2">
                  {filteredIssues.map((issue) => {
                    const key = `${issue.owner}/${issue.repo}#${issue.number}`;
                    const isSelected = selectedIssues.has(key);

                    return (
                      <div
                        key={key}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isSelected ? 'bg-accent border-accent' : 'hover:bg-muted'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleIssueSelection(issue)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">#{issue.number}</span>
                            <a
                              href={issue.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            {issue.labels.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {issue.labels.map((label) => (
                                  <Badge
                                    key={label.name}
                                    variant="secondary"
                                    className="text-xs"
                                    style={{
                                      backgroundColor: `#${label.color}20`,
                                      color: `#${label.color}`,
                                      borderColor: `#${label.color}`,
                                    }}
                                  >
                                    {label.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-sm font-medium truncate">{issue.title}</div>
                          {issue.body && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {issue.body}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredIssues.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      No issues match your search
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isImporting || selectedIssues.size === 0}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Import className="mr-2 h-4 w-4" />}
            Import {selectedIssues.size} Issue{selectedIssues.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
