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
import Header from '@/components/layout/Header';

export default function SkillsPage() {
  const [activeTab, setActiveTab] = useState<'my-skills' | 'marketplace'>('my-skills');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    if (activeTab === 'my-skills') {
      loadSkills();
    }
  }, [activeTab, loadSkills]);

  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Puzzle className="size-5" />
            Skills Management
          </h2>
          <div className="flex items-center gap-2">
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
        </div>

        {/* Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={(v) => setActiveTab(v as 'my-skills' | 'marketplace')}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 py-4 shrink-0 border-b border-border">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 p-6">
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
    </div>
  );
}
