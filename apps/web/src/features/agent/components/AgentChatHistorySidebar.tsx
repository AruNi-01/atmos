"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@workspace/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import { Bot, Check, ChevronDown, Folder, FolderOpen, Loader2, MessageCircle, Plus } from "lucide-react";
import type { AgentChatSessionItem } from "@/api/rest-api";
import type { RegistryAgent } from "@/api/ws-api";
import type { Project } from "@/shared/types/domain";
import { AgentIcon } from "./AgentIcon";

interface AgentChatHistorySidebarProps {
  className?: string;
  reserveTrafficLightsInset?: boolean;
  historySessions: AgentChatSessionItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  historyResumeUnsupportedReason: string | null;
  historyUnsupportedReason: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  handleSelectHistorySession: (s: AgentChatSessionItem) => void;
  handleCreateNewSession: (targetRegistryId?: string) => Promise<void>;
  isConnecting: boolean;
  installedAgents: RegistryAgent[];
  defaultRegistryId: string;
  activeRegistryId: string;
  activeAcpSessionId: string | null;
  activeAgentName: string | null;
  canCreateNewSession: boolean;
  projects: Project[];
}

type HistoryGroup = {
  key: string;
  cwd: string | null;
  name: string;
  newestTime: number;
  sessions: AgentChatSessionItem[];
};

function normalizeCwd(cwd: string | null | undefined): string | null {
  const trimmed = cwd?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[\\/]+$/, "");
  if (!normalized) return trimmed;
  if (/^[A-Za-z]:$/.test(normalized) && /^[A-Za-z]:[\\/]+$/.test(trimmed)) {
    return trimmed;
  }
  return normalized;
}

function cwdGroupName(cwd: string | null, fallback: string): string {
  if (!cwd) return fallback;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/") || parts.at(-1) || cwd;
}

function normalizePathForMatch(path: string | null | undefined): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  const slashNormalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
  const withoutTrailingSlash = slashNormalized.replace(/\/+$/, "");
  if (!withoutTrailingSlash) return slashNormalized.startsWith("/") ? "/" : slashNormalized;
  if (/^[A-Za-z]:$/.test(withoutTrailingSlash)) return `${withoutTrailingSlash}/`;
  return withoutTrailingSlash;
}

function pathMatch(cwd: string, root: string): { relative: string | null } | null {
  const cwdComparable = /^[A-Za-z]:\//.test(cwd) ? cwd.toLowerCase() : cwd;
  const rootComparable = /^[A-Za-z]:\//.test(root) ? root.toLowerCase() : root;
  if (cwdComparable === rootComparable) return { relative: null };
  if (!cwdComparable.startsWith(`${rootComparable}/`)) return null;
  return { relative: cwd.slice(root.length).replace(/^\/+/, "") || null };
}

function workspaceLabel(workspace: Project["workspaces"][number]): string {
  return workspace.displayName?.trim() || workspace.name.trim() || workspace.branch.trim() || workspace.id;
}

function unknownAtmosWorkspaceLabel(cwd: string, fallback: string): string | null {
  const parts = cwd.split("/").filter(Boolean);
  const atmosIndex = parts.findIndex((part) => part === ".atmos");
  if (atmosIndex < 0 || parts[atmosIndex + 1] !== "workspaces") return null;
  const projectSegment = parts[atmosIndex + 2];
  return projectSegment ? `${fallback} · ${projectSegment}` : fallback;
}

