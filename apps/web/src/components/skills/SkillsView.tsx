"use client";

import Link from "next/link";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { skillsApi, type SkillInfo } from "@/api/ws-api";
import { useAppRouter } from "@/hooks/use-app-router";
import { useQueryStates } from "nuqs";
import { skillsParams, type ScopeFilter, type SkillsTab } from "@/lib/nuqs/searchParams";
import { useContextParams } from "@/hooks/use-context-params";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen,
  CircleCheck,
  CircleMinus,
  CircleX,
  ArrowDownToLine,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  Folder,
  FolderOpen,
  Globe,
  EyeOff,
  Link2,
  Loader2,
  Puzzle,
  RefreshCw,
  Search,
  Store,
} from "lucide-react";
import { SkillDetail } from "./SkillDetail";
import { SkillActionsMenu } from "./SkillActionsMenu";
import { SkillInstallTerminalDialog } from "./SkillInstallTerminalDialog";
import { getAgentConfig, getAgentStatus } from "./constants";
import {
  marketCategories,
  resourceCategories,
  resolveSkillSourceUrl,
  type SkillMarketCategory,
  type SkillMarketItem,
  type SkillResourceCategory,
} from "./market-data";

const INSTALLED_EMPTY_COPY = "Extend Atmos with local and project-scoped skills, or browse the market below.";
const MARKET_EMPTY_COPY = "No skills in the market matched your search. Try a different keyword.";
const RESOURCES_EMPTY_COPY = "No resources matched your search. Try another keyword.";

function buildSkillListUrl({
  activeTab,
  filter,
  projects,
  query,
}: {
  activeTab: SkillsTab;
  filter: ScopeFilter;
  projects: string;
  query: string;
}) {
  const searchParams = new URLSearchParams();

  if (activeTab !== "installed") {
    searchParams.set("tab", activeTab);
  }
  if (filter !== "all") {
    searchParams.set("filter", filter);
  }
  if (projects) {
    searchParams.set("projects", projects);
  }
  if (query.trim()) {
    searchParams.set("q", query.trim());
  }

  const search = searchParams.toString();
  return search ? `/skills?${search}` : "/skills";
}

function filterMarketCategories(categories: SkillMarketCategory[], query: string) {
  if (!query) {
    return categories;
  }

  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const haystack = [
          category.title,
          item.title,
          item.description,
          item.author?.handle,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      }),
    }))
    .filter((category) => category.items.length > 0);
}

function filterResourceCategories(categories: SkillResourceCategory[], query: string) {
  if (!query) {
    return categories;
  }

  return categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        const haystack = [category.title, item.title, item.description].join(" ").toLowerCase();
        return haystack.includes(query);
      }),
    }))
    .filter((category) => category.items.length > 0);
}

function renderSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {[...Array(6)].map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="space-y-2 pt-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function getScopeMeta(scope: SkillInfo["scope"]) {
  switch (scope) {
    case "global":
      return {
        label: "Global",
        icon: Globe,
        className: "bg-muted text-foreground",
      };
    case "project":
      return {
        label: "Project",
        icon: Folder,
        className: "bg-muted text-foreground",
      };
    default:
      return {
        label: "InsideTheProject",
        icon: FolderOpen,
        className: "bg-muted text-foreground",
      };
  }
}

