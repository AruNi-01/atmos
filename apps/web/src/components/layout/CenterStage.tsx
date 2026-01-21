"use client";

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { TerminalLine } from '@/types/types';
import { Terminal, X, Code, GitCompare, Circle, Loader2 } from '@workspace/ui';
import { cn } from "@/lib/utils";
import { useEditorStore } from '@/hooks/use-editor-store';

// Dynamic import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(
    () => import('@/components/editor/MonacoEditor'),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
        ),
    }
);

interface CenterStageProps {
    logs: TerminalLine[];
}

const CenterStage: React.FC<CenterStageProps> = ({ logs }) => {
    const {
        openFiles,
        activeFilePath,
        setActiveFile,
        closeFile,
        getActiveFile,
    } = useEditorStore();

    const activeFile = getActiveFile();

    // Check if we should show terminal (when no files are open)
    const showTerminal = openFiles.length === 0;

    return (
        <main className="flex-1 flex flex-col">
            {/* Top Tab Bar */}
            <div className="flex items-center h-10 border-b border-sidebar-border overflow-x-auto no-scrollbar">
                {/* Terminal Tab (always visible) */}
                <button
                    onClick={() => {
                        // When clicking terminal, we keep the tab but don't change file selection
                    }}
                    className={cn(
                        "flex items-center space-x-2 px-4 h-full border-r border-sidebar-border hover:bg-muted/50 transition-colors ease-out duration-200 group relative shrink-0",
                        showTerminal ? 'bg-background text-foreground' : 'text-muted-foreground'
                    )}
                >
                    <Terminal className="size-3.5" />
                    <span className="text-[13px] font-medium text-pretty">Terminal</span>
                    {showTerminal && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500"></div>}
                </button>

                {/* Open File Tabs */}
                {openFiles.map((file) => {
                    const isActive = file.path === activeFilePath;

                    return (
                        <div
                            key={file.path}
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveFile(file.path)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') setActiveFile(file.path);
                            }}
                            className={cn(
                                "flex items-center space-x-2 px-4 h-full border-r border-sidebar-border hover:bg-muted/50 transition-colors ease-out duration-200 group relative cursor-pointer shrink-0",
                                isActive ? 'bg-background text-foreground' : 'text-muted-foreground'
                            )}
                        >
                            <Code className="size-3.5" />
                            <span className="text-[13px] font-medium text-pretty max-w-[150px] truncate">
                                {file.name}
                            </span>
                            {/* Dirty indicator */}
                            {file.isDirty && (
                                <Circle className="size-2 fill-current text-muted-foreground" />
                            )}
                            {/* Close button */}
                            <button
                                aria-label="Close tab"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeFile(file.path);
                                }}
                                className="ml-1 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-accent rounded transition-opacity ease-out duration-200"
                            >
                                <X className="size-3" />
                            </button>
                            {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500"></div>}
                        </div>
                    );
                })}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col relative">
                {/* Terminal View (when no files are open) */}
                {showTerminal && (
                    <div className="flex-1 flex flex-col h-full bg-background">
                        {/* Pane 1 */}
                        <div className="flex-1 flex flex-col border-b border-sidebar-border">
                            <div className="h-8 flex items-center justify-between px-3 bg-muted/30">
                                <span className="text-[11px] text-muted-foreground font-medium tabular-nums text-pretty">
                                    Local: 3000 (Server)
                                </span>
                                <div className="flex space-x-2">
                                    <div className="size-2 rounded-full bg-emerald-500"></div>
                                </div>
                            </div>
                            <div className="flex-1 p-4 font-mono text-[13px] overflow-y-auto no-scrollbar">
                                {logs.map((log) => (
                                    <div key={log.id} className="mb-1 leading-relaxed break-all">
                                        <span className={cn(`
                                            ${log.type === 'command' ? 'text-muted-foreground' : ''}
                                            ${log.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : ''}
                                            ${log.type === 'error' ? 'text-rose-600 dark:text-rose-400' : ''}
                                            ${log.type === 'info' ? 'text-blue-600 dark:text-blue-300' : ''}
                                        `)}>
                                            {log.content}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Pane 2 */}
                        <div className="flex-1 flex flex-col">
                            <div className="h-8 flex items-center justify-between px-3 bg-muted/30">
                                <span className="text-[11px] text-muted-foreground font-medium text-pretty">
                                    Build: Watch Mode
                                </span>
                            </div>
                            <div className="flex-1 p-4 font-mono text-[13px] text-muted-foreground overflow-y-auto no-scrollbar">
                                <div className="text-pretty"> build started...</div>
                                <div className="text-emerald-600 dark:text-emerald-500 tabular-nums text-pretty">
                                    build completed in 420ms
                                </div>
                                <div className="flex items-center mt-2 animate-pulse">
                                    <span className="text-muted-foreground mr-2">➜</span>
                                    <span className="text-muted-foreground">_</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Monaco Editor (when a file is open) */}
                {activeFile && (
                    <MonacoEditor
                        file={activeFile}
                        className="flex-1"
                    />
                )}
            </div>
        </main>
    );
};

export default CenterStage;
