"use client";

import React from 'react';
import { Hexagon, Plus, Globe, Zap, cn } from '@workspace/ui';

interface WelcomePageProps {
  onAddProject?: () => void;
  onCloneRemote?: () => void;
  className?: string;
}

const WelcomePage: React.FC<WelcomePageProps> = ({
  onAddProject,
  onCloneRemote,
  className
}) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-full bg-background selection:bg-foreground/10 overflow-y-auto py-8 px-6",
      className
    )}>
      <div className="flex flex-col items-center max-w-xl w-full space-y-12">
        {/* Logo and Identity */}
        <div className="flex flex-col items-center space-y-4 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out">
          <div className="relative group">
            <div className="absolute inset-0 blur-2xl bg-foreground/5 rounded-full" />
            <div className="relative size-20 flex items-center justify-center bg-sidebar-accent/50 rounded-2xl border border-sidebar-border shadow-md backdrop-blur-sm transition-transform duration-500 group-hover:scale-105">
              <Hexagon className="size-10 text-foreground" strokeWidth={1.5} />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <h1 className="text-4xl font-bold tracking-tighter text-foreground">
              ATMOS
            </h1>
            <p className="text-sm text-muted-foreground font-medium text-pretty">
              Your intelligent, local-first development environment.
            </p>
          </div>
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
            onClick={onCloneRemote}
            className="flex flex-col items-start p-6 rounded-xl border border-sidebar-border bg-sidebar-accent/10 hover:bg-sidebar-accent/30 hover:border-foreground/20 hover:shadow-sm transition-all group relative overflow-hidden text-left"
          >
            <div className="absolute top-0 right-0 p-3 opacity-5 transition-opacity">
              <Globe className="size-16 -mr-4 -mt-4 text-foreground" />
            </div>
            <div className="size-9 rounded-lg bg-foreground/5 flex items-center justify-center mb-4 transition-all group-hover:bg-foreground/10">
              <Globe className="size-4.5 text-foreground" />
            </div>
            <div className="space-y-1 relative">
              <h3 className="text-base font-bold text-foreground transition-colors">Clone From Remote</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Connect and setup from GitHub.
              </p>
            </div>
          </button>
        </div>

        {/* Footer Shortcut */}
        <div className="pt-8 border-t border-sidebar-border/50 w-full flex flex-col items-center gap-3 animate-in fade-in duration-1000 delay-700 fill-mode-both">
          <div className="flex items-center space-x-2 text-[12px] text-muted-foreground/60 font-medium">
            <Zap className="size-3 text-muted-foreground/60" />
            <span>Press <kbd className="px-1 py-0.5 rounded border border-sidebar-border bg-muted/50 text-[10px] font-mono text-muted-foreground">⌘</kbd> + <kbd className="px-1 py-0.5 rounded border border-sidebar-border bg-muted/50 text-[10px] font-mono text-muted-foreground">P</kbd> to switch projects</span>
          </div>
          <div className="text-[11px] text-muted-foreground/40 font-mono tracking-widest uppercase">
            v1.0.0-alpha
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
