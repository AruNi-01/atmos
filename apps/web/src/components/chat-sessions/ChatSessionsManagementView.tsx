"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Input,
  Search,
  cn,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@workspace/ui";
import { agentApi, type AgentChatSessionItem, type ListAgentSessionsResponse } from '@/api/rest-api';
import { agentApi as wsAgentApi } from '@/api/ws-api';
import { AgentIcon } from '@/components/agent/AgentIcon';
import { useQueryState } from "nuqs";
import { chatSessionsParams } from "@/lib/nuqs/searchParams";
import { agentChatParams } from "@/lib/nuqs/searchParams";
import { formatLocalDateTime, formatRelativeTime, parseUTCDate } from '@atmos/shared';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from "motion/react";
import { 
  MessageSquare, 
  ChevronDown, 
  Folder, 
  FolderOpen,
  GitBranch,
  Loader2,
  X,
  Trash2,
  FolderInput
} from 'lucide-react';

// Registry agent names cache
interface RegistryAgentInfo {
  id: string;
  name: string;
}

type TimeGroup = 
  | 'Today'
  | 'Yesterday'
  | '2-6 days ago'
  | '1-3 weeks ago'
  | '1-5 months ago'
  | 'Older';

const GROUP_ORDER: TimeGroup[] = [
  'Today',
  'Yesterday',
  '2-6 days ago',
  '1-3 weeks ago',
  '1-5 months ago',
  'Older'
];

interface EnrichedSession extends AgentChatSessionItem {
  displayTitle: string;
  displayAgent: string;
  contextLabel: string;
  cwdDisplay: string;
}

interface ChatSessionsManagementViewProps {
  hideHeader?: boolean;
}

