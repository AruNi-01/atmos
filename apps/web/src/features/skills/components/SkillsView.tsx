"use client";

import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, ViewTransition } from "react";
import {
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@workspace/ui";
import { skillsApi, type SkillInfo } from "@/api/ws-api";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useQueryStates } from "nuqs";
import { skillsParams, type ScopeFilter, type SkillsTab } from "@/shared/lib/nuqs/searchParams";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  BookOpen,
  Download,
  Filter,
  FolderOpen,
  Globe,
  Loader2,
  Puzzle,
  LoaderCircle,
  RotateCcw,
  Search,
  Store,
} from "lucide-react";
import { SkillDetail } from "./SkillDetail";
import { SkillInstallTerminalDialog } from "./SkillInstallTerminalDialog";
import { SkillsInstalledTab } from "./SkillsInstalledTab";
import { SkillsMarketTab } from "./SkillsMarketTab";
import { SkillsResourcesTab } from "./SkillsResourcesTab";
import {
  marketCategories,
  resourceCategories,
  type SkillMarketItem,
} from "../lib/market-data";
import {
  buildSkillListUrl,
  countCategoryItems,
  filterMarketCategories,
  filterResourceCategories,
} from "../lib/skills-view-utils";

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
  const hasLoadedSkillsRef = useRef(false);

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

      if (scopeFilter === "all") {
        // Atmos built-in skills are considered "internal" by default — they only show
        // when the user explicitly selects the Atmos Built-in filter chip.
        return skill.scope !== "system";
      }
      if (scopeFilter === "global") return skill.scope === "global";
      if (scopeFilter === "system") return skill.scope === "system";
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
    return countCategoryItems(filteredMarketCategories);
  }, [filteredMarketCategories]);

  const resourceResultCount = useMemo(() => {
    return countCategoryItems(filteredResourceCategories);
  }, [filteredResourceCategories]);

  const loadSkills = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (isLoading || (hasLoadedSkillsRef.current && !force)) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await skillsApi.list({ forceRefresh: force });
      setSkills(result.skills || []);
    } catch (error) {
      console.error("Failed to load skills:", error);
    } finally {
      hasLoadedSkillsRef.current = true;
      setIsLoading(false);
    }
  }, [isLoading]);

  const handleSkillUpdated = useCallback((nextSkill: SkillInfo) => {
    setSkills((current) => current.map((skill) => (skill.id === nextSkill.id ? nextSkill : skill)));
    setSelectedSkill((current) => (current?.id === nextSkill.id ? nextSkill : current));
  }, []);

  useEffect(() => {
    if (!skillId && !hasLoadedSkillsRef.current) {
      void loadSkills();
    }
  }, [loadSkills, skillId]);

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
    startTransition(() => {
      router.push(
        buildSkillListUrl({
          activeTab,
          filter: scopeFilter,
          projects: projectsParam,
          query,
        }),
      );
      setSelectedSkill(null);
    });
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
    startTransition(() => {
      setSelectedSkill(skill);
      router.push(`/skills?${searchParams.toString()}`);
    });
  };

  const searchPlaceholder =
    activeTab === "installed"
      ? "Search installed skills..."
      : activeTab === "market"
      ? "Search skills market..."
      : "Search resources...";

  const setMarketCategoryOpen = (categoryId: string, open: boolean) => {
    setCollapsedMarketCategories((current) => ({
      ...current,
      [categoryId]: !open,
    }));
  };

  if (selectedSkill) {
    return (
      <ViewTransition key="skill-detail">
        <div className="h-full overflow-hidden bg-background">
          <SkillDetail
            skill={selectedSkill}
            onBack={handleBack}
            onUpdated={handleSkillUpdated}
            onDeleted={handleSkillDeleted}
          />
        </div>
      </ViewTransition>
    );
  }

  if (skillId && skillScope && isLoadingDetail) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <ViewTransition key="skill-list">
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
                    onClick={() => void loadSkills({ force: true })}
                    disabled={isLoading}
                    className="size-10 shrink-0 rounded-xl border-border/50 bg-muted/20 shadow-sm transition-all hover:bg-background cursor-pointer"
                    title="Refresh Skills"
                  >
                    {isLoading ? <LoaderCircle className="size-4 animate-spin-reverse" /> : <RotateCcw className="size-4" />}
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
                  <span className="ml-1 shrink-0 rounded-full border border-sky-500/20 bg-sky-500/10 px-1.5 text-[10px] font-medium tabular-nums text-sky-700 dark:text-sky-400">
                    {countCategoryItems(marketCategories)}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="resources">
                  <BookOpen className="size-4" />
                  Resources
                  <span className="ml-1 shrink-0 rounded-full border border-sky-500/20 bg-sky-500/10 px-1.5 text-[10px] font-medium tabular-nums text-sky-700 dark:text-sky-400">
                    {countCategoryItems(resourceCategories)}
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
                  variant={scopeFilter === "system" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleScopeFilterChange("system")}
                  className={cn(
                    "h-7 cursor-pointer gap-1.5 text-xs",
                    scopeFilter === "system" && "text-primary",
                  )}
                  title="Skills installed by Atmos under ~/.atmos/skills/.system/"
                >
                  <Puzzle className="size-3" />
                  Atmos Built-in
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
              <SkillsInstalledTab
                isLoading={isLoading}
                skills={skills}
                filteredSkills={filteredSkills}
                query={query}
                isFilterActive={isFilterActive}
                onResetFilters={() => void setParams({ q: "", filter: "all", projects: "" })}
                onOpenSkill={handleOpenInstalledSkill}
                onSkillUpdated={handleSkillUpdated}
                onSkillDeleted={handleSkillDeleted}
              />
              <SkillsMarketTab
                categories={filteredMarketCategories}
                resultCount={marketResultCount}
                query={query}
                collapsedCategories={collapsedMarketCategories}
                onCategoryOpenChange={setMarketCategoryOpen}
                onClearSearch={() => void setParams({ q: "" })}
                onInstallSkill={setInstallingSkill}
              />
              <SkillsResourcesTab
                categories={filteredResourceCategories}
                resultCount={resourceResultCount}
                query={query}
                onClearSearch={() => void setParams({ q: "" })}
              />
            </div>
          </div>
        </Tabs>
      </div>
      </ViewTransition>

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
