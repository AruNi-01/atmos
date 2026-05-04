import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { GithubIssuePayload, wsWorkspaceApi, wsGithubApi } from '@/api/ws-api';
import { useProjectStore } from '@/hooks/use-project-store';
import { Loader2, Search, ExternalLink } from 'lucide-react';

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

  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [issues, setIssues] = useState<GithubIssuePayload[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'updated'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId && projects.length > 0) {
      const project = projects.find((p) => p.id === projectId);
      if (project?.mainFilePath) {
        const path = project.mainFilePath;
        const parts = path.split('/');
        if (parts.length >= 2) {
          setRepo(parts[parts.length - 1]);
          if (parts.length >= 3) {
            setOwner(parts[parts.length - 2]);
          }
        }
      }
    }
  }, [projectId, projects]);

  const loadIssues = async () => {
    if (!owner || !repo) {
      setError('Please enter owner and repo');
      return;
    }

    setIsLoadingIssues(true);
    setError(null);
    try {
      const loadedIssues = await wsGithubApi.listIssues({
        owner,
        repo,
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
    if (filtered.every((issue) => selectedIssues.has(`${issue.owner}/${issue.repo}#${issue.number}`))) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(
        new Set(filtered.map((issue) => `${issue.owner}/${issue.repo}#${issue.number}`))
      );
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
      const dateA = new Date(sortBy === 'created' ? a.created_at : a.updated_at).getTime();
      const dateB = new Date(sortBy === 'created' ? b.created_at : b.updated_at).getTime();
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

      onClose();
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
            <select
              id="project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Owner/Repo Input */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                placeholder="e.g., AruNi-01"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="repo">Repository</Label>
              <Input
                id="repo"
                placeholder="e.g., atmos"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={loadIssues} disabled={isLoadingIssues || !owner || !repo}>
            {isLoadingIssues ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Load Issues
          </Button>

          {error && <div className="text-sm text-destructive">{error}</div>}

          {/* Search and Sort */}
          {issues.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [sort, order] = e.target.value.split('-');
                  setSortBy(sort as 'created' | 'updated');
                  setSortOrder(order as 'asc' | 'desc');
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="created-desc">Newest First</option>
                <option value="created-asc">Oldest First</option>
                <option value="updated-desc">Recently Updated</option>
                <option value="updated-asc">Least Recently Updated</option>
              </select>
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
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import {selectedIssues.size} Issue{selectedIssues.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
