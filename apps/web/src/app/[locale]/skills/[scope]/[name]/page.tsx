"use client";

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from '@workspace/ui';
import { skillsApi, SkillInfo } from '@/api/ws-api';
import { SkillDetail } from '@/components/skills/SkillDetail';
import Header from '@/components/layout/Header';

interface SkillDetailPageProps {
  params: Promise<{
    locale: string;
    scope: string;
    name: string;
  }>;
}

export default function SkillDetailPage({ params }: SkillDetailPageProps) {
  const router = useRouter();
  const { scope, name } = use(params);
  
  const [skill, setSkill] = useState<SkillInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSkill = async () => {
      setIsLoading(true);
      try {
        const result = await skillsApi.list();
        const foundSkill = result.skills.find(
          s => s.scope === scope && (s.title === decodeURIComponent(name) || s.name === decodeURIComponent(name))
        );
        
        if (foundSkill) {
          setSkill(foundSkill);
        } else {
          // Fallback or error
          console.error('Skill not found');
        }
      } catch (error) {
        console.error('Failed to fetch skill detail:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSkill();
  }, [scope, name]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-dvh bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex flex-col h-dvh bg-background">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <p className="text-lg font-medium">Skill not found</p>
          <button 
            onClick={() => router.back()}
            className="text-sm text-primary hover:underline mt-2 cursor-pointer"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header />
      <div className="flex-1 overflow-hidden">
        <SkillDetail skill={skill} onBack={() => router.back()} />
      </div>
    </div>
  );
}
