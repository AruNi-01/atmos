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
  const emptyHint = isProjectWiki
    ? "Run wiki generation from the Wiki tab"
    : "Click to add your first terminal session";

  return (
    <div className={cn("terminal-grid-container flex items-center justify-center", className)}>
      <button
        className="group flex flex-col items-center gap-4 transition-all duration-300 hover:text-foreground"
        onClick={() => onAddTerminal(emptyTitle)}
      >
        <div className="relative">
          <div className="absolute inset-0 scale-0 rounded-full bg-primary/20 blur-xl transition-transform duration-500 group-hover:scale-150" />
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-border bg-sidebar transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]">
            <Plus className="size-6 text-muted-foreground transition-all duration-500 group-hover:rotate-90 group-hover:text-primary" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold tracking-tight text-muted-foreground group-hover:text-foreground">
            {emptyLabel}
          </span>
          <span className="text-[11px] text-muted-foreground/60">{emptyHint}</span>
        </div>
      </button>
    </div>
  );
}
