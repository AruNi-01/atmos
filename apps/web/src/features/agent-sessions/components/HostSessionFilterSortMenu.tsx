"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { ArrowUpDown, Bot, Check, Folder, Layers, ListFilter } from "lucide-react";
import type { HostSessionListItem } from "@atmos/api-types/ws/dto/host-session";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { HostSessionDateMenuItem } from "@/features/agent-sessions/components/HostSessionDateRangeFilter";
import {
  EMPTY_HOST_SESSION_FILTERS,
  hostSessionFilterCount,
  hostSessionProjectLabel,
  uniqueProjectValues,
  uniqueProviderIds,
  type HostSessionFilters,
} from "@/features/agent-sessions/lib/host-session-filters";
import {
  DEFAULT_HOST_SESSION_SORT,
  hostSessionAgentIconId,
  hostSessionAgentLabel,
  isDefaultHostSessionSort,
  type HostSessionGroupMode,
  type HostSessionSort,
} from "@/features/agent-sessions/lib/host-session-groups";

const TOOLBAR_ICON_BUTTON =
  "relative h-11 w-11 sm:h-11 sm:w-11 shrink-0 rounded-xl border-border/50 bg-muted/20 shadow-sm hover:bg-background";

function ToolbarIconMenu({
  label,
  active,
  badge,
  icon,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  active: boolean;
  badge?: number;
  icon: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(TOOLBAR_ICON_BUTTON, active && "border-primary/30 bg-primary/5 text-foreground")}
              aria-label={label}
            >
              {badge ? (
                <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {badge}
                </span>
              ) : null}
              {icon}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64 p-1">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HostSessionFilterMenu({
  sessions,
  facetProviders,
  facetProjects,
  filters,
  groupMode,
  onFiltersChange,
  onGroupModeChange,
}: {
  sessions: readonly HostSessionListItem[];
  facetProviders: readonly string[];
  facetProjects: readonly string[];
  filters: HostSessionFilters;
  groupMode: HostSessionGroupMode;
  onFiltersChange: (filters: HostSessionFilters) => void;
  onGroupModeChange: (mode: HostSessionGroupMode) => void;
}) {
  const t = useTranslations("agentSessions.filter");
  const [open, setOpen] = useState(false);
  const filterCount = hostSessionFilterCount(filters);

  const agents = useMemo(() => {
    const ids = new Set([...facetProviders, ...uniqueProviderIds(sessions)]);
    if (filters.providerId) ids.add(filters.providerId);
    return [...ids]
      .map((id) => ({
        id,
        label: hostSessionAgentLabel(id),
        count: sessions.filter((session) => session.provider_id === id).length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  }, [facetProviders, filters.providerId, sessions]);
  const projects = useMemo(() => {
    const values = new Set([...facetProjects, ...uniqueProjectValues(sessions)]);
    if (filters.project) values.add(filters.project);
    return [...values]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({
        value,
        count: sessions.filter((session) => hostSessionProjectLabel(session) === value).length,
      }));
  }, [facetProjects, filters.project, sessions]);

  return (
    <ToolbarIconMenu
      label={t("trigger")}
      active={filterCount > 0}
      badge={filterCount || undefined}
      icon={<ListFilter className="size-4" />}
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
        {t("groupBy")}
      </DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onGroupModeChange("all");
        }}
        className="cursor-pointer"
      >
        <Layers className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{t("groupAll")}</span>
        {groupMode === "all" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onGroupModeChange("agent");
        }}
        className="cursor-pointer"
      >
        <Bot className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{t("agent")}</span>
        {groupMode === "agent" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onGroupModeChange("project");
        }}
        className="cursor-pointer"
      >
        <Folder className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{t("project")}</span>
        {groupMode === "project" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>

      <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
        {t("section")}
      </DropdownMenuLabel>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Bot className="size-4" />
          <span className="min-w-0 flex-1 truncate">{t("agent")}</span>
          {filters.providerId ? (
            <span className="max-w-[6rem] truncate text-[11px] text-muted-foreground">
              {hostSessionAgentLabel(filters.providerId)}
            </span>
          ) : null}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onFiltersChange({ ...filters, providerId: null });
            }}
            className="cursor-pointer"
          >
            <Bot className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("allAgents")}</span>
            <span className="tabular-nums text-[11px] text-muted-foreground">{sessions.length}</span>
            {!filters.providerId ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          {agents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onSelect={(event) => {
                event.preventDefault();
                onFiltersChange({
                  ...filters,
                  providerId: filters.providerId === agent.id ? null : agent.id,
                });
              }}
              className="cursor-pointer"
            >
              <AgentIcon
                registryId={hostSessionAgentIconId(agent.id)}
                name={agent.label}
                size={16}
              />
              <span className="min-w-0 flex-1 truncate">{agent.label}</span>
              <span className="tabular-nums text-[11px] text-muted-foreground">{agent.count}</span>
              {filters.providerId === agent.id ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Folder className="size-4" />
          <span className="min-w-0 flex-1 truncate">{t("project")}</span>
          {filters.project ? (
            <span className="max-w-[6rem] truncate text-[11px] text-muted-foreground">
              {filters.project}
            </span>
          ) : null}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onFiltersChange({ ...filters, project: null });
            }}
            className="cursor-pointer"
          >
            <Folder className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("allProjects")}</span>
            <span className="tabular-nums text-[11px] text-muted-foreground">{sessions.length}</span>
            {!filters.project ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.value}
              onSelect={(event) => {
                event.preventDefault();
                onFiltersChange({
                  ...filters,
                  project: filters.project === project.value ? null : project.value,
                });
              }}
              className="cursor-pointer"
            >
              <Folder className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{project.value}</span>
              <span className="tabular-nums text-[11px] text-muted-foreground">{project.count}</span>
              {filters.project === project.value ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <HostSessionDateMenuItem
        filters={filters}
        onFiltersChange={onFiltersChange}
        onClose={() => setOpen(false)}
      />

      {filterCount > 0 ? (
        <>
          <DropdownMenuSeparator className="mx-2" />
          <DropdownMenuItem
            onClick={() => onFiltersChange(EMPTY_HOST_SESSION_FILTERS)}
            className="text-xs font-medium text-muted-foreground"
          >
            {t("reset")}
          </DropdownMenuItem>
        </>
      ) : null}
    </ToolbarIconMenu>
  );
}

