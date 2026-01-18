"use client";

import React from 'react';
import { FileChange } from '@/types/types';
import { Play, TerminalSquare, FileCode, Check, RefreshCw } from 'lucide-react';
import { cn } from "@/lib/utils";

interface RightSidebarProps {
  changes: FileChange[];
}

const RightSidebar: React.FC<RightSidebarProps> = ({ changes }) => {
  return (
    <aside className="flex-shrink-0 flex flex-col border-l border-white/5 h-full">

      {/* Changes Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-white/5">
        <span className="text-xs font-semibold text-zinc-400 uppercase text-balance">Changes</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-zinc-800 text-zinc-400 font-mono tabular-nums">
          {changes.length}
        </span>
      </div>

      {/* Commit Actions (Moved to Top) */}
      <div className="flex flex-col p-4 border-b border-white/5 gap-3">
        <input type="text" placeholder="Commit message" className="w-full p-2 border border-white/5 rounded-sm bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all ease-out duration-200" />
        <button className="w-full flex items-center justify-center space-x-2 py-2 bg-emerald-900/20 hover:bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 rounded-sm transition-all ease-out duration-200">
          <Check className="size-4" />
          <span className="text-[13px] font-medium text-pretty">Commit</span>
        </button>
      </div>

      {/* Changes List */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2">
        {changes.map(change => (
          <div
            key={change.id}
            className="group flex items-center justify-between px-3 py-2 rounded-sm hover:bg-zinc-800/40 cursor-pointer transition-colors ease-out duration-200 mb-0.5"
          >
            <div className="flex items-center min-w-0">
              <FileCode className={cn(
                "size-3.5 mr-2.5 flex-shrink-0",
                change.status === 'M' ? 'text-yellow-500/70' :
                  change.status === 'A' ? 'text-emerald-500/70' : 'text-red-500/70'
              )} />
              <span className="text-[13px] text-zinc-400 group-hover:text-zinc-200 truncate font-medium text-pretty">
                {change.path.split('/').pop()}
              </span>
              <span className="text-[11px] text-zinc-600 ml-1.5 truncate flex-shrink-0 text-pretty">
                {change.path.split('/').slice(0, -1).join('/')}/
              </span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] font-mono opacity-0 group-hover:opacity-100 transition-opacity ease-out duration-200 tabular-nums">
              {change.additions > 0 && <span className="text-emerald-500">+{change.additions}</span>}
              {change.deletions > 0 && <span className="text-red-500">-{change.deletions}</span>}
            </div>
          </div>
        ))}

        {/* Placeholder for empty space to push buttons down if list is short */}
        <div className="h-4"></div>
      </div>

      {/* Action Pad */}
      <div className="p-4 border-t border-white/5">
        <div className="text-xs font-medium text-zinc-500 mb-3 uppercase text-balance">Quick Actions</div>
        <div className="grid grid-cols-2 gap-3">
          <button className="flex flex-col items-center justify-center p-3 rounded-sm border border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all ease-out duration-200 group">
            <Play className="size-5 text-emerald-500/80 mb-2 group-hover:scale-110 transition-transform ease-out duration-200" />
            <span className="text-xs font-medium text-zinc-300 text-pretty">Run Dev</span>
          </button>
          <button className="flex flex-col items-center justify-center p-3 rounded-sm border border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all ease-out duration-200 group">
            <TerminalSquare className="size-5 text-zinc-400 mb-2 group-hover:text-zinc-200 transition-colors ease-out duration-200" />
            <span className="text-xs font-medium text-zinc-300 text-pretty">New Term</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RightSidebar;