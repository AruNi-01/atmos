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
} from '@workspace/ui';
import { skillsApi, SkillInfo } from '@/api/ws-api';
import { SkillCard } from '@/components/skills/SkillCard';
import { useSearchParams, useRouter } from 'next/navigation';
import { SkillDetail } from './SkillDetail';

type ScopeFilter = 'all' | 'global' | 'project';

export const SkillsView: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillId = searchParams.get('skillId');
  const skillScope = searchParams.get('skillScope');

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

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
    router.push(`/?${params.toString()}`);
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
    return skills.filter(skill => {
      if (scopeFilter === 'all') return true;
      if (scopeFilter === 'global') return skill.scope === 'global';
      if (scopeFilter === 'project') {
        if (selectedProjectIds.length === 0) return skill.scope === 'project';
        return skill.scope === 'project' && skill.project_id && selectedProjectIds.includes(skill.project_id);
      }
      return true;
    });
  }, [skills, scopeFilter, selectedProjectIds]);

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
        const identifier = decodeURIComponent(skillId);
        const result = await skillsApi.get(skillScope, identifier);
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
    const params = new URLSearchParams(searchParams.toString());
    params.delete('skillId');
    params.delete('skillScope');
    router.push(`/?${params.toString()}`);
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
      <div className="px-6 py-4 shrink-0 border-b border-border bg-background/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10 text-primary">
              <Puzzle className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">My Skills</h1>
              <p className="text-sm text-muted-foreground">
                {filteredSkills.length > 0 
                  ? `${filteredSkills.length} skill${filteredSkills.length > 1 ? 's' : ''}${scopeFilter !== 'all' ? ' filtered' : ' installed'}` 
                  : 'Manage your installed skills'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={showFilter || isFilterActive ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowFilter(!showFilter)}
              className={cn("gap-2 cursor-pointer", isFilterActive && "text-primary")}
            >
              <Filter className="size-4" />
              Filter
              {isFilterActive && (
                <span className="size-1.5 rounded-full bg-primary" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSkills}
              disabled={isLoading}
              className="gap-2 cursor-pointer"
            >
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
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
      <div className="flex-1 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
            <Puzzle className="size-16 mb-4 opacity-30" />
            <p className="text-base font-medium">
              {skills.length === 0 ? 'No skills installed' : 'No skills match the filter'}
            </p>
            <p className="text-sm mt-1">
              {skills.length === 0 
                ? 'Install skills to extend your workspace capabilities'
                : 'Try adjusting your filter settings'}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="grid gap-4 p-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
              {filteredSkills.map((skill, index) => (
                <SkillCard 
                  key={`${skill.scope}-${skill.name}-${index}`} 
                  skill={skill} 
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
