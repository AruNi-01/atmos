"use client";

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { TerminalLine } from '@/types/types';
import { Terminal, X, Code, GitCompare, Circle, Loader2, Tabs, TabsList, TabsTab, TabsPanel } from '@workspace/ui';
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

    const activeValue = activeFilePath || 'terminal';

    return (
        <main className="flex-1 flex flex-col">
            <Tabs
                value={activeValue}
                onValueChange={(val) => {
                    if (val !== 'terminal') {
                        setActiveFile(val);
                    }
                }}
                className="flex-1 flex flex-col gap-0"
            >
                {/* Top Tab Bar */}
                <TabsList
                    variant="underline"
                    className="h-10 w-full justify-start rounded-none border-b border-sidebar-border px-0 bg-transparent"
                >
                    {/* Terminal Tab */}
                    <TabsTab
                        value="terminal"
                        className="h-full px-4 rounded-sm data-active:bg-background data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 justify-start"
                    >
                        <Terminal className="size-3.5" />
                        <span className="text-[13px] font-medium text-pretty">Terminal</span>
                    </TabsTab>

                    {/* Open File Tabs */}
                    {openFiles.map((file) => (
                        <TabsTab
                            key={file.path}
                            value={file.path}
                            className="h-full px-2.5 rounded-sm data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 group grow-0 justify-start"
                        >
                            <Code className="size-3.5 shrink-0" />
                            <span className="text-[13px] font-medium whitespace-nowrap">
                                {file.name}
                            </span>
                            {/* Dirty indicator */}
                            {file.isDirty && (
                                <Circle className="size-1.5 fill-current text-muted-foreground shrink-0" />
                            )}
                            {/* Close button */}
                            <button
                                aria-label="Close tab"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeFile(file.path);
                                }}
                                className="ml-1 opacity-0 group-hover:opacity-100 size-5 flex items-center justify-center hover:bg-muted-foreground/20 rounded-sm cursor-pointer transition-all ease-out duration-200"
                            >
                                <X className="size-3" />
                            </button>
                        </TabsTab>
                    ))}
                </TabsList>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col relative">
                    <TabsPanel value="terminal" className="h-full">
                        {/* Terminal View */}
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
                    </TabsPanel>

                    {openFiles.map(file => (
                        <TabsPanel key={file.path} value={file.path} className="h-full">
                            <MonacoEditor
                                file={file}
                                className="flex-1"
                            />
                        </TabsPanel>
                    ))}
                </div>
            </Tabs>
        </main>
    );
};

export default CenterStage;