function resolveCwdGroupName(
  cwd: string | null,
  projects: Project[],
  noCwdLabel: string,
  atmosWorkspaceLabel: string,
): string {
  if (!cwd) return noCwdLabel;
  const normalizedCwd = normalizePathForMatch(cwd);
  if (!normalizedCwd) return noCwdLabel;

  const workspaceMatches = projects
    .flatMap((project) => project.workspaces.map((workspace) => ({
      workspace,
      root: normalizePathForMatch(workspace.localPath),
    })))
    .filter((item): item is { workspace: Project["workspaces"][number]; root: string } => Boolean(item.root))
    .sort((a, b) => b.root.length - a.root.length);

  for (const { workspace, root } of workspaceMatches) {
    const match = pathMatch(normalizedCwd, root);
    if (!match) continue;
    const label = workspaceLabel(workspace);
    return match.relative ? `${label} · ${match.relative}` : label;
  }

  const projectMatches = projects
    .map((project) => ({ project, root: normalizePathForMatch(project.mainFilePath) }))
    .filter((item): item is { project: Project; root: string } => Boolean(item.root))
    .sort((a, b) => b.root.length - a.root.length);

  for (const { project, root } of projectMatches) {
    const match = pathMatch(normalizedCwd, root);
    if (!match) continue;
    return match.relative ? `${project.name} · ${match.relative}` : project.name;
  }

  return unknownAtmosWorkspaceLabel(normalizedCwd, atmosWorkspaceLabel) ?? cwdGroupName(cwd, noCwdLabel);
}

function sessionTimeValue(session: AgentChatSessionItem): number {
  return session.updated_at ? Date.parse(session.updated_at) || 0 : 0;
}

function formatRelativeTime(
  value: string | null,
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (elapsedMs < minute) return t("historySidebar.relative.now");
  if (elapsedMs < hour) return t("historySidebar.relative.minute", { value: Math.floor(elapsedMs / minute) });
  if (elapsedMs < day) return t("historySidebar.relative.hour", { value: Math.floor(elapsedMs / hour) });
  if (elapsedMs < week) return t("historySidebar.relative.day", { value: Math.floor(elapsedMs / day) });
  if (elapsedMs < month * 2) return t("historySidebar.relative.week", { value: Math.floor(elapsedMs / week) });
  return t("historySidebar.relative.month", { value: Math.floor(elapsedMs / month) });
}

function groupHistorySessions(
  sessions: AgentChatSessionItem[],
  noCwdLabel: string,
  atmosWorkspaceLabel: string,
  projects: Project[],
): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();

  for (const session of sessions) {
    const cwd = normalizeCwd(session.cwd);
    const key = cwd ?? "__no_cwd__";
    const existing = groups.get(key);
    const timeValue = sessionTimeValue(session);
    if (existing) {
      existing.sessions.push(session);
      existing.newestTime = Math.max(existing.newestTime, timeValue);
      continue;
    }

    groups.set(key, {
      key,
      cwd,
      name: resolveCwdGroupName(cwd, projects, noCwdLabel, atmosWorkspaceLabel),
      newestTime: timeValue,
      sessions: [session],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((a, b) => sessionTimeValue(b) - sessionTimeValue(a)),
    }))
    .sort((a, b) => b.newestTime - a.newestTime || a.name.localeCompare(b.name));
}

