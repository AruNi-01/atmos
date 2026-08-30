"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import {
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { ChevronDown, Folder, GitBranch, Loader2, MessageSquare, MessagesSquare, RefreshCw, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { agentChatApi, type AgentChatIndexEntry } from "@/api/ws/agent-chat-api";
import { chatSessionsParams } from "@/shared/lib/nuqs/searchParams";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  useAgentRegistryListQuery,
  useCustomAgentListQuery,
} from "@/features/agent/hooks/use-agent-registry-query";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import type { Workspace } from "@/shared/types/domain";
import {
  AGENT_CHAT_SESSION_GROUP_ORDER,
  AGENT_CHAT_SESSIONS_PAGE_LIMIT,
  ALL_AGENT_FILTER_ID,
  ALL_SESSION_CONTEXT_ID,
  DEFAULT_PROJECT_WORKSPACE_LIMIT,
  THREAD_SESSION_CONTEXT_ID,
  chatMatchesSessionScope,
  groupAgentChatSessionsByTime,
  openAgentChatHistoryRow,
  resolveAgentChatLocationLabel,
  sameStringSet,
  type AgentChatLocationKind,
} from "@/features/agent/lib/agent-chat-sessions";

interface RegistryAgentInfo {
  id: string;
  name: string;
  icon?: string | null;
  isCustom: boolean;
}

interface EnrichedSession extends AgentChatIndexEntry {
  displayTitle: string;
  displayAgent: string;
  registryIcon: string | null;
  cwdDisplay: string;
  locationKind: AgentChatLocationKind;
  isCustomAgent: boolean;
}

interface AgentChatSessionsViewProps {
  hideHeader?: boolean;
}

interface SessionContextOption {
  id: string;
  label: string;
  projectId: string | null;
}

interface WorkspaceScopeOption {
  id: string;
  label: string;
  cwd: string;
}

