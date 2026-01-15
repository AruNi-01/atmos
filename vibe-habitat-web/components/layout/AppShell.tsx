"use client";

import React from 'react';
import { Sidebar } from './Sidebar';
import { Terminal } from '../terminal/Terminal';
import { Settings, Play, Folder, FileText } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';

const Frame = ({ children, className = '', stackedPanels }: { children: React.ReactNode; className?: string; stackedPanels?: boolean }) => (
   <div className={`bg-card/50 border border-border rounded-lg overflow-hidden ${className}`}>
      {children}
   </div>
);

const FramePanel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
   <div className={`flex flex-col ${className}`}>{children}</div>
);

const FrameHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
   <div className={`flex items-center h-9 px-3 border-b border-border ${className}`}>{children}</div>
);

const FrameTitle = ({ children }: { children: React.ReactNode }) => (
   <span className="text-foreground font-medium text-sm">{children}</span>
);

export function AppShell({ children }: { children: React.ReactNode }) {
   return (
      <div className="flex h-screen w-screen bg-background p-2 gap-2 text-foreground font-sans text-sm">
         {/* Level 1: Sidebar Frame */}
         <Frame className="w-64 shrink-0">
            <FrameHeader className="justify-between">
               <FrameTitle>VibeHabitat</FrameTitle>
               <div className="flex items-center gap-2">
                  <ModeToggle />
                  <Settings className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer" />
               </div>
            </FrameHeader>
            <FramePanel>
               <Sidebar />
            </FramePanel>
         </Frame>

         {/* Level 2: Main Content Frame */}
         <Frame className="flex-1">
            <FramePanel>
               {children}
            </FramePanel>
         </Frame>

         {/* Level 3: Right Sidebar - Container Frame */}
         <Frame stackedPanels className="w-80 shrink-0">
            {/* FramePanel 1: Files */}
            <FramePanel className="min-h-0">
               <FrameHeader className="gap-4">
                  <span className="text-foreground border-b-2 border-blue-500 h-full flex items-center px-1">Files</span>
                  <span className="text-muted-foreground hover:text-foreground cursor-pointer h-full flex items-center px-1">Changes</span>
               </FrameHeader>
               <FramePanel className="p-2 overflow-auto">
                  <div className="space-y-1">
                     <div className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded text-zinc-400">
                        <Folder className="w-4 h-4 text-blue-400" />
                        <span>components</span>
                     </div>
                     <div className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded text-zinc-400 pl-6">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <span>layout</span>
                     </div>
                     <div className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded text-zinc-300 pl-10">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span>AppShell.tsx</span>
                     </div>
                     <div className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded text-zinc-400 pl-6">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <span>terminal</span>
                     </div>
                  </div>
               </FramePanel>
            </FramePanel>

            {/* FramePanel 2: Workspace Script */}
            <FramePanel className="min-h-0 shrink-0">
               <FrameHeader className="h-8 px-3 bg-muted/80">
                  <span className="flex items-center gap-2 text-xs">
                     <Play className="w-3 h-3 text-emerald-500" />
                     <span>Workspace Script</span>
                  </span>
               </FrameHeader>
               <FramePanel className="relative">
                  <Terminal id="mini-terminal" />
               </FramePanel>
            </FramePanel>
         </Frame>
      </div>
   );
}
