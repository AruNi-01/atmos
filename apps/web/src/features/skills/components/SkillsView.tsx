"use client";

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  PushPageStack,
  Tabs,
  usePushPageTransition,
} from "@workspace/ui";
import { useTranslations } from "next-intl";
import { skillsApi, type SkillInfo } from "@/api/ws-api";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useSkillsListQuery, useInvalidateSkillsList, forceRefreshSkillsList } from "@/features/skills/hooks/use-skills-query";
import { useQueryClient } from "@tanstack/react-query";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { queryKeys } from "@/api/query/query-keys";
import type { SkillsListResponse } from "@/features/skills/lib/skills-query-options";
import { useQueryStates } from "nuqs";
import { skillsParams, type ScopeFilter, type SkillsTab } from "@/shared/lib/nuqs/searchParams";
import { useContextParams } from "@/shared/hooks/use-context-params";
import {
  BookOpen,
  Download,
  Loader2,
  Puzzle,
  LoaderCircle,
  RotateCcw,
  Search,
  Store,
} from "lucide-react";
import { LaunchpadPageTabs } from "@/shared/components/LaunchpadPageTabs";
import { SkillDetail } from "./SkillDetail";
import { SkillsFilterMenu } from "./SkillsFilterMenu";
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
  const t = useTranslations("skills.view");
  const router = useAppRouter();
  const [{ tab: activeTab, filter: scopeFilter, projects: projectsParam, q: query }, setParams] = useQueryStates(skillsParams);
  const { skillScope, skillId } = useContextParams();
  const {
    phase: pushPhase,
    isPresented: pushPresented,
    open: pushOpen,
    close: pushClose,
  } = usePushPageTransition();

  const skillsQuery = useSkillsListQuery();
  const skills = skillsQuery.data?.skills ?? [];
  const isLoading = skillsQuery.isLoading;
  const isRefreshing = skillsQuery.isFetching && !skillsQuery.isPending;
  const invalidateSkillsList = useInvalidateSkillsList();
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  /** Skill data kept until the slide-out finishes. List payload opens first; get() enriches later. */
  const [detailSkill, setDetailSkill] = useState<SkillInfo | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [installingSkill, setInstallingSkill] = useState<SkillMarketItem | null>(null);
  const [collapsedMarketCategories, setCollapsedMarketCategories] = useState<Record<string, boolean>>({});
  const detailSkillRef = useRef(detailSkill);
  detailSkillRef.current = detailSkill;
  const pushPhaseRef = useRef(pushPhase);
  pushPhaseRef.current = pushPhase;

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

  const handleSkillUpdated = useCallback((nextSkill: SkillInfo) => {
    queryClient.setQueryData<SkillsListResponse>(
      queryKeys.computer.skillsList(scope),
      (prev) =>
        prev
          ? { skills: prev.skills.map((s) => (s.id === nextSkill.id ? nextSkill : s)) }
          : prev,
    );
    setDetailSkill((current) => (current?.id === nextSkill.id ? nextSkill : current));
  }, [queryClient, scope]);

  /** Open immediately with whatever skill payload we have (list row is enough). */
  const openDetail = useCallback(
    (skill: SkillInfo) => {
      setDetailSkill(skill);
      pushOpen();
    },
    [pushOpen],
  );

  /** Enrich open detail from skills_get without blocking or re-animating. */
  const enrichDetailInBackground = useCallback(async (scopeArg: string, id: string) => {
    try {
      const result = await skillsApi.get(scopeArg, id);
      if (pushPhaseRef.current === "closing" || pushPhaseRef.current === "closed") return;
      if (detailSkillRef.current?.id !== result.id) return;
      setDetailSkill(result);
    } catch (error) {
      console.error("Failed to load skill details:", error);
    }
  }, []);

  useEffect(() => {
    const loadSkillDetail = async () => {
      if (!skillId || !skillScope) {
        // URL left detail (e.g. browser back) — slide out without pushing again.
        if (pushPhaseRef.current === "open") {
          pushClose({
            onComplete: () => setDetailSkill(null),
          });
        }
        setIsLoadingDetail(false);
        return;
      }

      // Local close: URL still has skillId until exit finishes — do not re-open.
      if (pushPhaseRef.current === "closing") {
        return;
      }

      // Already showing this skill from a list click — keep UI up, refresh in background.
      if (detailSkillRef.current?.id === skillId && pushPhaseRef.current === "open") {
        setIsLoadingDetail(false);
        void enrichDetailInBackground(skillScope, skillId);
        return;
      }

      // Cold open via URL only: show spinner until we have a payload, then open.
      setIsLoadingDetail(true);
      try {
        const result = await skillsApi.get(skillScope, skillId);
        const phaseAfterLoad: string = pushPhaseRef.current;
        if (phaseAfterLoad === "closing") return;
        openDetail(result);
      } catch (error) {
        console.error("Failed to load skill details:", error);
      } finally {
        setIsLoadingDetail(false);
      }
    };

    void loadSkillDetail();
  }, [enrichDetailInBackground, openDetail, pushClose, skillId, skillScope]);

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
    const listHref = buildSkillListUrl({
      activeTab,
      filter: scopeFilter,
      projects: projectsParam,
      query,
    });
    pushClose({
      onComplete: () => {
        setDetailSkill(null);
        router.push(listHref);
      },
    });
  }, [activeTab, projectsParam, pushClose, query, router, scopeFilter]);

  const handleSkillDeleted = useCallback(
    (skillIdToRemove: string) => {
      queryClient.setQueryData<SkillsListResponse>(
        queryKeys.computer.skillsList(scope),
        (prev) =>
          prev ? { skills: prev.skills.filter((s) => s.id !== skillIdToRemove) } : prev,
      );
      if (detailSkill?.id === skillIdToRemove || skillId === skillIdToRemove) {
        handleBack();
      }
      invalidateSkillsList();
    },
    [detailSkill?.id, handleBack, invalidateSkillsList, queryClient, scope, skillId],
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
    // Paint the detail page immediately with list data; URL + full payload follow.
    openDetail(skill);
    queueMicrotask(() => {
      router.push(`/skills?${searchParams.toString()}`);
    });
  };

  const searchPlaceholder =
    activeTab === "installed"
      ? t("search.installed")
      : activeTab === "market"
        ? t("search.market")
        : t("search.resources");

  const setMarketCategoryOpen = (categoryId: string, open: boolean) => {
    setCollapsedMarketCategories((current) => ({
      ...current,
      [categoryId]: !open,
    }));
  };

  const showDetail = detailSkill != null && pushPresented;
  const showDetailLoading =
    !showDetail && !!skillId && !!skillScope && isLoadingDetail && pushPhase !== "closing";

  return (
    <>
      <PushPageStack
        phase={pushPhase}
        base={
          <>
            <div className="sticky top-0 z-10 bg-background/50 px-8 py-6 backdrop-blur-sm">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
                      <Puzzle className="size-6" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">
                        {t("title")}
                      </h2>
                      <p className="max-w-xs text-sm text-muted-foreground text-pretty">
                        {t("description")}
                      </p>
                    </div>
                  </div>
                  <LaunchpadPageTabs
                    value={activeTab}
                    onValueChange={(value) => void setParams({ tab: value as SkillsTab })}
                    items={[
                      { value: "installed", label: t("tabs.installed"), icon: Download },
                      { value: "market", label: t("tabs.market"), icon: Store },
                      { value: "resources", label: t("tabs.resources"), icon: BookOpen },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="group relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                    <Input
                      value={query}
                      onChange={(event) => void setParams({ q: event.target.value })}
                      placeholder={searchPlaceholder}
                      className="h-11 rounded-xl border-border/50 bg-muted/20 pl-10 shadow-sm transition-all focus:bg-background focus-visible:ring-1 focus-visible:ring-primary/20"
                    />
                  </div>
                  {activeTab === "installed" ? (
                    <SkillsFilterMenu
                      scopeFilter={scopeFilter}
                      selectedProjectIds={selectedProjectIds}
                      projects={projects}
                      onScopeChange={handleScopeFilterChange}
                      onProjectToggle={handleProjectToggle}
                      onClear={() => void setParams({ filter: "all", projects: "" })}
                    />
                  ) : null}
                  {activeTab === "installed" ? (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setIsForceRefreshing(true);
                        void forceRefreshSkillsList().finally(() => setIsForceRefreshing(false));
                      }}
                      disabled={isLoading || isForceRefreshing || isRefreshing}
                      className="size-11 shrink-0 rounded-xl border-border/50 bg-muted/20 shadow-sm transition-all hover:bg-background"
                      title={t("refresh")}
                    >
                      {isForceRefreshing || isRefreshing ? (
                        <LoaderCircle className="size-4 animate-spin-reverse" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => void setParams({ tab: value as SkillsTab })}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
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
          </>
        }
        loading={
          showDetailLoading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : null
        }
        overlay={
          showDetail && detailSkill ? (
            <SkillDetail
              skill={detailSkill}
              onBack={handleBack}
              onUpdated={handleSkillUpdated}
              onDeleted={handleSkillDeleted}
            />
          ) : null
        }
        overlayKey={detailSkill?.id}
      />

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
