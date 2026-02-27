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
  toastManager,
  Archive,
  Button
} from "@workspace/ui";
import { Project, Workspace } from '@/types/types';
import { useProjectStore } from '@/hooks/use-project-store';
import { gitApi, wsWorkspaceApi } from '@/api/ws-api';
import { useQueryState } from "nuqs";
import { workspacesParams } from "@/lib/nuqs/searchParams";
import { parseUTCDate, format, isToday, isYesterday, subDays, subWeeks, subMonths, isAfter, subYears } from '@atmos/shared';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from "motion/react";
import { Skeleton } from "@workspace/ui";

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
  const [searchQuery, setSearchQuery] = useQueryState("q", workspacesParams.q);
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
      const date = ws.createdAt ? parseUTCDate(ws.createdAt) : new Date();
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
      <div className="flex-none p-8 pb-4 space-y-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Folder className="size-5" />
              </div>
              Recent Workspaces
            </h2>
            <p className="text-sm text-muted-foreground text-pretty max-w-sm">
              Quickly jump back into your most recent active development sessions.
            </p>
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, project, or branch..."
            className="pl-10 h-12 bg-muted/20 border-border/50 focus:bg-background transition-all rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full scrollbar-on-hover">
          <div className="p-8 pt-2 max-w-5xl mx-auto w-full space-y-10">
            <AnimatePresence mode="popLayout" initial={false}>
              {GROUP_ORDER.map(group => {
                const items = groupedWorkspaces[group];
                if (items.length === 0) return null;

                return (
                  <motion.div
                    key={group}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm py-3 z-10 border-b border-border/40">
                      <span className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-widest">{group}</span>
                      <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid gap-2.5">
                      <AnimatePresence mode="popLayout">
                        {items.map((ws, index) => {
                          const status = gitStatuses[ws.id];
                          const hasGitInfo = status && !status.loading && !status.error;

                          return (
                            <motion.button
                              key={ws.id}
                              layout
                              initial={{ opacity: 0, x: -5 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
                              onClick={() => handleSelect(ws)}
                              className={cn(
                                "group relative flex items-center justify-between p-4 rounded-xl border transition-all text-left w-full",
                                ws.isArchivedRemote
                                  ? "bg-muted/30 border-border/40 opacity-60 cursor-not-allowed"
                                  : "bg-background border-border hover:border-primary/30 hover:shadow-md cursor-pointer hover:bg-muted/50"
                              )}
                            >
                              <div className="flex items-center gap-5 min-w-0 flex-1">
                                <div className="flex items-center gap-4 w-[260px] shrink-0">
                                  <div className={cn(
                                    "size-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 uppercase border transition-transform group-hover:scale-105",
                                    ws.isArchivedRemote
                                      ? "bg-muted text-muted-foreground border-border"
                                      : "bg-primary/10 text-primary border-primary/20 shadow-sm"
                                  )}>
                                    {ws.projectName[0]}
                                  </div>
                                  <div className="flex flex-col min-w-0 overflow-hidden">
                                    <span className={cn(
                                      "text-[14px] font-semibold truncate transition-colors",
                                      ws.isArchivedRemote ? "text-muted-foreground" : "text-foreground group-hover:text-primary"
                                    )}>
                                      {ws.projectName}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground/70 truncate text-pretty" title={ws.projectMainPath}>
                                      {truncatePath(ws.projectMainPath)}
                                    </span>
                                  </div>
                                </div>

                                <ArrowRight className="size-4 text-muted-foreground/30 shrink-0 group-hover:translate-x-0.5 transition-transform" />

                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div className="flex items-center gap-2.5 min-w-0 bg-muted/30 px-2.5 py-1 rounded-lg border border-border/50">
                                    <GitBranch className="size-3.5 text-muted-foreground shrink-0" />
                                    <span className={cn(
                                      "text-[13px] font-medium truncate",
                                      ws.isArchivedRemote ? "text-muted-foreground/80" : "text-foreground/90"
                                    )}>
                                      {ws.branch}
                                    </span>
                                  </div>
                                  {ws.branch !== ws.name && (
                                    <span className="text-xs text-muted-foreground/60 truncate italic">
                                      {ws.name}
                                    </span>
                                  )}
                                </div>

                                {ws.isArchivedRemote ? (
                                  <div className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/50 px-3 py-1 text-[10px] font-bold text-muted-foreground shadow-sm">
                                    <Archive className="size-3" />
                                    ARCHIVED
                                  </div>
                                ) : (
                                  <div className="ml-auto flex items-center gap-2 shrink-0">
                                    {hasGitInfo ? (
                                      <>
                                        {status.uncommitted !== undefined && status.uncommitted > 0 && (
                                          <div className="inline-flex items-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shadow-sm font-mono">
                                            +{status.uncommitted}
                                          </div>
                                        )}
                                        {status.unpushed !== undefined && status.unpushed > 0 && (
                                          <div className="inline-flex items-center rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 shadow-sm font-mono">
                                            -{status.unpushed}
                                          </div>
                                        )}
                                      </>
                                    ) : null}
                                  </div>
                                )}
                              </div>

                              <div className="w-[110px] text-right text-[11px] font-medium text-muted-foreground/70 shrink-0 pl-6 tabular-nums">
                                {ws.createdAt && !isNaN(parseUTCDate(ws.createdAt).getTime()) ? format(parseUTCDate(ws.createdAt), 'MMM d, yyyy') : '-'}
                              </div>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filteredWorkspaces.length === 0 && searchQuery && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="size-20 rounded-3xl bg-muted/20 flex items-center justify-center mb-6">
                  <Search className="size-10 text-muted-foreground/30" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No workspaces found</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto text-pretty">
                  We couldn&apos;t find any workspaces matching &quot;{searchQuery}&quot;.
                </p>
                <Button
                  variant="link"
                  onClick={() => setSearchQuery("")}
                  className="mt-4"
                >
                  Clear search query
                </Button>
              </motion.div>
            )}

            <div className="pt-12 pb-8 text-center border-t border-border/40">
              <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
                Displaying workspaces from globally active projects
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
