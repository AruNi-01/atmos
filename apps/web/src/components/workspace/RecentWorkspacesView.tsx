import React, { useState, useEffect, useMemo } from 'react';
import {
  Input,
  ScrollArea,
  GitBranch,
  Search,
  Folder,
  cn,
  ArrowRight,
  Badge,
  toastManager
} from "@workspace/ui"; // Keeping Badge just in case, or using divs as before
import { Project, Workspace } from '@/types/types';
import { useProjectStore } from '@/hooks/use-project-store';
import { gitApi, wsWorkspaceApi } from '@/api/ws-api';
import { format, isToday, isYesterday, subDays, subWeeks, subMonths, isAfter, subYears } from 'date-fns';
import { useRouter } from 'next/navigation';

interface EnrichedWorkspace extends Workspace {
  projectName: string;
  projectMainPath?: string;
  gitStatus?: {
    hasChanges: boolean;
    uncommitted: number;
    unpushed: number;
    loading: boolean;
    error?: boolean;
  };
  isArchivedRemote?: boolean;
}

interface GitStatus {
  loading?: boolean;
  hasChanges?: boolean;
  uncommitted?: number;
  unpushed?: number;
  error?: boolean;
}

type TimeGroup =
  | 'Today'
  | 'Yesterday'
  | '2-6 days ago'
  | '1-3 weeks ago'
  | '1-5 months ago'
  | 'Half a year ago'
  | '1 year ago'
  | 'Older';

const GROUP_ORDER: TimeGroup[] = [
  'Today',
  'Yesterday',
  '2-6 days ago',
  '1-3 weeks ago',
  '1-5 months ago',
  'Half a year ago',
  '1 year ago',
  'Older'
];

interface RecentWorkspacesViewProps {
  refreshKey?: string | number;
}