function HostSessionSortMenu({
  sort,
  onSortChange,
}: {
  sort: HostSessionSort;
  onSortChange: (sort: HostSessionSort) => void;
}) {
  const t = useTranslations("agentSessions");
  const sortActive = !isDefaultHostSessionSort(sort);

  return (
    <ToolbarIconMenu
      label={t("sort.trigger")}
      active={sortActive}
      icon={<ArrowUpDown className="size-4" />}
    >
      <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
        {t("sort.section")}
      </DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onSortChange({ ...sort, field: "started_at" });
        }}
        className="cursor-pointer"
      >
        <span className="min-w-0 flex-1 truncate">{t("sort.created")}</span>
        {sort.field === "started_at" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onSortChange({ ...sort, field: "updated_at" });
        }}
        className="cursor-pointer"
      >
        <span className="min-w-0 flex-1 truncate">{t("sort.modified")}</span>
        {sort.field === "updated_at" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onSortChange({ ...sort, field: "byte_size" });
        }}
        className="cursor-pointer"
      >
        <span className="min-w-0 flex-1 truncate">{t("sort.fileSize")}</span>
        {sort.field === "byte_size" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>
      <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
        {t("sort.order")}
      </DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onSortChange({ ...sort, order: "asc" });
        }}
        className="cursor-pointer"
      >
        <span className="min-w-0 flex-1 truncate">{t("sort.ascending")}</span>
        {sort.order === "asc" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onSortChange({ ...sort, order: "desc" });
        }}
        className="cursor-pointer"
      >
        <span className="min-w-0 flex-1 truncate">{t("sort.descending")}</span>
        {sort.order === "desc" ? <Check className="size-4" /> : null}
      </DropdownMenuItem>

      {sortActive ? (
        <>
          <DropdownMenuSeparator className="mx-2" />
          <DropdownMenuItem
            onClick={() => onSortChange(DEFAULT_HOST_SESSION_SORT)}
            className="text-xs font-medium text-muted-foreground"
          >
            {t("sort.reset")}
          </DropdownMenuItem>
        </>
      ) : null}
    </ToolbarIconMenu>
  );
}

export function HostSessionFilterSortMenu({
  sessions,
  facetProviders,
  facetProjects,
  filters,
  groupMode,
  sort,
  onFiltersChange,
  onGroupModeChange,
  onSortChange,
}: {
  sessions: readonly HostSessionListItem[];
  facetProviders: readonly string[];
  facetProjects: readonly string[];
  filters: HostSessionFilters;
  groupMode: HostSessionGroupMode;
  sort: HostSessionSort;
  onFiltersChange: (filters: HostSessionFilters) => void;
  onGroupModeChange: (mode: HostSessionGroupMode) => void;
  onSortChange: (sort: HostSessionSort) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <HostSessionFilterMenu
        sessions={sessions}
        facetProviders={facetProviders}
        facetProjects={facetProjects}
        filters={filters}
        groupMode={groupMode}
        onFiltersChange={onFiltersChange}
        onGroupModeChange={onGroupModeChange}
      />
      <HostSessionSortMenu sort={sort} onSortChange={onSortChange} />
    </div>
  );
}