export const AgentChatSessionsView: React.FC<AgentChatSessionsViewProps> = ({
  hideHeader = false,
}) => {
  const t = useTranslations("chatSessions.managementView");
  const locale = useLocale();
  const router = useAppRouter();
  const [searchQuery, setSearchQuery] = useQueryState("q", chatSessionsParams.q);
  const [selectedRegistryId, setSelectedRegistryId] = useQueryState(
    "registry_id",
    chatSessionsParams.registry_id,
  );
  const [selectedSessionContextId, setSelectedSessionContextId] = useState(ALL_SESSION_CONTEXT_ID);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [draftWorkspaceIds, setDraftWorkspaceIds] = useState<string[]>([]);
  const [workspacePopoverOpen, setWorkspacePopoverOpen] = useState(false);
  const [sessions, setSessions] = useState<AgentChatIndexEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const registryQuery = useAgentRegistryListQuery();
  const customQuery = useCustomAgentListQuery();
  const projects = useProjects();
  const wsConnected = useWebSocketStore((state) => state.connectionState === "connected");
  const defaultedWorkspaceProjectIdRef = useRef<string | null>(null);

  const registryAgents = useMemo<RegistryAgentInfo[]>(() => {
    const installed = (registryQuery.data?.agents ?? [])
      .filter((agent) => agent.installed)
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        icon: agent.icon,
        isCustom: agent.install_method === "custom",
      }));
    const custom = (customQuery.data?.agents ?? []).map((agent) => ({
      id: agent.name,
      name: agent.name,
      icon: null,
      isCustom: true,
    }));
    return [...installed, ...custom];
  }, [customQuery.data?.agents, registryQuery.data?.agents]);
  const isLoadingAgents = registryQuery.isLoading || customQuery.isLoading;

  const sessionContextOptions = useMemo<SessionContextOption[]>(() => {
    const options: SessionContextOption[] = [
      {
        id: ALL_SESSION_CONTEXT_ID,
        label: t("sessionContext.all"),
        projectId: null,
      },
      {
        id: THREAD_SESSION_CONTEXT_ID,
        label: t("sessionContext.thread"),
        projectId: null,
      },
    ];
    for (const project of projects) {
      if (project.mainFilePath.trim()) {
        options.push({
          id: `project:${project.id}`,
          label: t("sessionContext.project", { name: project.name }),
          projectId: project.id,
        });
      }
    }
    return options;
  }, [projects, t]);

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

  const selectedProject = useMemo(
    () =>
      selectedSessionContext.projectId
        ? projects.find((project) => project.id === selectedSessionContext.projectId) ?? null
        : null,
    [projects, selectedSessionContext.projectId],
  );

  const projectWorkspaceOptions = useMemo<WorkspaceScopeOption[]>(() => {
    if (!selectedProject) return [];
    const visitedTime = (workspace: Workspace) => {
      const value = workspace.lastVisitedAt ?? workspace.createdAt;
      const timestamp = value ? Date.parse(value) : 0;
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };
    return selectedProject.workspaces
      .filter((workspace) => workspace.localPath.trim())
      .slice()
      .sort((a, b) => visitedTime(b) - visitedTime(a))
      .map((workspace) => ({
        id: workspace.id,
        label: workspace.displayName || workspace.name,
        cwd: workspace.localPath.trim(),
      }));
  }, [selectedProject]);

  useEffect(() => {
    const projectId = selectedProject?.id ?? null;
    if (!projectId) {
      defaultedWorkspaceProjectIdRef.current = null;
      setSelectedWorkspaceIds([]);
      setDraftWorkspaceIds([]);
      return;
    }

    const availableIds = new Set(projectWorkspaceOptions.map((workspace) => workspace.id));
    if (defaultedWorkspaceProjectIdRef.current !== projectId) {
      defaultedWorkspaceProjectIdRef.current = projectId;
      const defaultWorkspaceIds = projectWorkspaceOptions
        .slice(0, DEFAULT_PROJECT_WORKSPACE_LIMIT)
        .map((workspace) => workspace.id);
      setSelectedWorkspaceIds(defaultWorkspaceIds);
      setDraftWorkspaceIds(defaultWorkspaceIds);
      return;
    }

    setSelectedWorkspaceIds((prev) => prev.filter((id) => availableIds.has(id)));
    setDraftWorkspaceIds((prev) => prev.filter((id) => availableIds.has(id)));
  }, [projectWorkspaceOptions, selectedProject?.id]);

  const selectedWorkspaceIdSet = useMemo(
    () => new Set(selectedWorkspaceIds),
    [selectedWorkspaceIds],
  );

  const sessionListRoots = useMemo(() => {
    if (!selectedProject) return null;
    const roots = [
      selectedProject.mainFilePath.trim(),
      ...projectWorkspaceOptions
        .filter((workspace) => selectedWorkspaceIdSet.has(workspace.id))
        .map((workspace) => workspace.cwd),
    ].filter(Boolean);
    return Array.from(new Set(roots));
  }, [projectWorkspaceOptions, selectedProject, selectedWorkspaceIdSet]);

  const selectedWorkspaceCount = selectedWorkspaceIds.length;
  const workspaceSelectorLabel =
    selectedWorkspaceCount === 0
      ? t("workspaceSelector.none")
      : selectedWorkspaceCount === 1
        ? t("workspaceSelector.one")
        : t("workspaceSelector.many", { count: selectedWorkspaceCount });
  const draftWorkspaceIdSet = useMemo(() => new Set(draftWorkspaceIds), [draftWorkspaceIds]);
  const allDraftWorkspacesSelected =
    projectWorkspaceOptions.length > 0 &&
    projectWorkspaceOptions.every((workspace) => draftWorkspaceIdSet.has(workspace.id));
  const workspaceSelectionDirty = !sameStringSet(selectedWorkspaceIds, draftWorkspaceIds);

  const toggleWorkspaceSelection = useCallback((workspaceId: string, checked: boolean) => {
    setDraftWorkspaceIds((prev) => {
      if (checked) return prev.includes(workspaceId) ? prev : [...prev, workspaceId];
      return prev.filter((id) => id !== workspaceId);
    });
  }, []);

  const selectRecentWorkspaces = useCallback(() => {
    setDraftWorkspaceIds(
      projectWorkspaceOptions
        .slice(0, DEFAULT_PROJECT_WORKSPACE_LIMIT)
        .map((workspace) => workspace.id),
    );
  }, [projectWorkspaceOptions]);

  const toggleAllWorkspaces = useCallback(() => {
    const allWorkspaceIds = projectWorkspaceOptions.map((workspace) => workspace.id);
    setDraftWorkspaceIds((prev) => {
      const prevSet = new Set(prev);
      const allSelected =
        allWorkspaceIds.length > 0 &&
        allWorkspaceIds.every((workspaceId) => prevSet.has(workspaceId));
      return allSelected ? [] : allWorkspaceIds;
    });
  }, [projectWorkspaceOptions]);

  const applyWorkspaceSelection = useCallback(() => {
    const availableIds = new Set(projectWorkspaceOptions.map((workspace) => workspace.id));
    setSelectedWorkspaceIds(draftWorkspaceIds.filter((id) => availableIds.has(id)));
    setWorkspacePopoverOpen(false);
  }, [draftWorkspaceIds, projectWorkspaceOptions]);

  const handleWorkspacePopoverOpenChange = useCallback((open: boolean) => {
    setWorkspacePopoverOpen(open);
    if (open) setDraftWorkspaceIds(selectedWorkspaceIds);
  }, [selectedWorkspaceIds]);

  const loadSessions = useCallback(async (cursor?: string) => {
    if (!wsConnected) return;
    const generation = ++loadGenerationRef.current;
    const appending = Boolean(cursor);
    if (appending) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setLoadError(null);
    }
    try {
      const listed = await agentChatApi.list({
        all: true,
        cursor: cursor ?? null,
        limit: AGENT_CHAT_SESSIONS_PAGE_LIMIT,
      });
      if (generation !== loadGenerationRef.current) return;
      const items = listed.items ?? [];
      setSessions((prev) => {
        if (!appending) return items;
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...items.filter((item) => !seen.has(item.id))];
      });
      setHasMore(items.length >= AGENT_CHAT_SESSIONS_PAGE_LIMIT);
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      setLoadError(error instanceof Error ? error.message : t("emptyState.loadFailed"));
      if (!appending) setSessions([]);
    } finally {
      if (generation === loadGenerationRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [t, wsConnected]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const selectedAgent = useMemo(
    () => registryAgents.find((agent) => agent.id === selectedRegistryId) ?? null,
    [registryAgents, selectedRegistryId],
  );

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sessions.filter((session) => {
      if (selectedRegistryId && session.provider_id !== selectedRegistryId) return false;
      if (
        !chatMatchesSessionScope(session, {
          roots: sessionListRoots,
          selectedProjectId: selectedProject?.id ?? null,
          selectedWorkspaceIds,
          threadOnly: selectedSessionContextId === THREAD_SESSION_CONTEXT_ID,
        })
      ) {
        return false;
      }
      if (!query) return true;
      const location = resolveAgentChatLocationLabel(
        session,
        projects,
        t("sessionContext.thread"),
      ).label.toLowerCase();
      return (
        (session.title ?? "").toLowerCase().includes(query) ||
        session.id.toLowerCase().includes(query) ||
        session.provider_id.toLowerCase().includes(query) ||
        location.includes(query)
      );
    });
  }, [
    searchQuery,
    selectedProject?.id,
    selectedRegistryId,
    selectedSessionContextId,
    selectedWorkspaceIds,
    sessionListRoots,
    sessions,
    projects,
    t,
  ]);

  const enrichedSessions = useMemo<EnrichedSession[]>(() => {
    return filteredSessions.map((session) => {
      const agent = registryAgents.find((item) => item.id === session.provider_id);
      const location = resolveAgentChatLocationLabel(
        session,
        projects,
        t("sessionContext.thread"),
      );
      return {
        ...session,
        displayTitle:
          session.title?.trim() ||
          t("sessionCard.fallbackTitle", { sessionId: session.id.slice(0, 8) }),
        displayAgent: agent?.name || session.provider_id,
        registryIcon: agent?.icon || null,
        cwdDisplay: location.label,
        locationKind: location.kind,
        isCustomAgent: agent?.isCustom ?? false,
      };
    });
  }, [filteredSessions, projects, registryAgents, t]);

  const groupedSessions = useMemo(
    () => groupAgentChatSessionsByTime(enrichedSessions),
    [enrichedSessions],
  );

  const handleOpenSession = useCallback(
    (session: AgentChatIndexEntry) => {
      void openAgentChatHistoryRow(session, router, projects);
    },
    [projects, router],
  );

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore || sessions.length === 0) return;
    void loadSessions(sessions[sessions.length - 1]?.id);
  };

  const timeGroupLabels = useMemo(
    () => ({
      today: t("timeGroups.today"),
      yesterday: t("timeGroups.yesterday"),
      daysAgo2To6: t("timeGroups.daysAgo2To6"),
      weeksAgo1To3: t("timeGroups.weeksAgo1To3"),
      monthsAgo1To5: t("timeGroups.monthsAgo1To5"),
      older: t("timeGroups.older"),
    }),
    [t],
  );

  const renderToolbar = (compact = false) => (
    <div
      className={cn(
        "shrink-0",
        compact ? "bg-background/50 px-8 py-4 backdrop-blur-sm" : "px-8 pb-6",
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className={cn(
              "border-border/50 bg-muted/20 pl-10 focus:bg-background",
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
              <SelectValue placeholder={t("sessionContext.all")} />
            </SelectTrigger>
            <SelectContent>
              {sessionContextOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} textValue={option.label}>
                  <span className="block max-w-[320px] truncate">{option.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProject ? (
            <Popover open={workspacePopoverOpen} onOpenChange={handleWorkspacePopoverOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-between border-border/50 bg-muted/20 font-normal sm:w-[220px]",
                    compact ? "h-9" : "h-10",
                  )}
                >
                  <span className="truncate">{workspaceSelectorLabel}</span>
                  <ChevronDown className="ml-2 size-4 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] p-2">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <div className="min-w-0 text-xs font-semibold text-foreground">
                    {t("workspacePopover.title")}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={selectRecentWorkspaces}
                      disabled={projectWorkspaceOptions.length === 0}
                    >
                      {t("workspacePopover.recent", {
                        count: Math.min(
                          DEFAULT_PROJECT_WORKSPACE_LIMIT,
                          projectWorkspaceOptions.length,
                        ),
                      })}
                    </Button>
                    <Button
                      type="button"
                      variant={allDraftWorkspacesSelected ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={toggleAllWorkspaces}
                      disabled={projectWorkspaceOptions.length === 0}
                      aria-pressed={allDraftWorkspacesSelected}
                      aria-label={
                        allDraftWorkspacesSelected
                          ? t("workspacePopover.clearAllAriaLabel")
                          : t("workspacePopover.selectAllAriaLabel")
                      }
                    >
                      {t("workspacePopover.all")}
                    </Button>
                  </div>
                </div>
                <div className="mt-1 max-h-72 overflow-y-auto pr-1">
                  {projectWorkspaceOptions.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      {t("workspacePopover.empty")}
                    </div>
                  ) : (
                    projectWorkspaceOptions.map((workspace) => (
                      <label
                        key={workspace.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={draftWorkspaceIdSet.has(workspace.id)}
                          onCheckedChange={(checked) =>
                            toggleWorkspaceSelection(workspace.id, checked === true)
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{workspace.label}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/50 px-2 pt-2">
                  <span className="min-w-0 text-xs text-muted-foreground">
                    {t("workspacePopover.selectedCount", { count: draftWorkspaceIds.length })}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={applyWorkspaceSelection}
                    disabled={!workspaceSelectionDirty}
                  >
                    {t("workspacePopover.apply")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          <Select
            value={selectedRegistryId || ALL_AGENT_FILTER_ID}
            onValueChange={(value) => {
              void setSelectedRegistryId(value === ALL_AGENT_FILTER_ID ? "" : value);
            }}
            disabled={isLoadingAgents}
          >
            <SelectTrigger
              className={cn(
                "w-full border-border/50 bg-muted/20 sm:w-[220px]",
                compact ? "h-9" : "h-10",
              )}
            >
              <SelectValue
                placeholder={isLoadingAgents ? t("agentSelect.loading") : t("agentSelect.all")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENT_FILTER_ID}>{t("agentSelect.all")}</SelectItem>
              {registryAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <AgentIcon
                      registryId={agent.id}
                      name={agent.name}
                      size={14}
                      isCustom={agent.isCustom}
                      registryIcon={agent.icon}
                    />
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
                  onClick={() => void loadSessions()}
                  disabled={!wsConnected || isLoading}
                  aria-label={t("refreshAriaLabel")}
                >
                  <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("refresh")}</TooltipContent>
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
                {t("headerTitle")}
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
              {loadError ? (
                <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {loadError}
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
                    {searchQuery
                      ? t("emptyState.noSearchResultsTitle")
                      : selectedAgent
                        ? t("emptyState.noAgentSessionsTitle")
                        : t("emptyState.noSessionsTitle")}
                  </h3>
                  <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                    {searchQuery
                      ? t("emptyState.noSearchResults")
                      : selectedAgent
                        ? t("emptyState.noAgentSessionsDescription", {
                            agentName: selectedAgent.name,
                          })
                        : t("emptyState.installedAgentsHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {AGENT_CHAT_SESSION_GROUP_ORDER.map((group) => {
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
                            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
                              {timeGroupLabels[group]}
                            </span>
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
                              {items.length}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <AnimatePresence mode="popLayout">
                              {items.map((session, index) => (
                                <motion.button
                                  key={session.id}
                                  type="button"
                                  layout
                                  initial={{ opacity: 0, x: -5 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
                                  onClick={() => handleOpenSession(session)}
                                  className="group flex w-full items-center justify-between rounded-lg border border-border bg-background p-4 text-left hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm"
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-4">
                                    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-muted/30">
                                      <AgentIcon
                                        registryId={session.provider_id}
                                        name={session.displayAgent}
                                        size={22}
                                        isCustom={session.isCustomAgent}
                                        registryIcon={session.registryIcon}
                                      />
                                    </div>

                                    <div className="flex min-w-0 flex-1 flex-col">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                                          {session.displayTitle}
                                        </span>
                                        <span
                                          className={cn(
                                            "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px]",
                                            session.origin === "quick"
                                              ? "border-info/25 bg-info/10 text-info"
                                              : "border-border bg-muted text-muted-foreground",
                                          )}
                                        >
                                          {session.origin === "quick"
                                            ? t("sessionCard.quickChat")
                                            : t("sessionCard.normalChat")}
                                        </span>
                                      </div>

                                      <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="max-w-[130px] truncate">
                                              {session.displayAgent}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>{session.provider_id}</TooltipContent>
                                        </Tooltip>
                                        <span className="text-border">.</span>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="flex min-w-0 items-center gap-1">
                                              {session.locationKind === "thread" ? (
                                                <MessagesSquare className="size-3 shrink-0" />
                                              ) : session.locationKind === "workspace" ? (
                                                <GitBranch className="size-3 shrink-0" />
                                              ) : (
                                                <Folder className="size-3 shrink-0" />
                                              )}
                                              <span className="block max-w-[280px] truncate">
                                                {session.cwdDisplay || "-"}
                                              </span>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs break-all">
                                            {session.cwdDisplay || t("sessionCard.noWorkingDirectory")}
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="ml-4 w-[110px] shrink-0 text-right">
                                    <div className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                      {session.updated_at
                                        ? formatRelativeTime(session.updated_at, locale)
                                        : "-"}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground/55 tabular-nums">
                                      {session.updated_at &&
                                      !Number.isNaN(parseUTCDate(session.updated_at).getTime())
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

                  {hasMore ? (
                    <div className="flex justify-center pt-6">
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="desktop-loading-clean min-w-[200px]"
                      >
                        {isLoadingMore ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            <span>{t("loadingMore")}</span>
                          </span>
                        ) : (
                          <>
                            {t("loadMore")}
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

export default AgentChatSessionsView;
