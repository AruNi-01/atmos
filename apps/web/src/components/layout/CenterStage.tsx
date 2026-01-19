"use client";

import React, { useState } from 'react';
import { TerminalLine } from '@/types/types';
import { MOCK_CODE, MOCK_DIFF } from '@/constants';
import { Terminal, X, Monitor, Code, GitCompare } from '@workspace/ui';
import { cn } from "@/lib/utils";

interface CenterStageProps {
    logs: TerminalLine[];
}

type TabType = 'terminal' | 'editor' | 'diff';

const CenterStage: React.FC<CenterStageProps> = ({ logs }) => {
    const [activeTab, setActiveTab] = useState<TabType>('editor');

    // Helper to render code content safely
    const renderCode = (code: string) => {
        return (
            <code dangerouslySetInnerHTML={{
                __html: code
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/import|from|export|const|return|interface|type/g, '<span class="text-purple-400">$&</span>')
                    .replace(/'[^']*'/g, '<span class="text-emerald-400">$&</span>')
                    .replace(/\/\/.*/g, '<span class="text-zinc-500">$&</span>')
                    // Simple highlighter for diff symbols
                    .replace(/^\+.*/gm, '<span class="text-emerald-400 bg-emerald-900/20 block">$&</span>')
                    .replace(/^\-.*/gm, '<span class="text-red-400 bg-red-900/20 block">$&</span>')
            }} />
        );
    };

    return (
        <main className="flex-1 flex flex-col">

            {/* Top Tab Bar */}
            <div className="flex items-center h-10 border-b border-zinc-800">
                {/* Tab 1: Terminal */}
                <button
                    onClick={() => setActiveTab('terminal')}
                    className={cn(
                        "flex items-center space-x-2 px-4 h-full border-r border-zinc-800 hover:bg-zinc-800/50 transition-colors ease-out duration-200 group relative",
                        activeTab === 'terminal' ? 'bg-zinc-900 text-zinc-200' : 'text-zinc-500'
                    )}
                >
                    <Terminal className="size-3.5" />
                    <span className="text-[13px] font-medium text-pretty">Terminal</span>
                    {activeTab === 'terminal' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500"></div>}
                </button>

                {/* Tab 2: Editor */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveTab('editor')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab('editor'); }}
                    className={cn(
                        "flex items-center space-x-2 px-4 h-full border-r border-zinc-800 hover:bg-zinc-800/50 transition-colors ease-out duration-200 group relative cursor-pointer",
                        activeTab === 'editor' ? 'bg-zinc-900 text-zinc-200' : 'text-zinc-500'
                    )}
                >
                    <Code className="size-3.5" />
                    <span className="text-[13px] font-medium text-pretty">Button.tsx</span>
                    <button
                        aria-label="Close tab"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-2 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-700 rounded transition-opacity ease-out duration-200"
                    >
                        <X className="size-3" />
                    </button>
                    {activeTab === 'editor' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500"></div>}
                </div>

                {/* Tab 3: Diff */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveTab('diff')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab('diff'); }}
                    className={cn(
                        "flex items-center space-x-2 px-4 h-full border-r border-zinc-800 hover:bg-zinc-800/50 transition-colors ease-out duration-200 group relative cursor-pointer",
                        activeTab === 'diff' ? 'bg-zinc-900 text-zinc-200' : 'text-zinc-500'
                    )}
                >
                    <GitCompare className="size-3.5" />
                    <span className="text-[13px] font-medium text-pretty">Header.tsx (Diff)</span>
                    <button
                        aria-label="Close tab"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-2 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-700 rounded transition-opacity ease-out duration-200"
                    >
                        <X className="size-3" />
                    </button>
                    {activeTab === 'diff' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500"></div>}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative">

                {/* VIEW 1: Terminal Panes */}
                {activeTab === 'terminal' && (
                    <div className="flex-1 flex flex-col h-full bg-[#0c0c0e]">
                        {/* Pane 1 */}
                        <div className="flex-1 flex flex-col border-b border-zinc-800">
                            <div className="h-8 flex items-center justify-between px-3 bg-zinc-800/20">
                                <span className="text-[11px] text-zinc-400 font-medium tabular-nums text-pretty">Local: 3000 (Server)</span>
                                <div className="flex space-x-2">
                                    <div className="size-2 rounded-full bg-emerald-500"></div>
                                </div>
                            </div>
                            <div className="flex-1 p-4 font-mono text-[13px] overflow-y-auto no-scrollbar">
                                {logs.map((log) => (
                                    <div key={log.id} className="mb-1 leading-relaxed break-all">
                                        <span className={cn(`
                                    ${log.type === 'command' ? 'text-zinc-500' : ''}
                                    ${log.type === 'success' ? 'text-emerald-400' : ''}
                                    ${log.type === 'error' ? 'text-rose-400' : ''}
                                    ${log.type === 'info' ? 'text-blue-300' : ''}
                                `)}>
                                            {log.content}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Pane 2 */}
                        <div className="flex-1 flex flex-col">
                            <div className="h-8 flex items-center justify-between px-3 bg-zinc-800/20">
                                <span className="text-[11px] text-zinc-400 font-medium text-pretty">Build: Watch Mode</span>
                            </div>
                            <div className="flex-1 p-4 font-mono text-[13px] text-zinc-400 overflow-y-auto no-scrollbar">
                                <div className="text-pretty"> build started...</div>
                                <div className="text-emerald-500 tabular-nums text-pretty"> build completed in 420ms</div>
                                <div className="flex items-center mt-2 animate-pulse">
                                    <span className="text-zinc-500 mr-2">➜</span>
                                    <span className="text-zinc-500">_</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW 2: File Editor */}
                {activeTab === 'editor' && (
                    <div className="flex-1 flex flex-col h-full bg-zinc-900">
                        <div className="flex-1 overflow-y-auto no-scrollbar relative">
                            <div className="flex min-h-full">
                                {/* Line Numbers */}
                                <div className="w-10 flex-shrink-0 flex flex-col items-end pr-3 pt-4 bg-zinc-900/50 text-right select-none border-r border-zinc-800/30">
                                    {MOCK_CODE.split('\n').map((_, i) => (
                                        <span key={i} className="text-[11px] font-mono leading-[1.6rem] text-zinc-700 font-medium tabular-nums">
                                            {i + 1}
                                        </span>
                                    ))}
                                </div>
                                {/* Code Content */}
                                <div className="flex-1 pl-3 pt-4 font-mono text-[13px] leading-[1.6rem] text-zinc-300">
                                    <pre className="whitespace-pre-wrap">
                                        {renderCode(MOCK_CODE)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW 3: Diff View */}
                {activeTab === 'diff' && (
                    <div className="flex-1 flex flex-col h-full bg-zinc-900">
                        <div className="flex-1 overflow-y-auto no-scrollbar relative">
                            <div className="flex min-h-full">
                                {/* Line Numbers */}
                                <div className="w-10 flex-shrink-0 flex flex-col items-end pr-3 pt-4 bg-zinc-900/50 text-right select-none border-r border-zinc-800/30">
                                    {MOCK_DIFF.split('\n').map((_, i) => (
                                        <span key={i} className="text-[11px] font-mono leading-[1.6rem] text-zinc-700 font-medium tabular-nums">
                                            {i + 1}
                                        </span>
                                    ))}
                                </div>
                                <div className="flex-1 pl-3 pt-4 font-mono text-[13px] leading-[1.6rem] text-zinc-300">
                                    <pre className="whitespace-pre-wrap">
                                        {renderCode(MOCK_DIFF)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </main >
    );
};

export default CenterStage;