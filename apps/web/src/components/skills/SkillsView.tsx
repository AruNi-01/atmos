"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ScrollArea,
  Loader2,
  Puzzle,
  Store,
  RefreshCw,
  Button,
} from '@workspace/ui';
import { skillsApi, SkillInfo } from '@/api/ws-api';
import { SkillCard } from '@/components/skills/SkillCard';
import { useSearchParams, useRouter } from 'next/navigation';
import { SkillDetail } from './SkillDetail';

export const SkillsView: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillId = searchParams.get('skillId');
  const skillScope = searchParams.get('skillScope');

  const [activeTab, setActiveTab] = useState<'my-skills' | 'marketplace'>('my-skills');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

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
    if (activeTab === 'my-skills' && !skillId) {
      loadSkills();
    }
  }, [activeTab, loadSkills, skillId]);

  // Load specific skill if ID provided
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
      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={(v) => setActiveTab(v as 'my-skills' | 'marketplace')}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 shrink-0 border-b border-border bg-background/50 flex items-center justify-between">
          <TabsList className="w-fit">
            <TabsTrigger value="my-skills" className="flex items-center gap-2 px-4">
              <Puzzle className="size-4" />
              My Skills
              {skills.length > 0 && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full ml-1">
                  {skills.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="flex items-center gap-2 px-4">
              <Store className="size-4" />
              Marketplace
            </TabsTrigger>
          </TabsList>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSkills}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <TabsContent value="my-skills" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
              <Puzzle className="size-16 mb-4 opacity-30" />
              <p className="text-base font-medium">No skills installed</p>
              <p className="text-sm mt-1">
                Check out the Marketplace to discover and install skills
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="grid gap-4 p-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                {skills.map((skill, index) => (
                  <SkillCard 
                    key={`${skill.scope}-${skill.name}-${index}`} 
                    skill={skill} 
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="marketplace" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
          <iframe
            src="https://skills.sh"
            className="w-full flex-1 border-0"
            title="Skills Marketplace"
            allow="clipboard-write"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
