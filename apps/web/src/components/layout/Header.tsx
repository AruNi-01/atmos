"use client";
import React from 'react';
import { ArrowRight, GitPullRequest, Archive, Bell, Search, Hexagon } from '@workspace/ui';
import { cn } from "@/lib/utils";

const Header: React.FC = () => {
  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-white/5 select-none">
      {/* Left: Identity */}
      <div className="flex items-center space-x-4">
        <div className={cn("flex items-center text-zinc-100 font-semibold text-balance")}>
          <Hexagon className="size-4 mr-2 text-emerald-400 fill-emerald-400/10" />
          <span className="text-[14px]">Vibe Habitat</span>
        </div>
        <span className="text-zinc-700 text-lg font-light">/</span>
        <span className="text-[12px] text-zinc-400 font-medium whitespace-nowrap text-balance">Visual Terminal Workspace</span>
      </div>

      {/* Center: Git Context Flow */}
      <div className="flex items-center space-x-3 bg-zinc-800/30 px-4 py-1.5 rounded-sm border border-white/5 hover:border-zinc-700 transition-colors ease-out duration-200 cursor-pointer group">
        <div className="flex items-center space-x-2">
          <span className="size-2 rounded-full bg-green-500"></span>
          <span className="text-[13px] font-medium text-zinc-200 group-hover:text-white transition-colors ease-out duration-200">feat/auth-flow</span>
        </div>
        <ArrowRight className="size-3.5 text-zinc-600" />
        <div className="flex items-center space-x-2">
          <span className="size-2 rounded-full bg-zinc-400"></span>
          <span className="text-[13px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors ease-out duration-200">origin/main</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-3 justify-end">
        <button
          aria-label="Search"
          className="p-2 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors ease-out duration-200"
        >
          <Search className="size-4" />
        </button>
        <button className="flex items-center space-x-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[12px] font-medium rounded-sm border border-white/5 transition-colors ease-out duration-200">
          <GitPullRequest className="size-3.5" />
          <span>Open PR</span>
        </button>
        <div className="h-4 w-[1px] bg-zinc-800 mx-2"></div>
        <button
          aria-label="Notifications"
          className="p-2 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors ease-out duration-200 relative"
        >
          <Bell className="size-4" />
          <span className="absolute top-2 right-2 size-1.5 bg-red-500 rounded-full border-2 border-zinc-900"></span>
        </button>
        <button
          aria-label="Archive"
          className="p-2 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors ease-out duration-200"
        >
          <Archive className="size-4" />
        </button>
      </div>
    </header>
  );
};

export default Header;