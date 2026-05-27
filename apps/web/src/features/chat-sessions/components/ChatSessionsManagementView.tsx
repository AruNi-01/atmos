"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { formatLocalDateTime, formatRelativeTime, parseUTCDate } from "@atmos/shared";
import { AlertCircle, ChevronDown, Folder, Loader2, MessageSquare, RefreshCw, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type NativeAgentSessionItem } from "@/api/rest-api";
import { agentApi as wsAgentApi } from "@/api/ws-api";
import { chatSessionsParams } from "@/shared/lib/nuqs/searchParams";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  ACP_SESSION_LIST_PAGE_LIMIT,
  useAcpSessionList,
} from "@/features/agent/hooks/use-acp-session-list";
import { useProjectStore } from "@/features/project/store/use-project-store";

interface RegistryAgentInfo {
  id: string;
  name: string;
  icon?: string | null;
}

type TimeGroup =
  | "Today"
  | "Yesterday"
  | "2-6 days ago"
  | "1-3 weeks ago"
  | "1-5 months ago"
  | "Older";

const GROUP_ORDER: TimeGroup[] = [
  "Today",
  "Yesterday",
  "2-6 days ago",
  "1-3 weeks ago",
  "1-5 months ago",
  "Older",
];

interface EnrichedSession extends NativeAgentSessionItem {
  displayTitle: string;
  displayAgent: string;
  registryIcon: string | null;
  cwdDisplay: string;
}

interface ChatSessionsManagementViewProps {
  hideHeader?: boolean;
}

const ALL_SESSION_CONTEXT_ID = "all";

interface SessionContextOption {
  id: string;
  label: string;
  cwd: string | null;
}

