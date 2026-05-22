"use client";

import { Loader2, Plus } from "lucide-react";

import { cn } from "@workspace/ui";

type TerminalGridLoadingStateProps = {
  className?: string;
};

export function TerminalGridLoadingState({ className }: TerminalGridLoadingStateProps) {
  return (
    <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading workspace...</span>
      </div>
    </div>
  );
}

type TerminalGridEmptyStateProps = {
  className?: string;
  isProjectWiki: boolean;
  onAddTerminal: (title?: string) => void;
};

export function TerminalGridEmptyState({
  className,
  isProjectWiki,
  onAddTerminal,
}: TerminalGridEmptyStateProps) {
  const emptyTitle = isProjectWiki ? "Generate Project Wiki" : undefined;
  const emptyLabel = isProjectWiki ? "Add Project Wiki Terminal" : "Initialize Workspace";
  const emptyHint = isProjectWiki ? "Run wiki generation from the Wiki tab" : "Click to add your first terminal session";

  return (
    <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
      <button
        className="flex flex-col items-center gap-4 hover:text-foreground transition-all duration-300 group"
        onClick={() => onAddTerminal(emptyTitle)}
      >
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-0 group-hover:scale-150 transition-transform duration-500" />
          <div className="relative size-14 rounded-2xl bg-sidebar border border-border flex items-center justify-center group-hover:border-primary/50 group-hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)] transition-all duration-300">
            <Plus className="size-6 text-muted-foreground group-hover:text-primary group-hover:rotate-90 transition-all duration-500" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold tracking-tight text-muted-foreground group-hover:text-foreground transition-colors">
            {emptyLabel}
          </span>
          <span className="text-[11px] text-muted-foreground/60">
            {emptyHint}
          </span>
        </div>
      </button>
    </div>
  );
}
