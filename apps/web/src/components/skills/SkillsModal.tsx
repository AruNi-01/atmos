"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useQueryState } from 'nuqs';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ScrollArea,
  Loader2,
  Puzzle,
  Store,
  X,
  LoaderCircle,
  RotateCw,
  Button,
} from '@workspace/ui';
import { skillsApi, SkillInfo } from '@/api/ws-api';
import { skillsModalParams, type SkillsModalTab } from '@/lib/nuqs/searchParams';
import { SkillCard } from './SkillCard';
import { SkillDetail } from './SkillDetail';

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useQueryState('skillsModalTab', skillsModalParams.skillsModalTab);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);

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

  const handleSkillUpdated = useCallback((nextSkill: SkillInfo) => {
    setSkills((current) => current.map((skill) => (skill.id === nextSkill.id ? nextSkill : skill)));
    setSelectedSkill((current) => (current?.id === nextSkill.id ? nextSkill : current));
  }, []);

  const handleSkillDeleted = useCallback((skillId: string) => {
    setSkills((current) => current.filter((skill) => skill.id !== skillId));
    setSelectedSkill((current) => (current?.id === skillId ? null : current));
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'my-skills' && !selectedSkill) {
      loadSkills();
    }
  }, [isOpen, activeTab, loadSkills, selectedSkill]);

  // Reset selected skill when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedSkill(null);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedSkill) {
          setSelectedSkill(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose, selectedSkill]);

  if (!isOpen) return null;

  // Show skill detail view
  if (selectedSkill) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <SkillDetail
          skill={selectedSkill}
          onBack={() => setSelectedSkill(null)}
          onUpdated={handleSkillUpdated}
          onDeleted={handleSkillDeleted}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Puzzle className="size-5" />
          Skills
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSkills}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            Refresh
          </Button>
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={(v) => setActiveTab(v as SkillsModalTab)}
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
                    key={`${skill.agents.join(",")}-${skill.name}-${index}`} 
                    skill={skill} 
                    onClick={() => setSelectedSkill(skill)}
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
