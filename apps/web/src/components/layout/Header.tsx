import React from 'react';
import { ArrowRight, GitPullRequest, Archive, Bell, Search, Hexagon } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-white/5  select-none">
      {/* Left: Identity */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center text-zinc-100 font-semibold tracking-tight">
          <Hexagon className="w-4 h-4 mr-2 text-emerald-400 fill-emerald-400/10" />
          <span className="text-[14px]">Vibe Habitat</span>
        </div>
        <span className="text-zinc-700 text-lg font-light">/</span>
        <span className="text-[12px] text-zinc-400 font-medium whitespace-nowrap">Visual Terminal Workspace</span>
      </div>

      {/* Center: Git Context Flow */}
      <div className="flex items-center space-x-3 bg-zinc-800/30 px-4 py-1.5 rounded-sm border border-white/5 hover:border-zinc-700 transition-colors cursor-pointer group">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span className="text-[13px] font-medium text-zinc-200 group-hover:text-white transition-colors">feat/auth-flow</span>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-zinc-400"></span>
          <span className="text-[13px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">origin/main</span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-3 justify-end">
        <button className="p-2 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
          <Search className="w-4 h-4" />
        </button>
        <button className="flex items-center space-x-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[12px] font-medium rounded-sm border border-white/5 transition-colors">
          <GitPullRequest className="w-3.5 h-3.5" />
          <span>Open PR</span>
        </button>
        <div className="h-4 w-[1px] bg-zinc-800 mx-2"></div>
        <button className="p-2 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full border-2 border-zinc-900"></span>
        </button>
        <button className="p-2 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors">
          <Archive className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default Header;