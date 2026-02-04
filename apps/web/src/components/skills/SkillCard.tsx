"use client";

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  cn,
  Puzzle,
  Folder,
  Globe,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  FileText,
} from '@workspace/ui';
import { SkillInfo } from '@/api/ws-api';
import { getAgentConfig } from './constants';

interface SkillCardProps {
  skill: SkillInfo;
  onClick?: () => void;
}

export const SkillCard: React.FC<SkillCardProps> = ({ skill, onClick }) => {
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale as string || 'en';
  const fileCount = skill.files?.length || 0;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      const identifier = encodeURIComponent(skill.title || skill.name);
      router.push(`/${locale}/skills/${skill.scope}/${identifier}`);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className="h-[140px] rounded-lg border border-border bg-card p-4 hover:bg-accent/50 hover:border-accent transition-colors cursor-pointer flex flex-col"
    >
      <div className="flex items-start gap-3 flex-1 min-h-0">
        <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Puzzle className="size-4 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-sm truncate flex-1">{skill.title || skill.name}</h3>
            
            <div className="flex items-center gap-1.5 shrink-0">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn(
                      "text-[9px] px-1 py-0.5 rounded font-medium flex items-center gap-1 cursor-default uppercase tracking-wider",
                      skill.scope === 'global' 
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    )}>
                      {skill.scope === 'global' ? <Globe className="size-2" /> : <Folder className="size-2" />}
                      {skill.scope}
                    </span>
                  </TooltipTrigger>
                  {skill.scope === 'project' && skill.project_name && (
                    <TooltipContent side="top">
                      <p className="text-xs">From: {skill.project_name}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              {fileCount > 0 && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1 uppercase tracking-wider font-medium">
                  <FileText className="size-2" />
                  {fileCount}
                </span>
              )}
            </div>
          </div>

          {skill.description ? (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed flex-1">
              {skill.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/50 mt-1 italic flex-1">No description</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 flex-wrap overflow-hidden h-[22px]">
        {skill.agents.map((agent) => {
          const config = getAgentConfig(agent);
          const label = (
            <span 
              key={agent} 
              className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", config.color)}
            >
              {config.name}
            </span>
          );

          if (agent === 'unified') {
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
  );
};