export const ChatSessionsManagementView: React.FC<ChatSessionsManagementViewProps> = ({ hideHeader = false }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useQueryState("q", chatSessionsParams.q);
  const [selectedRegistryId, setSelectedRegistryId] = useQueryState("registry_id", chatSessionsParams.registry_id);
  const [selectedSessionContextId, setSelectedSessionContextId] = useState(ALL_SESSION_CONTEXT_ID);

  const [registryAgents, setRegistryAgents] = useState<RegistryAgentInfo[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const projects = useProjectStore((state) => state.projects);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const projectConnectionEpoch = useProjectStore((state) => state.connectionEpoch);
  const requestedProjectEpochRef = useRef<number | null>(null);

  useEffect(() => {
    if (requestedProjectEpochRef.current === projectConnectionEpoch) return;
    requestedProjectEpochRef.current = projectConnectionEpoch;
    void fetchProjects();
  }, [fetchProjects, projectConnectionEpoch]);

  const sessionContextOptions = useMemo<SessionContextOption[]>(() => {
    const options: SessionContextOption[] = [
      {
        id: ALL_SESSION_CONTEXT_ID,
        label: "All",
        cwd: null,
      },
    ];

    for (const project of projects) {
      const projectPath = project.mainFilePath.trim();
      if (projectPath) {
        options.push({
          id: `project:${project.id}`,
          label: `Project: ${project.name}`,
          cwd: projectPath,
        });
      }

      for (const workspace of project.workspaces) {
        const workspacePath = workspace.localPath.trim();
        if (!workspacePath) continue;
        options.push({
          id: `workspace:${workspace.id}`,
          label: `Workspace: ${project.name} / ${workspace.displayName || workspace.name}`,
          cwd: workspacePath,
        });
      }
    }

    return options;
  }, [projects]);

  useEffect(() => {
    if (sessionContextOptions.some((option) => option.id === selectedSessionContextId)) return;
    setSelectedSessionContextId(ALL_SESSION_CONTEXT_ID);
  }, [selectedSessionContextId, sessionContextOptions]);

  const selectedSessionContext = useMemo(
    () =>
      sessionContextOptions.find((option) => option.id === selectedSessionContextId) ??
      sessionContextOptions[0],
    [selectedSessionContextId, sessionContextOptions],
  );

  const {
    sessions,
    isLoading,
    isLoadingMore,
    unsupportedReason,
    resumeUnsupportedReason,
    isTruncated,
    hasMore: canLoadMore,
    loadSessions,
    loadMore,
  } = useAcpSessionList({
    registryId: selectedRegistryId,
    cwd: selectedSessionContext.cwd,
    enabled: Boolean(selectedRegistryId),
  });

  useEffect(() => {
    let cancelled = false;
    const loadRegistryAgents = async () => {
      setIsLoadingAgents(true);
      try {
        const [registry, custom] = await Promise.all([
          wsAgentApi.listRegistry(),
          wsAgentApi.listCustomAgents(),
        ]);
        if (cancelled) return;
        const installedRegistry = registry.agents
          .filter((agent) => agent.installed)
          .map((agent) => ({ id: agent.id, name: agent.name, icon: agent.icon }));
        const customAgents = custom.agents.map((agent) => ({
          id: agent.name,
          name: agent.name,
          icon: null,
        }));
        setRegistryAgents([...installedRegistry, ...customAgents]);
      } catch (error) {
        console.error("Failed to load ACP agents:", error);
        if (!cancelled) setRegistryAgents([]);
      } finally {
        if (!cancelled) setIsLoadingAgents(false);
      }
    };
    void loadRegistryAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedRegistryId || registryAgents.length === 0) return;
    void setSelectedRegistryId(registryAgents[0].id);
  }, [registryAgents, selectedRegistryId, setSelectedRegistryId]);

  const selectedAgent = useMemo(
    () => registryAgents.find((agent) => agent.id === selectedRegistryId) ?? null,
    [registryAgents, selectedRegistryId],
  );

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) =>
      (session.title ?? "").toLowerCase().includes(query) ||
      session.acp_session_id.toLowerCase().includes(query) ||
      session.registry_id.toLowerCase().includes(query) ||
      session.cwd.toLowerCase().includes(query)
    );
  }, [searchQuery, sessions]);

  const enrichedSessions = useMemo<EnrichedSession[]>(() => {
    return filteredSessions.map((session) => {
      const agent = registryAgents.find((item) => item.id === session.registry_id);
      const cwdDisplay = session.cwd.length > 48 ? `...${session.cwd.slice(-45)}` : session.cwd;
      return {
        ...session,
        displayTitle: session.title || `ACP session ${session.acp_session_id.slice(0, 8)}`,
        displayAgent: agent?.name || session.registry_id,
        registryIcon: agent?.icon || null,
        cwdDisplay,
      };
    });
  }, [filteredSessions, registryAgents]);

  const groupedSessions = useMemo(() => {
    const groups: Record<TimeGroup, EnrichedSession[]> = {
      Today: [],
      Yesterday: [],
      "2-6 days ago": [],
      "1-3 weeks ago": [],
      "1-5 months ago": [],
      Older: [],
    };

    const now = new Date();
    for (const session of enrichedSessions) {
      const date = session.updated_at ? parseUTCDate(session.updated_at) : null;
      if (!date || Number.isNaN(date.getTime())) {
        groups.Older.push(session);
        continue;
      }

      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) groups.Today.push(session);
      else if (diffDays === 1) groups.Yesterday.push(session);
      else if (diffDays <= 6) groups["2-6 days ago"].push(session);
      else if (diffDays <= 21) groups["1-3 weeks ago"].push(session);
      else if (diffDays <= 150) groups["1-5 months ago"].push(session);
      else groups.Older.push(session);
    }
    return groups;
  }, [enrichedSessions]);

  const handleOpenSession = useCallback(
    (session: NativeAgentSessionItem) => {
      const params = new URLSearchParams(window.location.search);
      params.set("chat", "true");
      params.set("agent", session.registry_id);
      params.set("session", session.acp_session_id);
      if (session.cwd) params.set("sessionCwd", session.cwd);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router],
  );

  const handleLoadMore = () => {
    if (!canLoadMore || isLoadingMore) return;
    void loadMore();
  };

  const renderToolbar = (compact = false) => (
    <div
      className={cn(
        "shrink-0",
        compact ? "border-b border-border/40 bg-background/50 px-8 py-4 backdrop-blur-sm" : "px-8 pb-6",
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search ACP sessions..."
            className={cn(
              "border-border/50 bg-muted/20 pl-10 transition-all focus:bg-background",
              compact ? "h-9 rounded-lg text-sm" : "h-10 rounded-lg",
            )}
          />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Select value={selectedSessionContextId} onValueChange={setSelectedSessionContextId}>
            <SelectTrigger
              className={cn(
                "w-full border-border/50 bg-muted/20 sm:w-[260px]",
                compact ? "h-9" : "h-10",
              )}
            >
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {sessionContextOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} textValue={option.label}>
                  <span className="block max-w-[320px] truncate">{option.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedRegistryId || undefined}
            onValueChange={(value) => {
              void setSelectedRegistryId(value);
            }}
            disabled={isLoadingAgents || registryAgents.length === 0}
          >
            <SelectTrigger
              className={cn("w-full border-border/50 bg-muted/20 sm:w-[220px]", compact ? "h-9" : "h-10")}
            >
              <SelectValue placeholder={isLoadingAgents ? "Loading agents..." : "Select ACP agent"} />
            </SelectTrigger>
            <SelectContent>
              {registryAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <AgentIcon registryId={agent.id} name={agent.name} size={14} registryIcon={agent.icon} />
                    <span className="truncate">{agent.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(compact ? "h-9 w-9" : "h-10 w-10")}
                  onClick={() => loadSessions()}
                  disabled={!selectedRegistryId || isLoading}
                  aria-label="Refresh sessions"
                >
                  <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-background/50">
        {!hideHeader ? (
          <>
            <div className="shrink-0 space-y-2 px-8 pb-6 pt-12">
              <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="size-5" />
                </div>
                ACP Sessions
              </h2>
            </div>
            {renderToolbar()}
          </>
        ) : (
          renderToolbar(true)
        )}

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-on-hover">
          <div className="px-8">
            <div className="mx-auto max-w-5xl pb-12">
              {unsupportedReason ? (
                <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{unsupportedReason}</span>
                </div>
              ) : null}

              {isTruncated ? (
                <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    This agent returned an unpaginated session list. Atmos is showing the first {ACP_SESSION_LIST_PAGE_LIMIT} items.
                  </span>
                </div>
              ) : null}

              {resumeUnsupportedReason ? (
                <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{resumeUnsupportedReason}</span>
                </div>
              ) : null}

              {isLoading && sessions.length === 0 ? (
                <div className="mt-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex animate-pulse items-center gap-4 rounded-lg border border-border/40 bg-background p-4"
                    >
                      <div className="size-10 rounded-lg bg-muted" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-1/3 rounded bg-muted" />
                        <div className="h-3 w-1/2 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : enrichedSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-5 flex size-16 items-center justify-center rounded-lg bg-muted/30">
                    <MessageSquare className="size-8 text-muted-foreground/35" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {unsupportedReason
                      ? "ACP session list unavailable"
                      : selectedAgent
                        ? "No ACP sessions"
                        : "Select an ACP agent"}
                  </h3>
                  <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                    {unsupportedReason
                      ? `${selectedAgent?.name ?? "This agent"} does not expose session history through ACP.`
                      : searchQuery
                        ? "No sessions match the current search."
                        : selectedAgent?.name ?? "Installed agents appear here."}
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {GROUP_ORDER.map((group) => {
                      const items = groupedSessions[group];
                      if (items.length === 0) return null;

                      return (
                        <motion.div
                          key={group}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="space-y-3"
                        >
                          <div className="sticky top-0 z-5 flex items-center gap-3 border-b border-border/40 bg-background/95 py-3 backdrop-blur-sm">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                              {group}
                            </span>
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                              {items.length}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <AnimatePresence mode="popLayout">
                              {items.map((session, index) => (
                                <motion.button
                                  key={session.acp_session_id}
                                  type="button"
                                  layout
                                  initial={{ opacity: 0, x: -5 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
                                  onClick={() => handleOpenSession(session)}
                                  disabled={Boolean(resumeUnsupportedReason)}
                                  title={resumeUnsupportedReason ?? undefined}
                                  className="group flex w-full items-center justify-between rounded-lg border border-border bg-background p-4 text-left transition-all duration-200 hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm disabled:pointer-events-none disabled:opacity-55"
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-4">
                                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/30">
                                      <AgentIcon
                                        registryId={session.registry_id}
                                        name={session.displayAgent}
                                        size={22}
                                        registryIcon={session.registryIcon}
                                      />
                                    </div>

                                    <div className="flex min-w-0 flex-1 flex-col">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                                          {session.displayTitle}
                                        </span>
                                        <span className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                                          ACP
                                        </span>
                                      </div>

                                      <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="max-w-[130px] truncate">{session.displayAgent}</span>
                                          </TooltipTrigger>
                                          <TooltipContent>{session.registry_id}</TooltipContent>
                                        </Tooltip>
                                        <span className="text-border">.</span>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="flex min-w-0 items-center gap-1">
                                              <Folder className="size-3 shrink-0" />
                                              <span className="block max-w-[280px] truncate" dir="rtl">
                                                {session.cwdDisplay || "-"}
                                              </span>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs break-all">
                                            {session.cwd || "No working directory"}
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="ml-4 w-[110px] shrink-0 text-right">
                                    <div className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                      {session.updated_at ? formatRelativeTime(session.updated_at) : "-"}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground/55 tabular-nums">
                                      {session.updated_at && !Number.isNaN(parseUTCDate(session.updated_at).getTime())
                                        ? formatLocalDateTime(session.updated_at, "yyyy/MM/dd HH:mm")
                                        : ""}
                                    </div>
                                  </div>
                                </motion.button>
                              ))}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {canLoadMore ? (
                    <div className="flex justify-center pt-6">
                      <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore} className="min-w-[200px]">
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            Load More
                            <ChevronDown className="ml-2 size-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ChatSessionsManagementView;
