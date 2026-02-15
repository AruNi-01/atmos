"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScrollArea,
  Loader2,
  Puzzle,
  RefreshCw,
  Button,
  Globe,
  FolderOpen,
  Filter,
  cn,
  Input,
} from '@workspace/ui';
import { skillsApi, SkillInfo } from '@/api/ws-api';
import { SkillCard } from '@/components/skills/SkillCard';
import { useSearchParams, useRouter } from 'next/navigation';
import { SkillDetail } from './SkillDetail';
import { useContextParams } from "@/hooks/use-context-params";
import { motion, AnimatePresence } from "motion/react";
import { Search } from "lucide-react";
import { Skeleton } from "@workspace/ui";

type ScopeFilter = 'all' | 'global' | 'project';

export const SkillsView: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { skillScope, skillId } = useContextParams();

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [query, setQuery] = useState("");

  // Read filter state from URL
  const scopeFilter = (searchParams.get('filter') as ScopeFilter) || 'all';
  const selectedProjectIds = useMemo(() => {
    const ids = searchParams.get('projects');
    return ids ? ids.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const isFilterActive = scopeFilter !== 'all';
  const [showFilter, setShowFilter] = useState(isFilterActive);

  // Update URL with filter state
  const updateFilterParams = useCallback((filter: ScopeFilter, projectIds: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === 'all') {
      params.delete('filter');
      params.delete('projects');
    } else {
      params.set('filter', filter);
      if (filter === 'project' && projectIds.length > 0) {
        params.set('projects', projectIds.join(','));
      } else {
        params.delete('projects');
      }
    }
    const qs = params.toString();
    router.push(qs ? `/skills?${qs}` : '/skills');
  }, [router, searchParams]);

  const projects = useMemo(() => {
    const projectMap = new Map<string, string>();
    skills.forEach(skill => {
      if (skill.scope === 'project' && skill.project_id && skill.project_name) {
        projectMap.set(skill.project_id, skill.project_name);
      }
    });
    return Array.from(projectMap.entries()).map(([id, name]) => ({ id, name }));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter(skill => {
      // Name search
      if (q && !skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) {
        return false;
      }

      if (scopeFilter === 'all') return true;
      if (scopeFilter === 'global') return skill.scope === 'global';
      if (scopeFilter === 'project') {
        if (selectedProjectIds.length === 0) return skill.scope === 'project';
        return skill.scope === 'project' && skill.project_id && selectedProjectIds.includes(skill.project_id);
      }
      return true;
    });
  }, [skills, scopeFilter, selectedProjectIds, query]);

  const handleScopeFilterChange = (filter: ScopeFilter) => {
    updateFilterParams(filter, []);
  };

  const handleProjectToggle = (projectId: string) => {
    const newIds = selectedProjectIds.includes(projectId)
      ? selectedProjectIds.filter(id => id !== projectId)
      : [...selectedProjectIds, projectId];
    updateFilterParams('project', newIds);
  };

  const loadSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await skillsApi.list();
      setSkills(result.skills || []);
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!skillId && skills.length === 0 && !isLoading) {
      loadSkills();
    }
  }, [loadSkills, skillId, skills.length, isLoading]);

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
        console.error('Failed to load skill details:', error);
      } finally {
        setIsLoadingDetail(false);
      }
    };

    loadSkillDetail();
  }, [skillId, skillScope]);

  const handleBack = () => {
    router.push('/skills');
    setSelectedSkill(null);
  };

  if (skillId && skillScope) {
    if (isLoadingDetail) {
      return (
        <div className="flex items-center justify-center h-full bg-background">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (selectedSkill) {
      return (
        <div className="h-full bg-background overflow-hidden">
          <SkillDetail skill={selectedSkill} onBack={handleBack} />
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/50 px-8 py-6 backdrop-blur-sm sticky top-0 z-10 w-full">
        <div className="flex items-center justify-between gap-6 w-full">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <Puzzle className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">Skill Registry</h2>
              <p className="text-sm text-muted-foreground text-pretty max-w-xs">
                Browse and manage available agent skills
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full group">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary transition-colors" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search skills..."
                className="h-10 pl-10 bg-muted/20 border-border/50 focus:bg-background transition-all rounded-xl shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showFilter || isFilterActive ? 'secondary' : 'outline'}
                size="icon"
                onClick={() => setShowFilter(!showFilter)}
                className={cn(
                  "size-10 shrink-0 rounded-xl transition-all shadow-sm cursor-pointer relative",
                  !showFilter && !isFilterActive && "bg-muted/20 border-border/50 hover:bg-background",
                  isFilterActive && "ring-1 ring-primary/30"
                )}
                title="Toggle Filters"
              >
                <Filter className="size-4" />
                {isFilterActive && (
                  <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-primary border-2 border-background" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={loadSkills}
                disabled={isLoading}
                className="size-10 shrink-0 rounded-xl bg-muted/20 border-border/50 hover:bg-background transition-all shadow-sm cursor-pointer"
                title="Refresh Skills"
              >
                <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </div>


      {/* Filter Bar */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          showFilter ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-6 py-3 shrink-0 border-b border-border bg-background">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={scopeFilter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleScopeFilterChange('all')}
              className="h-7 text-xs cursor-pointer"
            >
              All
            </Button>
            <Button
              variant={scopeFilter === 'global' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleScopeFilterChange('global')}
              className={cn("h-7 text-xs gap-1.5 cursor-pointer", scopeFilter === 'global' && "text-primary")}
            >
              <Globe className="size-3" />
              Global
            </Button>
            <Button
              variant={scopeFilter === 'project' && selectedProjectIds.length === 0 ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleScopeFilterChange('project')}
              className={cn("h-7 text-xs gap-1.5 cursor-pointer", scopeFilter === 'project' && selectedProjectIds.length === 0 && "text-primary")}
            >
              <FolderOpen className="size-3" />
              Project
            </Button>

            {/* Project sub-filters */}
            {scopeFilter === 'project' && projects.length > 0 && (
              <>
                <div className="h-4 w-px bg-border mx-1" />
                {projects.map(project => (
                  <Button
                    key={project.id}
                    variant={selectedProjectIds.includes(project.id) ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleProjectToggle(project.id)}
                    className={cn(
                      "h-7 text-xs cursor-pointer",
                      selectedProjectIds.includes(project.id) && "text-primary"
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

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-on-hover">
        <div className="p-8 space-y-8 w-full">
          {isLoading ? (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredSkills.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="size-20 rounded-3xl bg-muted/20 flex items-center justify-center mb-6">
                <Puzzle className="size-10 text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {skills.length === 0 ? "No skills installed" : "No results found"}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto text-pretty">
                {skills.length === 0
                  ? "Extend Atmos core capabilities with community-built skills or create your own."
                  : `We couldn't find any skills matching "${query}". Try a different search term or adjust filters.`}
              </p>
              {(query || isFilterActive) && (
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery("");
                    handleScopeFilterChange("all");
                  }}
                  className="mt-6 font-medium"
                >
                  Reset all filters
                </Button>
              )}
            </motion.div>
          ) : (
            <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              <AnimatePresence mode="popLayout">
                {filteredSkills.map((skill, index) => (
                  <motion.div
                    key={skill.path}
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                    transition={{
                      duration: 0.2,
                      delay: Math.min(index * 0.03, 0.3),
                      ease: "easeOut"
                    }}
                  >
                    <SkillCard skill={skill} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