function getStatusMeta(status: SkillInfo["status"]) {
  switch (status) {
    case "enabled":
      return {
        label: "Enabled",
        icon: CircleCheck,
        className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "disabled":
      return {
        label: "Disabled",
        icon: CircleX,
        className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
      };
    default:
      return {
        label: "Partial",
        icon: CircleMinus,
        className: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
  }
}

function InstalledSkillListCard({
  skill,
  onClick,
  onUpdated,
  onDeleted,
}: {
  skill: SkillInfo;
  onClick: () => void;
  onUpdated: (skill: SkillInfo) => void | Promise<void>;
  onDeleted: (skillId: string) => void | Promise<void>;
}) {
  const scopeMeta = getScopeMeta(skill.scope);
  const ScopeIcon = scopeMeta.icon;
  const statusMeta = getStatusMeta(skill.status);
  const StatusIcon = statusMeta.icon;
  const isDisabled = skill.status === "disabled";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex h-full cursor-pointer flex-col rounded-xl border p-5 transition-all duration-200",
        isDisabled
          ? "border-border/70 bg-muted/25 hover:bg-muted/35"
          : "border-border bg-card hover:shadow-md",
      )}
    >
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                isDisabled
                  ? "border-border/40 bg-muted/40 text-muted-foreground"
                  : "border-border/50 bg-muted/20 text-primary group-hover:bg-primary/5",
              )}
            >
              <Puzzle className="size-5" />
            </div>
            <div className="min-w-0">
              <h3
                className={cn(
                  "truncate text-sm font-semibold tracking-tight",
                  isDisabled ? "text-foreground/80" : "text-foreground",
                )}
              >
                {skill.title || skill.name}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider cursor-default",
                          scopeMeta.className,
                        )}
                      >
                        <ScopeIcon className="size-2" />
                        {scopeMeta.label}
                      </span>
                    </TooltipTrigger>
                    {(skill.scope === "project" || skill.scope === "inside_project") && skill.project_name && (
                      <TooltipContent side="top">
                        <p className="text-xs">From: {skill.project_name}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>

                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                    statusMeta.className,
                  )}
                >
                  <StatusIcon className="size-2.5" />
                  {statusMeta.label}
                </span>

              </div>
            </div>
          </div>

          <SkillActionsMenu skill={skill} onUpdated={onUpdated} onDeleted={onDeleted} />
        </div>

        {skill.description ? (
          <p
            className={cn(
              "mt-4 flex-1 line-clamp-3 text-[13px] leading-relaxed text-pretty",
              isDisabled ? "text-muted-foreground/75" : "text-muted-foreground",
            )}
          >
            {skill.description}
          </p>
        ) : (
          <p className="mt-4 flex-1 text-[13px] italic leading-relaxed text-muted-foreground/50">No description</p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {skill.agents.filter((agent) => agent !== "in-project").map((agent) => {
            const config = getAgentConfig(agent);
            const agentStatus = getAgentStatus(skill, agent);
            const label = (
              <span
                key={agent}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 inline-flex items-center gap-1",
                  agentStatus === "disabled"
                    ? "bg-muted text-muted-foreground"
                    : config.color,
                )}
              >
                {agentStatus === "disabled" && <EyeOff className="size-2.5" />}
                {config.name}
              </span>
            );

            if (agent === "unified") {
              return (
                <TooltipProvider key={agent} delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>{label}</TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">From: .agents/skills</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }

            return label;
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-3xl bg-muted/20 text-muted-foreground/30">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground text-pretty">{description}</p>
      {action}
    </motion.div>
  );
}

export const SkillsView: React.FC = () => {
  const router = useAppRouter();
  const [{ tab: activeTab, filter: scopeFilter, projects: projectsParam, q: query }, setParams] = useQueryStates(skillsParams);
  const { skillScope, skillId } = useContextParams();

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [showFilter, setShowFilter] = useState(scopeFilter !== "all");
  const [installingSkill, setInstallingSkill] = useState<SkillMarketItem | null>(null);
  const [collapsedMarketCategories, setCollapsedMarketCategories] = useState<Record<string, boolean>>({});

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const selectedProjectIds = useMemo(() => {
    return projectsParam ? projectsParam.split(",").filter(Boolean) : [];
  }, [projectsParam]);

  const isFilterActive = scopeFilter !== "all";

  const projects = useMemo(() => {
    const projectMap = new Map<string, string>();
    skills.forEach((skill) => {
      if (
        (skill.scope === "project" || skill.scope === "inside_project") &&
        skill.project_id &&
        skill.project_name
      ) {
        projectMap.set(skill.project_id, skill.project_name);
      }
    });
    return Array.from(projectMap.entries()).map(([id, name]) => ({ id, name }));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (
        deferredQuery &&
        !skill.name.toLowerCase().includes(deferredQuery) &&
        !(skill.title || "").toLowerCase().includes(deferredQuery) &&
        !(skill.description || "").toLowerCase().includes(deferredQuery)
      ) {
        return false;
      }

      if (scopeFilter === "all") return true;
      if (scopeFilter === "global") return skill.scope === "global";
      if (scopeFilter === "project") {
        const isProjectScoped =
          skill.scope === "project" || skill.scope === "inside_project";
        if (selectedProjectIds.length === 0) return isProjectScoped;
        return (
          isProjectScoped &&
          !!skill.project_id &&
          selectedProjectIds.includes(skill.project_id)
        );
      }
      return true;
    });
  }, [deferredQuery, scopeFilter, selectedProjectIds, skills]);

  const filteredMarketCategories = useMemo(() => {
    return filterMarketCategories(marketCategories, deferredQuery);
  }, [deferredQuery]);

  const filteredResourceCategories = useMemo(() => {
    return filterResourceCategories(resourceCategories, deferredQuery);
  }, [deferredQuery]);

  const marketResultCount = useMemo(() => {
    return filteredMarketCategories.reduce((total, category) => total + category.items.length, 0);
  }, [filteredMarketCategories]);

  const resourceResultCount = useMemo(() => {
    return filteredResourceCategories.reduce((total, category) => total + category.items.length, 0);
  }, [filteredResourceCategories]);

  const loadSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await skillsApi.list();
      setSkills(result.skills || []);
    } catch (error) {
      console.error("Failed to load skills:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSkillUpdated = useCallback((nextSkill: SkillInfo) => {
    setSkills((current) => current.map((skill) => (skill.id === nextSkill.id ? nextSkill : skill)));
    setSelectedSkill((current) => (current?.id === nextSkill.id ? nextSkill : current));
  }, []);

  useEffect(() => {
    if (!skillId && skills.length === 0 && !isLoading) {
      void loadSkills();
    }
  }, [isLoading, loadSkills, skillId, skills.length]);

  useEffect(() => {
    const loadSkillDetail = async () => {
      if (!skillId || !skillScope) {
        setSelectedSkill(null);
        return;
      }

      setIsLoadingDetail(true);
      try {
        const result = await skillsApi.get(skillScope, skillId);
        setSelectedSkill(result);
      } catch (error) {
        console.error("Failed to load skill details:", error);
      } finally {
        setIsLoadingDetail(false);
      }
    };

    void loadSkillDetail();
  }, [skillId, skillScope]);

  const handleScopeFilterChange = (filter: ScopeFilter) => {
    void setParams({ filter, projects: "" });
  };

  const handleProjectToggle = (projectId: string) => {
    const newIds = selectedProjectIds.includes(projectId)
      ? selectedProjectIds.filter((id) => id !== projectId)
      : [...selectedProjectIds, projectId];
    void setParams({ filter: "project", projects: newIds.join(",") || "" });
  };

  const handleBack = useCallback(() => {
    router.push(
      buildSkillListUrl({
        activeTab,
        filter: scopeFilter,
        projects: projectsParam,
        query,
      }),
    );
    setSelectedSkill(null);
  }, [activeTab, projectsParam, query, router, scopeFilter]);

  const handleSkillDeleted = useCallback(
    (skillIdToRemove: string) => {
      setSkills((current) => current.filter((skill) => skill.id !== skillIdToRemove));
      setSelectedSkill((current) => (current?.id === skillIdToRemove ? null : current));
      if (selectedSkill?.id === skillIdToRemove || skillId === skillIdToRemove) {
        handleBack();
      }
    },
    [handleBack, selectedSkill?.id, skillId],
  );

  const handleOpenInstalledSkill = (skill: SkillInfo) => {
    const searchParams = new URLSearchParams();
    if (activeTab !== "installed") {
      searchParams.set("tab", activeTab);
    }
    if (scopeFilter !== "all") {
      searchParams.set("filter", scopeFilter);
    }
    if (projectsParam) {
      searchParams.set("projects", projectsParam);
    }
    if (query.trim()) {
      searchParams.set("q", query.trim());
    }
    searchParams.set("scope", skill.scope);
    searchParams.set("skillId", skill.id);
    router.push(`/skills?${searchParams.toString()}`);
  };

  const searchPlaceholder =
    activeTab === "installed"
      ? "Search installed skills..."
      : activeTab === "market"
      ? "Search skills market..."
      : "Search resources...";

  const toggleMarketCategory = (categoryId: string) => {
    setCollapsedMarketCategories((current) => ({
      ...current,
      [categoryId]: !(current[categoryId] ?? false),
    }));
  };

  if (skillId && skillScope) {
    if (isLoadingDetail) {
      return (
        <div className="flex h-full items-center justify-center bg-background">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (selectedSkill) {
      return (
        <div className="h-full overflow-hidden bg-background">
          <SkillDetail
            skill={selectedSkill}
            onBack={handleBack}
            onUpdated={handleSkillUpdated}
            onDeleted={handleSkillDeleted}
          />
        </div>
      );
    }
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="sticky top-0 z-10 border-b border-border bg-background/50 px-8 py-6 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6">
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
                <Puzzle className="size-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">Skills</h2>
                <p className="max-w-xs text-sm text-muted-foreground text-pretty">
                  Manage installed skills, browse the market, and discover resources.
                </p>
              </div>
            </div>

            <div className="flex flex-1 items-center gap-3 max-w-2xl">
              <div className="group relative w-full">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                <Input
                  value={query}
                  onChange={(event) => void setParams({ q: event.target.value })}
                  placeholder={searchPlaceholder}
                  className="h-10 rounded-xl border-border/50 bg-muted/20 pl-10 shadow-sm transition-all focus:bg-background focus-visible:ring-1 focus-visible:ring-primary/20"
                />
              </div>

              {activeTab === "installed" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant={showFilter || isFilterActive ? "secondary" : "outline"}
                    size="icon"
                    onClick={() => setShowFilter((value) => !value)}
                    className={cn(
                      "relative size-10 shrink-0 rounded-xl shadow-sm transition-all cursor-pointer",
                      !showFilter && !isFilterActive && "border-border/50 bg-muted/20 hover:bg-background",
                      isFilterActive && "ring-1 ring-primary/30",
                    )}
                    title="Toggle Filters"
                  >
                    <Filter className="size-4" />
                    {isFilterActive && <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full border-2 border-background bg-primary" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => void loadSkills()}
                    disabled={isLoading}
                    className="size-10 shrink-0 rounded-xl border-border/50 bg-muted/20 shadow-sm transition-all hover:bg-background cursor-pointer"
                    title="Refresh Skills"
                  >
                    <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => void setParams({ tab: value as SkillsTab })}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="px-8 pb-2 pt-4">
            <div className="mx-auto w-full max-w-5xl">
              <TabsList>
                <TabsTrigger value="installed">
                  <Download className="size-4" />
                  Installed
                  {!isLoading && skills.length > 0 && (
                    <span className="ml-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[10px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {skills.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="market">
                  <Store className="size-4" />
                  Market
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {marketCategories.reduce((total, category) => total + category.items.length, 0)}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="resources">
                  <BookOpen className="size-4" />
                  Resources
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {resourceCategories.reduce((total, category) => total + category.items.length, 0)}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              activeTab === "installed" && showFilter ? "max-h-24 opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <div className="border-b border-border bg-background px-8 py-3">
              <div className="mx-auto flex w-full max-w-5xl items-center gap-2 flex-wrap">
                <Button
                  variant={scopeFilter === "all" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleScopeFilterChange("all")}
                  className="h-7 cursor-pointer text-xs"
                >
                  All
                </Button>
                <Button
                  variant={scopeFilter === "global" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleScopeFilterChange("global")}
                  className={cn("h-7 cursor-pointer gap-1.5 text-xs", scopeFilter === "global" && "text-primary")}
                >
                  <Globe className="size-3" />
                  Global
                </Button>
                <Button
                  variant={scopeFilter === "project" && selectedProjectIds.length === 0 ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleScopeFilterChange("project")}
                  className={cn(
                    "h-7 cursor-pointer gap-1.5 text-xs",
                    scopeFilter === "project" && selectedProjectIds.length === 0 && "text-primary",
                  )}
                >
                  <FolderOpen className="size-3" />
                  Project
                </Button>

                {scopeFilter === "project" && projects.length > 0 && (
                  <>
                    <div className="mx-1 h-4 w-px bg-border" />
                    {projects.map((project) => (
                      <Button
                        key={project.id}
                        variant={selectedProjectIds.includes(project.id) ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => handleProjectToggle(project.id)}
                        className={cn(
                          "h-7 cursor-pointer text-xs",
                          selectedProjectIds.includes(project.id) && "text-primary",
                        )}
                      >
                        {project.name}
                      </Button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-8 pb-8 pt-4">
            <div className="mx-auto w-full max-w-5xl">
              <TabsContent value="installed">
                {isLoading ? (
                  renderSkeletonGrid()
                ) : filteredSkills.length === 0 ? (
                  <EmptyState
                    icon={<Puzzle className="size-8" />}
                    title={skills.length === 0 ? "No skills installed" : "No installed skills matched"}
                    description={
                      skills.length === 0
                        ? INSTALLED_EMPTY_COPY
                        : query || isFilterActive
                        ? `No installed skills matched "${query}". Reset the search or filters and try again.`
                        : INSTALLED_EMPTY_COPY
                    }
                    action={
                      (query || isFilterActive) && (
                        <Button
                          variant="link"
                          onClick={() => void setParams({ q: "", filter: "all", projects: "" })}
                          className="mt-4"
                        >
                          Reset installed filters
                        </Button>
                      )
                    }
                  />
                ) : (
                  <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {filteredSkills.map((skill, index) => (
                        <motion.div
                          key={skill.path}
                          className="h-full"
                          layout
                          initial={{ opacity: 0, y: 10, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.94 }}
                          transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24), ease: "easeOut" }}
                        >
                          <InstalledSkillListCard
                            skill={skill}
                            onClick={() => handleOpenInstalledSkill(skill)}
                            onUpdated={handleSkillUpdated}
                            onDeleted={handleSkillDeleted}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="market">
                {marketResultCount === 0 ? (
                  <EmptyState
                    icon={<Store className="size-8" />}
                    title="No market skills matched"
                    description={MARKET_EMPTY_COPY}
                    action={
                      query ? (
                        <Button variant="link" onClick={() => void setParams({ q: "" })} className="mt-4">
                          Clear search
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="space-y-8">
                    {filteredMarketCategories.map((category) => (
                      <Collapsible
                        key={category.id}
                        open={!(collapsedMarketCategories[category.id] ?? false)}
                        onOpenChange={() => toggleMarketCategory(category.id)}
                        className="rounded-2xl border border-border/70 bg-background/40"
                      >
                        <CollapsibleTrigger className="group flex w-full items-end justify-between gap-4 px-5 py-4 text-left cursor-pointer">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold tracking-wide text-foreground">{category.title}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {category.items.length} skill{category.items.length > 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="border-t border-border/60 px-5 pb-5 pt-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              {category.items.map((item, index) => (
                                <motion.div
                                  key={item.id}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.16) }}
                                  className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-md"
                                >
                                  <div className="flex flex-1 flex-col">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex items-start gap-3">
                                        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-primary transition-colors group-hover:bg-primary/5">
                                          <Puzzle className="size-5" />
                                        </div>
                                        <div className="min-w-0">
                                          <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">{item.title}</h4>
                                          {item.author && (
                                            <a
                                              href={item.author.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="mt-1 inline-flex text-xs text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                              {item.author.handle}
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                      <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                                        Market
                                      </span>
                                    </div>

                                    <p className="mt-4 flex-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                                      {item.description}
                                    </p>

                                    <div className="mt-4 flex items-center justify-between gap-3">
                                      <button
                                        onClick={() => window.open(resolveSkillSourceUrl(item), "_blank", "noopener,noreferrer")}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer"
                                      >
                                        <ExternalLink className="size-3.5" />
                                        View Source
                                      </button>
                                      <button
                                        onClick={() => setInstallingSkill(item)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
                                      >
                                        <ArrowDownToLine className="size-3.5" />
                                        Install
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}

                    <div className="pt-2 text-center text-xs text-muted-foreground/60">
                      Power By{" "}
                      <Link
                        href="https://github.com/ComposioHQ/awesome-claude-skills"
                        target="_blank"
                        rel="noreferrer"
                        className="transition-colors hover:text-foreground"
                      >
                        Awesome Claude Skills
                      </Link>{" "}
                      &{" "}
                      <Link
                        href="https://skills.sh"
                        target="_blank"
                        rel="noreferrer"
                        className="transition-colors hover:text-foreground"
                      >
                        skills.sh
                      </Link>
                      .
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="resources">
                {resourceResultCount === 0 ? (
                  <EmptyState
                    icon={<BookOpen className="size-8" />}
                    title="No resources matched"
                    description={RESOURCES_EMPTY_COPY}
                    action={
                      query ? (
                        <Button variant="link" onClick={() => void setParams({ q: "" })} className="mt-4">
                          Clear search
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="space-y-8">
                    {filteredResourceCategories.map((category) => (
                      <section key={category.id} className="space-y-4">
                        <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-3">
                          <div>
                            <h3 className="text-sm font-semibold tracking-wide text-foreground">{category.title}</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {category.items.length} resource{category.items.length > 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          {category.items.map((item, index) => (
                            <motion.a
                              key={item.id}
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.16) }}
                              className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-md"
                            >
                              <div className="flex flex-1 flex-col justify-between">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex items-start gap-3">
                                    <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-primary transition-colors group-hover:bg-primary/5">
                                      <Link2 className="size-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">{item.title}</h4>
                                      <p className="mt-1 text-xs text-muted-foreground">{category.title}</p>
                                    </div>
                                  </div>
                                  <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                                </div>

                                <p className="mt-4 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                                  {item.description}
                                </p>
                              </div>
                            </motion.a>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>

      <SkillInstallTerminalDialog
        open={!!installingSkill}
        skill={installingSkill}
        onOpenChange={(open) => {
          if (!open) {
            setInstallingSkill(null);
          }
        }}
      />
    </>
  );
};
