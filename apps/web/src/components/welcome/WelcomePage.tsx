"use client";

import React from 'react';
import { Plus, cn } from '@workspace/ui';
import { Bot } from 'lucide-react';
import { AtmosWordmark } from '@/components/ui/AtmosWordmark';

interface WelcomePageProps {
  onAddProject?: () => void;
  onConnectAgent?: () => void;
  className?: string;
}

const WelcomePage: React.FC<WelcomePageProps> = ({
  onAddProject,
  onConnectAgent,
  className
}) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-full bg-background selection:bg-foreground/10 overflow-y-auto py-8 px-6",
      className
    )}>
      <div className="flex flex-col items-center max-w-xl w-full space-y-12 -mt-24 pb-8">
        {/* Logo and Identity */}
        <div className="flex flex-col items-center space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
          <AtmosWordmark />
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out fill-mode-both delay-300">
          <button
            onClick={onAddProject}
            className="flex flex-col items-start p-6 rounded-xl border border-sidebar-border bg-sidebar-accent/10 hover:bg-sidebar-accent/30 hover:border-foreground/20 hover:shadow-sm transition-all group relative overflow-hidden text-left"
          >
            <div className="absolute top-0 right-0 p-3 opacity-5 transition-opacity">
              <Plus className="size-16 -mr-4 -mt-4 text-foreground" />
            </div>
            <div className="size-9 rounded-lg bg-foreground/5 flex items-center justify-center mb-4 transition-all group-hover:bg-foreground/10">
              <Plus className="size-4.5 text-foreground" />
            </div>
            <div className="space-y-1 relative">
              <h3 className="text-base font-bold text-foreground transition-colors">Add Project</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Import an existing local project.
              </p>
            </div>
          </button>

          <button
            onClick={onConnectAgent}
            className="flex flex-col items-start p-6 rounded-xl border border-sidebar-border bg-sidebar-accent/10 hover:bg-sidebar-accent/30 hover:border-foreground/20 hover:shadow-sm transition-all group relative overflow-hidden text-left"
          >
            <div className="absolute top-0 right-0 p-3 opacity-5 transition-opacity">
              <Bot className="size-16 -mr-4 -mt-4 text-foreground" />
            </div>
            <div className="size-9 rounded-lg bg-foreground/5 flex items-center justify-center mb-4 transition-all group-hover:bg-foreground/10">
              <Bot className="size-4.5 text-foreground" />
            </div>
            <div className="space-y-1 relative">
              <h3 className="text-base font-bold text-foreground transition-colors">Connect ACP Agent</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Connect and manage your Agents.
              </p>
            </div>
          </button>
        </div>


      </div>
    </div>
  );
};

export default WelcomePage;
