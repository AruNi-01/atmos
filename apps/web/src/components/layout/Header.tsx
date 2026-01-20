"use client";
import React from 'react';
import { ArrowRight, GitPullRequest, Archive, Bell, Search, Hexagon, ThemeToggle } from '@workspace/ui';
import { cn } from "@/lib/utils";

const Header: React.FC = () => {
  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-sidebar-border select-none">
      {/* Left: Identity */}
      <div className="flex items-center space-x-4">
        <div className={cn("flex items-center text-foreground font-semibold text-balance")}>
          <Hexagon className="size-4 mr-2 text-emerald-500 fill-emerald-500/10" />
          <span className="text-[14px]">Vibe Habitat</span>
        </div>
        <span className="text-muted-foreground/30 text-lg font-light">/</span>
        <span className="text-[12px] text-muted-foreground font-medium whitespace-nowrap text-balance">Visual Terminal Workspace</span>
      </div>

      {/* Center: Git Context Flow */}
      <div className="flex items-center space-x-3 bg-muted/50 px-4 py-1.5 rounded-sm border border-sidebar-border hover:border-sidebar-border/80 transition-colors ease-out duration-200 cursor-pointer group">
        <div className="flex items-center space-x-2">
          <span className="size-2 rounded-full bg-green-500"></span>
          <span className="text-[13px] font-medium text-foreground group-hover:text-foreground transition-colors ease-out duration-200">feat/auth-flow</span>
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground" />
        <div className="flex items-center space-x-2">
          <span className="size-2 rounded-full bg-muted-foreground"></span>
          <span className="text-[13px] font-medium text-muted-foreground group-hover:text-foreground transition-colors ease-out duration-200">origin/main</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-3 justify-end">
        <button
          aria-label="Search"
          className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
        >
          <Search className="size-4" />
        </button>
        <button className="flex items-center space-x-2 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-[12px] font-medium rounded-sm border border-sidebar-border transition-colors ease-out duration-200">
          <GitPullRequest className="size-3.5" />
          <span>Open PR</span>
        </button>
        <div className="h-4 w-[1px] bg-border mx-2"></div>
        <button
          aria-label="Notifications"
          className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200 relative"
        >
          <Bell className="size-4" />
          <span className="absolute top-2 right-2 size-1.5 bg-red-500 rounded-full border-2 border-background"></span>
        </button>
        <button
          aria-label="Archive"
          className="p-2 hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
        >
          <Archive className="size-4" />
        </button>
        <ThemeToggle className="size-8 hover:bg-accent text-muted-foreground hover:text-accent-foreground" />
      </div>
    </header>
  );
};

export default Header;