export function AgentChatHistorySidebar({
  className,
  reserveTrafficLightsInset = false,
  historySessions,
  historyHasMore,
  historyLoading,
  historyCursor,
  historyResumeUnsupportedReason,
  historyUnsupportedReason,
  loadHistorySessions,
  handleSelectHistorySession,
  handleCreateNewSession,
  isConnecting,
  installedAgents,
  defaultRegistryId,
  activeRegistryId,
  activeAcpSessionId,
  activeAgentName,
  canCreateNewSession,
  projects,
}: AgentChatHistorySidebarProps) {
  const t = useTranslations("Agent.components");
  const groups = React.useMemo(
    () => groupHistorySessions(
      historySessions,
      t("historySidebar.noCwd"),
      t("historySidebar.atmosWorkspace"),
      projects,
    ),
    [historySessions, projects, t],
  );
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});
  const [agentPickerOpen, setAgentPickerOpen] = React.useState(false);
  const [selectedRegistryId, setSelectedRegistryId] = React.useState("");
  const newSessionControlRef = React.useRef<HTMLDivElement | null>(null);
  const agentLabelMeasureRef = React.useRef<HTMLSpanElement | null>(null);
  const [newSessionControlWidth, setNewSessionControlWidth] = React.useState(0);
  const [agentLabelMeasuredWidth, setAgentLabelMeasuredWidth] = React.useState(0);
  const fallbackRegistryId = activeRegistryId || defaultRegistryId || installedAgents[0]?.id || "";
  const effectiveSelectedRegistryId = selectedRegistryId || fallbackRegistryId;
  const selectedAgent =
    installedAgents.find((agent) => agent.id === effectiveSelectedRegistryId) ??
    installedAgents.find((agent) => agent.id === defaultRegistryId) ??
    installedAgents[0] ??
    null;
  const selectedAgentLabel = selectedAgent?.name ?? activeAgentName ?? t("historySidebar.agentFallback");

  React.useEffect(() => {
    if (!selectedRegistryId) return;
    if (installedAgents.some((agent) => agent.id === selectedRegistryId)) return;
    setSelectedRegistryId("");
  }, [installedAgents, selectedRegistryId]);

  const toggleGroup = React.useCallback((key: string) => {
    setCollapsedGroups((current) => ({ ...current, [key]: !(current[key] ?? false) }));
  }, []);

  React.useLayoutEffect(() => {
    const controlNode = newSessionControlRef.current;
    const labelNode = agentLabelMeasureRef.current;

    const measure = () => {
      if (controlNode) {
        const nextControlWidth = Math.round(controlNode.getBoundingClientRect().width);
        setNewSessionControlWidth((current) => (
          current === nextControlWidth ? current : nextControlWidth
        ));
      }

      if (labelNode) {
        const nextLabelWidth = Math.ceil(labelNode.getBoundingClientRect().width);
        setAgentLabelMeasuredWidth((current) => (
          current === nextLabelWidth ? current : nextLabelWidth
        ));
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined" || !controlNode) return;
    const observer = new ResizeObserver(measure);
    observer.observe(controlNode);
    return () => observer.disconnect();
  }, [selectedAgentLabel]);

  const agentSelectorMaxWidth = newSessionControlWidth > 0
    ? Math.floor(newSessionControlWidth * 0.5)
    : 128;
  const agentLabelMaxWidth = Math.max(0, agentSelectorMaxWidth - 56);
  const agentLabelTargetWidth = Math.min(agentLabelMeasuredWidth + 6, agentLabelMaxWidth);

  return (
    <aside className={cn("h-full min-h-0 w-full shrink-0 flex-col bg-transparent text-foreground backdrop-blur-md", className)}>
      <div
        className={cn(
          "shrink-0 px-3 pb-3 transition-[padding] duration-300 ease-out",
          reserveTrafficLightsInset ? "pt-14" : "pt-3",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            ref={newSessionControlRef}
            className="flex h-9 min-w-0 flex-1 items-stretch overflow-hidden rounded-md bg-muted/55 shadow-sm transition-colors hover:bg-muted/70"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={!canCreateNewSession || isConnecting}
              onClick={() => void handleCreateNewSession(selectedAgent?.id)}
            >
              <Plus className="size-4 shrink-0" />
              <span className="truncate">{t("historySidebar.newSession")}</span>
            </button>

            <DropdownMenu
              open={agentPickerOpen}
              onOpenChange={setAgentPickerOpen}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group/agent-selector relative flex h-full min-w-0 max-w-[50%] shrink-0 items-center px-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={installedAgents.length === 0 || isConnecting}
                  aria-label={t("historySidebar.selectAgentAria")}
                  title={selectedAgentLabel}
                >
                  <span
                    ref={agentLabelMeasureRef}
                    className="pointer-events-none absolute -left-[9999px] top-0 whitespace-nowrap text-xs font-medium"
                    aria-hidden="true"
                  >
                    {selectedAgentLabel}
                  </span>
                  {selectedAgent ? (
                    <AgentIcon
                      registryId={selectedAgent.id}
                      name={selectedAgent.name}
                      size={14}
                      isCustom={selectedAgent.install_method === "custom"}
                      registryIcon={selectedAgent.icon}
                    />
                  ) : (
                    <Bot className="size-3.5 shrink-0" />
                  )}
                  <span
                    className="max-w-0 min-w-0 shrink -translate-x-1 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/agent-selector:max-w-[var(--agent-label-target-width)] group-hover/agent-selector:translate-x-0 group-hover/agent-selector:opacity-100"
                    style={{
                      "--agent-label-target-width": `${agentLabelTargetWidth}px`,
                    } as React.CSSProperties}
                  >
                    <span className="block truncate pl-1.5">{selectedAgentLabel}</span>
                  </span>
                  <span className="max-w-0 shrink-0 -translate-x-1 overflow-hidden opacity-0 transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/agent-selector:max-w-4 group-hover/agent-selector:translate-x-0 group-hover/agent-selector:opacity-70">
                    <ChevronDown className="ml-1 size-3 shrink-0" />
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-1">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {t("historySidebar.agentForNewSession")}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {installedAgents.map((agent) => {
                    const selected = selectedAgent?.id === agent.id;
                    return (
                      <DropdownMenuItem
                        key={agent.id}
                        className="cursor-pointer"
                        onSelect={() => {
                          setSelectedRegistryId(agent.id);
                          setAgentPickerOpen(false);
                        }}
                      >
                        <AgentIcon
                          registryId={agent.id}
                          name={agent.name}
                          size={16}
                          isCustom={agent.install_method === "custom"}
                          registryIcon={agent.icon}
                        />
                        <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                        {selected ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                      </DropdownMenuItem>
                    );
                  })}
                  {installedAgents.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">{t("historySidebar.noInstalledAgent")}</div>
                  ) : null}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {historyLoading && historySessions.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          </div>
        ) : historySessions.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            {historyUnsupportedReason ?? t("historySidebar.empty")}
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => {
              const collapsed = collapsedGroups[group.key] ?? false;

              return (
                <section key={group.key} className="min-w-0">
                  <button
                    type="button"
                    className={cn(
                      "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/60",
                      !collapsed && "mb-1",
                    )}
                    aria-expanded={!collapsed}
                    onClick={() => toggleGroup(group.key)}
                  >
                    {collapsed ? (
                      <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="truncate" title={group.cwd ?? undefined}>
                      {group.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
                      {group.sessions.length}
                    </span>
                  </button>
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="ml-5 space-y-0.5 pl-2">
                        {group.sessions.map((session) => {
                          const isActive =
                            activeAcpSessionId === session.acp_session_id &&
                            (!activeRegistryId || activeRegistryId === session.registry_id);
                          const relativeTime = formatRelativeTime(session.updated_at, t);
                          return (
                            <button
                              key={`${session.registry_id}:${session.acp_session_id}`}
                              type="button"
                              className={cn(
                                "group flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                                isActive
                                  ? "bg-muted text-foreground"
                                  : "text-foreground hover:bg-muted/70",
                              )}
                              title={session.title ?? undefined}
                              onClick={() => handleSelectHistorySession(session)}
                            >
                              <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {session.title || t("historySidebar.newChat")}
                              </span>
                              {relativeTime ? (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {relativeTime}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}

            {historyResumeUnsupportedReason ? (
              <div className="px-2 text-xs leading-5 text-muted-foreground">
                {historyResumeUnsupportedReason}
              </div>
            ) : null}

            {historyHasMore && historyCursor ? (
              <button
                type="button"
                className="w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                disabled={historyLoading}
                onClick={() => void loadHistorySessions(historyCursor)}
              >
                {historyLoading ? t("common.loading") : t("historySidebar.showMore")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