export const ChatSessionsManagementView: React.FC<ChatSessionsManagementViewProps> = ({ hideHeader = false }) => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useQueryState("q", chatSessionsParams.q);
  const [registryIdFilter, setRegistryIdFilter] = useQueryState("registry_id", chatSessionsParams.registry_id);
  const [statusFilter, setStatusFilter] = useQueryState<"active" | "closed" | "">("status", chatSessionsParams.status);
  const [modeFilter, setModeFilter] = useQueryState<"default" | "wiki_ask" | "">("mode", chatSessionsParams.mode);
  
  const [sessions, setSessions] = useState<AgentChatSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  
  // Registry agents for filter dropdown
  const [registryAgents, setRegistryAgents] = useState<RegistryAgentInfo[]>([]);

  // Load registry agents + custom agents on mount
  useEffect(() => {
    const loadRegistryAgents = async () => {
      try {
        const [registry, custom] = await Promise.all([
          wsAgentApi.listRegistry(),
          wsAgentApi.listCustomAgents(),
        ]);
        const agents: RegistryAgentInfo[] = [
          ...registry.agents.map(a => ({ id: a.id, name: a.name })),
          ...custom.agents.map(a => ({ id: a.name, name: a.name })),
        ];
        setRegistryAgents(agents);
      } catch (e) {
        console.error('Failed to load registry agents:', e);
      }
    };
    loadRegistryAgents();
  }, []);

  // Build filter params
  const filterParams = useMemo(() => {
    const params: Parameters<typeof agentApi.listSessions>[0] = {
      limit: 50,
    };
    if (statusFilter) params.status = statusFilter;
    if (modeFilter) params.mode = modeFilter;
    if (registryIdFilter) params.registry_id = registryIdFilter;
    return params;
  }, [statusFilter, modeFilter, registryIdFilter]);

  // Fetch sessions
  const fetchSessions = useCallback(async (cursor?: string, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const params = { ...filterParams, cursor };
      const response = await agentApi.listSessions(params);
      
      if (append) {
        setSessions(prev => [...prev, ...response.items]);
      } else {
        setSessions(response.items);
      }
      setNextCursor(response.next_cursor);
      setHasMore(response.has_more);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [filterParams]);

  // Initial load
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Clear filters
  const clearFilters = () => {
    setRegistryIdFilter("");
    setStatusFilter("");
    setModeFilter("");
    setSearchQuery("");
  };

  const hasActiveFilters = registryIdFilter || statusFilter || modeFilter;

  // Filter by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;
    const lowQuery = searchQuery.toLowerCase();
    return sessions.filter(s => 
      (s.title?.toLowerCase() || '').includes(lowQuery) ||
      s.registry_id.toLowerCase().includes(lowQuery) ||
      s.context_type.toLowerCase().includes(lowQuery) ||
      s.context_guid?.toLowerCase().includes(lowQuery)
    );
  }, [sessions, searchQuery]);

  // Enrich sessions with display data
  const enrichedSessions = useMemo((): EnrichedSession[] => {
    return filteredSessions.map(s => {
      // Title: use title or generate from context
      const displayTitle = s.title || `Chat Session ${s.guid.slice(0, 8)}`;
      
      // Agent: map registry_id to display name
      const agent = registryAgents.find(a => a.id === s.registry_id);
      const displayAgent = agent?.name || s.registry_id;
      
      // Context label
      let contextLabel = s.context_type;
      if (s.context_type === 'workspace' || s.context_type === 'project') {
        contextLabel = s.context_guid?.slice(0, 8) || s.context_type;
      }
      
      // CWD display (truncate for UI)
      const cwdDisplay = s.cwd ? (s.cwd.length > 40 ? '...' + s.cwd.slice(-37) : s.cwd) : '-';
      
      return {
        ...s,
        displayTitle,
        displayAgent,
        contextLabel,
        cwdDisplay,
      };
    });
  }, [filteredSessions, registryAgents]);

  // Group by time
  const groupedSessions = useMemo(() => {
    const groups: Record<TimeGroup, EnrichedSession[]> = {
      'Today': [],
      'Yesterday': [],
      '2-6 days ago': [],
      '1-3 weeks ago': [],
      '1-5 months ago': [],
      'Older': []
    };

    const now = new Date();

    enrichedSessions.forEach(session => {
      const date = session.updated_at ? parseUTCDate(session.updated_at) : new Date();
      if (isNaN(date.getTime())) {
        groups['Older'].push(session);
        return;
      }

      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        groups['Today'].push(session);
      } else if (diffDays === 1) {
        groups['Yesterday'].push(session);
      } else if (diffDays <= 6) {
        groups['2-6 days ago'].push(session);
      } else if (diffDays <= 21) {
        groups['1-3 weeks ago'].push(session);
      } else if (diffDays <= 150) {
        groups['1-5 months ago'].push(session);
      } else {
        groups['Older'].push(session);
      }
    });

    return groups;
  }, [enrichedSessions]);

  // Handle load more
  const handleLoadMore = () => {
    if (nextCursor && !isLoadingMore) {
      fetchSessions(nextCursor, true);
    }
  };

  // Handle session click - open in current page's chat panel
  const handleSessionClick = (session: EnrichedSession) => {
    // Open chat panel with the session - use current URL params to stay on same page
    // Also save to localStorage so AgentChatPanel can resume it
    
    // Determine context key (same logic as AgentChatPanel)
    const contextKey = session.context_type === 'workspace' 
      ? `workspace:${session.context_guid}:${session.mode}`
      : session.context_type === 'project'
        ? `project:${session.context_guid}:${session.mode}`
        : `temp:${session.mode}`;
    
    // Save to localStorage so AgentChatPanel can resume this session
    const map = (() => {
      try {
        const raw = localStorage.getItem('atmos.agent.last_session_by_context');
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    })();
    map[contextKey] = session.guid;
    localStorage.setItem('atmos.agent.last_session_by_context', JSON.stringify(map));
    
    // Set chat=true in URL to open the panel
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('chat', 'true');
    currentParams.set('session', session.guid);
    
    // Update URL without full navigation
    const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
    window.history.pushState({}, '', newUrl);
  };

  // Handle delete session
  const handleDeleteSession = async (session: EnrichedSession, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const result = await agentApi.deleteSession(session.guid);
      
      // If it's a temp session, the backend returns the temp_cwd
      // We could delete the temp directory here if needed
      // For now, the backend handles the soft delete in DB
      
      // Remove from local state
      setSessions(prev => prev.filter(s => s.guid !== session.guid));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // Get status badge styles
  const getStatusBadge = (status: string) => {
    if (status === 'active') {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-muted border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
        Closed
      </span>
    );
  };

  // Get mode badge
  const getModeBadge = (mode: string) => {
    if (mode === 'wiki_ask') {
      return (
        <span className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
          Wiki
        </span>
      );
    }
    return null;
  };

  // Shared filter bar renderer
  const renderFilterBar = (compact = false) => (
    <div className={cn(
      "shrink-0",
      compact ? "px-8 py-4 border-b border-border/40 bg-background/50 backdrop-blur-sm" : "px-8 pb-6 space-y-4"
    )}>
      <div className="flex flex-col sm:flex-row gap-3 max-w-5xl mx-auto w-full">
        <div className="relative group flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className={cn(
              "pl-10 bg-muted/20 border-border/50 focus:bg-background transition-all",
              compact ? "h-9 rounded-lg text-sm" : "h-10 rounded-lg"
            )}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={registryIdFilter || "__all__"} onValueChange={(v) => setRegistryIdFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className={cn("w-[160px] bg-muted/20 border-border/50", compact ? "h-9" : "h-10")}>
              <SelectValue placeholder="ACP Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Agents</SelectItem>
              {registryAgents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>
                  <span className="flex items-center gap-2">
                    <AgentIcon registryId={agent.id} name={agent.name} size={14} />
                    {agent.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter || "__all__"} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v as "active" | "closed")}>
            <SelectTrigger className={cn("w-[110px] bg-muted/20 border-border/50", compact ? "h-9" : "h-10")}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modeFilter || "__all__"} onValueChange={(v) => setModeFilter(v === "__all__" ? "" : v as "default" | "wiki_ask")}>
            <SelectTrigger className={cn("w-[130px] bg-muted/20 border-border/50", compact ? "h-9" : "h-10")}>
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Modes</SelectItem>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="wiki_ask">Wiki Ask</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className={cn("px-3 text-muted-foreground hover:text-foreground", compact ? "h-9" : "h-10")}
            >
              <X className="size-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-background/50">
        {!hideHeader ? (
          <>
            {/* Full Header */}
            <div className="pt-12 pb-6 px-8 space-y-2 shrink-0">
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MessageSquare className="size-5" />
                </div>
                Chat Sessions
              </h2>
              <p className="text-sm text-muted-foreground text-pretty max-w-sm">
                View and manage your AI agent chat sessions.
              </p>
            </div>
            {renderFilterBar()}
          </>
        ) : (
          renderFilterBar(true)
        )}

        {/* Sessions List */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-on-hover">
          <div className="px-8">
            <div className="max-w-5xl mx-auto pb-12">
              {isLoading ? (
                // Loading skeleton
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-background animate-pulse">
                      <div className="size-10 rounded-lg bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/3 bg-muted rounded" />
                        <div className="h-3 w-1/4 bg-muted rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : enrichedSessions.length === 0 ? (
                // Empty state
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="size-20 rounded-3xl bg-muted/20 flex items-center justify-center mb-6">
                    <MessageSquare className="size-10 text-muted-foreground/30" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">No sessions found</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto text-pretty">
                    {hasActiveFilters || searchQuery 
                      ? "Try adjusting your filters or search query."
                      : "Start a new chat session to see it here."}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="link"
                      onClick={clearFilters}
                      className="mt-4"
                    >
                      Clear all filters
                    </Button>
                  )}
                </div>
              ) : (
                // Sessions grouped by time
                <div className="space-y-8">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {GROUP_ORDER.map(group => {
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
                          {/* Group Header */}
                          <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm py-3 z-5 border-b border-border/40">
                            <span className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-widest">{group}</span>
                            <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono">
                              {items.length}
                            </span>
                          </div>

                          {/* Session Items */}
                          <div className="space-y-2">
                            <AnimatePresence mode="popLayout">
                              {items.map((session, index) => (
                                <motion.div
                                  key={session.guid}
                                  layout
                                  initial={{ opacity: 0, x: -5 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
                                  onClick={() => handleSessionClick(session)}
                                  className="group relative w-full flex items-center justify-between p-4 rounded-xl border border-border bg-background hover:border-primary/30 hover:shadow-md cursor-pointer hover:bg-muted/50 transition-all duration-200"
                                >
                                  <div className="flex items-center gap-4 min-w-0 flex-1">
                                    {/* Agent Icon */}
                                    <div className="size-10 rounded-lg flex items-center justify-center bg-muted/30 border border-border/50 shrink-0 overflow-hidden">
                                      <AgentIcon registryId={session.registry_id} name={session.displayAgent} size={22} />
                                    </div>

                                    {/* Session Info */}
                                    <div className="flex flex-col min-w-0 flex-1">
                                      {/* Title */}
                                      <div className="flex items-center gap-2">
                                        <span className="text-[14px] font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                                          {session.displayTitle}
                                        </span>
                                        {getModeBadge(session.mode)}
                                        {getStatusBadge(session.status)}
                                      </div>
                                      
                                      {/* Metadata Row */}
                                      <div className="flex items-center gap-3 mt-1 text-[12px] text-muted-foreground">
                                        {/* Agent */}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="truncate max-w-[100px]">{session.displayAgent}</span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            {session.registry_id}
                                          </TooltipContent>
                                        </Tooltip>
                                        
                                        <span className="text-border">•</span>
                                        
                                        {/* Context Type */}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="flex items-center gap-1">
                                              {session.context_type === 'workspace' ? (
                                                <GitBranch className="size-3" />
                                              ) : session.context_type === 'project' ? (
                                                <Folder className="size-3" />
                                              ) : (
                                                <FolderOpen className="size-3" />
                                              )}
                                              {session.contextLabel}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            {session.context_type}: {session.context_guid || 'N/A'}
                                          </TooltipContent>
                                        </Tooltip>
                                        
                                        <span className="text-border">•</span>
                                        
                                        {/* CWD */}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="block max-w-[150px] text-muted-foreground/70 overflow-hidden text-ellipsis whitespace-nowrap" dir="rtl">
                                              {session.cwd || '-'}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            {session.cwd || 'No working directory'}
                                          </TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Time / Actions - time slides right, buttons slide in from left */}
                                  <div className="shrink-0 pl-4 w-[100px] h-[34px] relative overflow-hidden">
                                    {/* Time - slides right on hover */}
                                    <div className={cn(
                                      "absolute inset-0 flex items-center justify-end transition-all duration-200 ease-out",
                                      "group-hover:translate-x-[15px] group-hover:opacity-0"
                                    )}>
                                      <div className="space-y-0.5 text-right">
                                        <div className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                          {session.created_at && !isNaN(parseUTCDate(session.created_at).getTime())
                                            ? formatLocalDateTime(session.created_at, 'yyyy/MM/dd')
                                            : '-'}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/50 tabular-nums">
                                          {session.created_at && !isNaN(parseUTCDate(session.created_at).getTime())
                                            ? formatLocalDateTime(session.created_at, 'HH:mm')
                                            : ''}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Actions - slides in from left on hover */}
                                    <div className={cn(
                                      "absolute inset-0 flex items-center justify-end gap-1 transition-all duration-200 ease-out",
                                      "-translate-x-[15px] opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                                    )}>
                                      <TooltipProvider delayDuration={0}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleSessionClick(session);
                                              }}
                                              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                            >
                                              <FolderInput className="size-4" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-[10px]">
                                            Open
                                          </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              onClick={(e) => handleDeleteSession(session, e)}
                                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                            >
                                              <Trash2 className="size-4" />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-[10px]">
                                            Delete
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Load More */}
                  {hasMore && (
                    <div className="flex justify-center pt-6">
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="min-w-[200px]"
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="size-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            Load More
                            <ChevronDown className="size-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  )}
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