export const RecentWorkspacesView: React.FC<RecentWorkspacesViewProps> = ({ refreshKey }) => {
  const router = useRouter();
  const { projects } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [archivedWorkspaces, setArchivedWorkspaces] = useState<EnrichedWorkspace[]>([]);
  const [gitStatuses, setGitStatuses] = useState<Record<string, GitStatus>>({});

  // Fetch archived workspaces
  useEffect(() => {
    wsWorkspaceApi.listArchived().then(res => {
      const mapped = res.workspaces.map(aw => ({
        id: aw.guid,
        name: aw.name,
        branch: aw.branch,
        isActive: false,
        status: 'clean',
        projectId: aw.project_guid,
        isPinned: false,
        isArchived: true,
        isArchivedRemote: true,
        createdAt: aw.archived_at,
        localPath: '',
        projectName: aw.project_name
      } as EnrichedWorkspace));
      setArchivedWorkspaces(mapped);
    }).catch(console.error);
  }, []);

  // Combine all workspaces
  const allWorkspaces = useMemo(() => {
    // 1. Map active workspaces
    const active = projects.flatMap(p =>
      p.workspaces.map(w => ({
        ...w,
        projectName: p.name,
        projectMainPath: p.mainFilePath
      } as EnrichedWorkspace))
    );

    // 2. Map archived workspaces (joining with project data)
    const archived = archivedWorkspaces.map(aw => {
      // Try to find project info from available projects
      const project = projects.find(p => p.id === aw.projectId);
      return {
        ...aw,
        // Override name/path if we have fresh data from project store, otherwise fallback to what we have
        projectName: project?.name || aw.projectName,
        projectMainPath: project?.mainFilePath || aw.projectMainPath
      };
    });

    return [...active, ...archived].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [projects, archivedWorkspaces]);

  // Filter by search
  const filteredWorkspaces = useMemo(() => {
    if (!searchQuery) return allWorkspaces;
    const lowQuery = searchQuery.toLowerCase();
    return allWorkspaces.filter(w =>
      w.name.toLowerCase().includes(lowQuery) ||
      w.projectName.toLowerCase().includes(lowQuery) ||
      w.branch.toLowerCase().includes(lowQuery)
    );
  }, [allWorkspaces, searchQuery]);

  // Stable key for triggering git status refetch
  const workspaceIds = useMemo(() => {
    return filteredWorkspaces
      .filter(w => w.localPath && !w.isArchivedRemote)
      .map(w => w.id)
      .sort()
      .join(',');
  }, [filteredWorkspaces]);

  // Fetch Git Status for visible/filtered workspaces
  useEffect(() => {
    const toCheck = filteredWorkspaces.filter(w => w.localPath && !w.isArchivedRemote);

    let active = true;
    const fetchedIds = new Set<string>();

    const fetchStatus = async () => {
      for (const ws of toCheck) {
        if (!active) break;
        if (fetchedIds.has(ws.id)) continue;
        fetchedIds.add(ws.id);

        setGitStatuses(prev => ({ ...prev, [ws.id]: { loading: true } }));

        try {
          const status = await gitApi.getStatus(ws.localPath);
          if (!active) break;
          setGitStatuses(prev => ({
            ...prev,
            [ws.id]: {
              loading: false,
              hasChanges: status.has_uncommitted_changes || status.has_unpushed_commits,
              uncommitted: status.uncommitted_count,
              unpushed: status.unpushed_count
            }
          }));
        } catch (e) {
          if (!active) break;
          setGitStatuses(prev => ({ ...prev, [ws.id]: { loading: false, error: true } }));
        }
      }
    };

    // Reset git statuses when workspaces change
    setGitStatuses({});
    fetchStatus();

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, workspaceIds]);

  const groupedWorkspaces = useMemo(() => {
    const groups: Record<TimeGroup, EnrichedWorkspace[]> = {
      'Today': [],
      'Yesterday': [],
      '2-6 days ago': [],
      '1-3 weeks ago': [],
      '1-5 months ago': [],
      'Half a year ago': [],
      '1 year ago': [],
      'Older': []
    };

    const now = new Date();

    filteredWorkspaces.forEach(ws => {
      const date = ws.createdAt ? new Date(ws.createdAt) : new Date();
      if (isNaN(date.getTime())) return;

      if (isToday(date)) {
        groups['Today'].push(ws);
      } else if (isYesterday(date)) {
        groups['Yesterday'].push(ws);
      } else if (isAfter(date, subDays(now, 7))) {
        groups['2-6 days ago'].push(ws);
      } else if (isAfter(date, subWeeks(now, 4))) {
        groups['1-3 weeks ago'].push(ws);
      } else if (isAfter(date, subMonths(now, 6))) {
        groups['1-5 months ago'].push(ws);
      } else if (isAfter(date, subYears(now, 1))) {
        groups['Half a year ago'].push(ws);
      } else if (isAfter(date, subYears(now, 2))) {
        groups['1 year ago'].push(ws);
      } else {
        groups['Older'].push(ws);
      }
    });

    return groups;
  }, [filteredWorkspaces]);

  const handleSelect = (ws: EnrichedWorkspace) => {
    if (ws.isArchivedRemote) {
      toastManager.add({
        title: "Workspace Archived",
        description: "This workspace is archived and cannot be opened directly.",
        type: "info"
      });
      return;
    }
    router.push(`/workspace/${ws.id}`);
  };

  const truncatePath = (path: string | undefined) => {
    if (!path) return 'Unknown path';
    // If path is too long, preserve the end (filename/last dir)
    if (path.length > 35) {
      return '...' + path.slice(-32);
    }
    return path;
  };

  return (
    <div className="flex flex-col h-full bg-background/50">
      {/* Header / Search */}
      <div className="flex-none p-6 pb-2 space-y-6 max-w-4xl mx-auto w-full">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Folder className="size-5 text-muted-foreground" />
            Recent Workspaces
          </h2>
          <p className="text-sm text-muted-foreground">
            Browse and manage your recent workspaces across all projects.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workspaces..."
            className="pl-9 bg-muted/30 border-input/50 focus-visible:ring-1 h-11 text-sm rounded-sm"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6 pt-2 max-w-4xl mx-auto w-full space-y-8">
            {GROUP_ORDER.map(group => {
              const items = groupedWorkspaces[group];
              if (items.length === 0) return null;

              return (
                <div key={group} className="space-y-3">
                  <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10 border-b border-sidebar-border/50">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] text-muted-foreground font-mono">{items.length}</span>
                  </div>
                  <div className="grid gap-2">
                    {items.map(ws => {
                      const status = gitStatuses[ws.id];
                      const hasGitInfo = status && !status.loading && !status.error;

                      return (
                        <button
                          key={ws.id}
                          onClick={() => handleSelect(ws)}
                          className={cn(
                            "group flex items-center justify-between p-3 rounded-sm border border-transparent transition-all text-left w-full",
                            ws.isArchivedRemote
                              ? "opacity-60 cursor-not-allowed hover:bg-transparent"
                              : "hover:bg-muted/50 hover:border-sidebar-border/50 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            {/* Project Info - Fixed Width for Vertical Alignment */}
                            <div className="flex items-center gap-3 w-[240px] shrink-0">
                              <div className={cn(
                                "size-8 rounded-sm flex items-center justify-center font-semibold text-sm shrink-0 uppercase border",
                                ws.isArchivedRemote
                                  ? "bg-muted text-muted-foreground border-border"
                                  : "bg-primary/10 text-primary border-primary/20"
                              )}>
                                {ws.projectName[0]}
                              </div>
                              <div className="flex flex-col min-w-0 overflow-hidden">
                                <span className={cn(
                                  "text-sm font-medium truncate transition-colors",
                                  ws.isArchivedRemote ? "text-muted-foreground" : "text-foreground group-hover:text-primary"
                                )}>
                                  {ws.projectName}
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate" title={ws.projectMainPath}>
                                  {truncatePath(ws.projectMainPath)}
                                </span>
                              </div>
                            </div>

                            {/* Separator */}
                            <ArrowRight className="size-4 text-muted-foreground/20 shrink-0" />

                            {/* Workspace Info */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <GitBranch className="size-4 text-muted-foreground shrink-0" />
                                <span className={cn(
                                  "text-sm font-medium truncate",
                                  ws.isArchivedRemote ? "text-muted-foreground" : "text-foreground"
                                )}>
                                  {ws.branch}
                                </span>
                              </div>
                              {ws.branch !== ws.name && (
                                <span className="text-xs text-muted-foreground truncate opacity-60">
                                  ({ws.name})
                                </span>
                              )}
                            </div>

                            {/* Git Status / Archived Badge */}
                            {ws.isArchivedRemote ? (
                              <div className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-sm border px-3 py-1 text-[10px] font-semibold transition-colors bg-muted text-muted-foreground border-border/50">
                                <Folder className="size-3" />
                                Archived
                              </div>
                            ) : (
                              <div className="ml-auto flex items-center gap-2 shrink-0">
                                {hasGitInfo ? (
                                  <>
                                    {status.uncommitted > 0 && (
                                      <div className="inline-flex items-center rounded-sm border px-2.5 py-0.5 text-[10px] font-semibold transition-colors bg-green-500/10 text-green-500 border-green-500/20 font-mono">
                                        +{status.uncommitted}
                                      </div>
                                    )}
                                    {status.unpushed > 0 && (
                                      <div className="inline-flex items-center rounded-sm border px-2.5 py-0.5 text-[10px] font-semibold transition-colors bg-red-500/10 text-red-500 border-red-500/20 font-mono">
                                        -{status.unpushed}
                                      </div>
                                    )}
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>

                          {/* Date */}
                          <div className="w-[120px] text-right text-xs text-muted-foreground shrink-0 pl-4 tabular-nums">
                            {ws.createdAt && !isNaN(new Date(ws.createdAt).getTime()) ? format(new Date(ws.createdAt), 'MMM d, yyyy') : '-'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="pt-8 pb-4 text-center">
              <p className="text-xs text-muted-foreground">
                Only workspaces from active projects are shown here.
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
