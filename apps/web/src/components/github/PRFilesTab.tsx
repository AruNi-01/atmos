"use client";

import React, { useMemo, useState } from 'react';
import { PatchDiff, Virtualizer } from '@pierre/diffs/react';
import { useTheme } from 'next-themes';
import { Avatar, AvatarImage, AvatarFallback, Skeleton, getFileIconProps, ScrollArea, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@workspace/ui';
import { Panel, PanelGroup, PanelResizeHandle } from '@workspace/ui';
import { MessageSquare, Plus, Minus, ChevronRight, ChevronDown, PanelLeftClose, PanelLeftOpen, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { DiffFileTree } from '@/components/diff/DiffFileTree';
import type { PrFile } from '@/hooks/use-github';

interface ReviewComment {
  id?: number;
  body?: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string;
  user?: { login?: string; avatar_url?: string };
  created_at?: string;
  in_reply_to_id?: number;
}

interface PRFilesTabProps {
  files: PrFile[];
  loading: boolean;
  reviewComments?: ReviewComment[];
  owner: string;
  repo: string;
}

// Group review comments by file path
function groupCommentsByPath(comments: ReviewComment[]): Map<string, ReviewComment[][]> {
  const threadMap = new Map<number, ReviewComment[]>();
  for (const c of comments) {
    const rootId = c.in_reply_to_id ?? c.id ?? 0;
    if (!threadMap.has(rootId)) threadMap.set(rootId, []);
    threadMap.get(rootId)!.push(c);
  }
  const byPath = new Map<string, ReviewComment[][]>();
  for (const thread of threadMap.values()) {
    const path = thread[0]?.path ?? '';
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path)!.push(thread);
  }
  return byPath;
}

function FileCommentThread({ thread }: { thread: ReviewComment[] }) {
  const first = thread[0];
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-background my-1 mx-2 text-[12px]" style={{ contain: 'layout' }}>
      <button
        className="bg-muted/30 px-3 py-1.5 border-b border-border/30 text-[10px] text-muted-foreground flex items-center gap-1.5 w-full text-left group cursor-pointer"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="relative size-3 shrink-0">
          <MessageSquare className="absolute inset-0 size-3 transition-opacity duration-150 group-hover:opacity-0" />
          <ChevronRight className={cn("absolute inset-0 size-3 opacity-0 transition-all duration-150 group-hover:opacity-100", !collapsed && "rotate-90")} />
        </div>
        {first?.line != null ? `Line ${first.line}` : 'Comment'}
      </button>
      {!collapsed && (
        <div className="overflow-x-hidden">
          {thread.map((c, i) => (
            <div key={c.id ?? i} className="px-3 py-2 border-b border-border/20 last:border-0 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                <Avatar className="size-4 border border-border/50 shrink-0">
                  <AvatarImage src={c.user?.avatar_url ?? `https://github.com/${c.user?.login}.png?size=32`} />
                  <AvatarFallback className="text-[6px]">{c.user?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="font-semibold text-foreground/90 truncate">{c.user?.login}</span>
                {c.created_at && (
                  <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              <div className="overflow-hidden" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed [&_pre]:overflow-x-auto [&_code]:break-all">
                  {c.body ?? ''}
                </MarkdownRenderer>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FileDiffItem({
  file,
  threads,
  options,
  expanded,
  onToggle,
}: {
  file: PrFile;
  threads: ReviewComment[][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  const fileName = file.filename.split('/').pop() ?? file.filename;

  // Split threads: line-specific vs file-level
  const lineThreads = threads.filter(t => t[0]?.line != null || t[0]?.original_line != null);
  const fileThreads = threads.filter(t => t[0]?.line == null && t[0]?.original_line == null);

  // Build lineAnnotations for PatchDiff
  const lineAnnotations = lineThreads.map((thread, i) => {
    const first = thread[0];
    const lineNumber = first?.line ?? first?.original_line ?? 1;
    const side = first?.side === 'LEFT' ? 'deletions' : 'additions';
    return { side: side as 'deletions' | 'additions', lineNumber, metadata: i };
  });

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden mb-2">
      {/* File header */}
      <button
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left border-b border-border/30"
        onClick={() => onToggle()}
      >
        {expanded ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
        <img {...getFileIconProps({ name: fileName, isDir: false })} className="size-4 shrink-0" />
        <span className="text-[12px] font-mono text-foreground/80 truncate flex-1">{file.filename}</span>
        <span className="text-[10px] text-emerald-500 font-mono shrink-0 flex items-center gap-0.5">
          <Plus className="size-3" />{file.additions}
        </span>
        <span className="text-[10px] text-red-500 font-mono shrink-0 flex items-center gap-0.5">
          <Minus className="size-3" />{file.deletions}
        </span>
        {threads.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <MessageSquare className="size-3" />{threads.length}
          </span>
        )}
      </button>

      {expanded && (
        <div>
          {file.patch ? (
            <PatchDiff
              patch={`--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`}
              options={options}
              lineAnnotations={lineAnnotations}
              renderAnnotation={(annotation) => {
                const thread = lineThreads[annotation.metadata as number];
                if (!thread) return null;
                return <FileCommentThread thread={thread} />;
              }}
            />
          ) : (
            <div className="px-4 py-3 text-[11px] text-muted-foreground italic">
              {file.status === 'renamed' ? 'File renamed' : file.status === 'added' ? 'New file' : file.status === 'removed' ? 'File deleted' : 'No diff available (file too large)'}
            </div>
          )}
          {/* File-level comments (no line info) at the bottom */}
          {fileThreads.map((thread, i) => (
            <FileCommentThread key={i} thread={thread} />
          ))}
        </div>
      )}
    </div>
  );
}

// Simple file tree node
export function PRFilesTab({ files, loading, reviewComments = [], owner, repo }: PRFilesTabProps) {
  const { resolvedTheme } = useTheme();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [treeVisible, setTreeVisible] = useState(true);
  const [diffStyle, setDiffStyle] = useState<'unified' | 'split'>('unified');
  const wordWrap = true;
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());

  const diffOptions = useMemo(() => ({
    theme: (resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light') as 'pierre-dark' | 'pierre-light',
    diffStyle: diffStyle as 'unified' | 'split',
    overflow: (wordWrap ? 'wrap' : 'scroll') as 'wrap' | 'scroll',
    disableFileHeader: true,
  }), [resolvedTheme, diffStyle, wordWrap]);

  const totalStats = useMemo(() => ({
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
    changed: files.length,
  }), [files]);

  const commentsByPath = useMemo(() => groupCommentsByPath(reviewComments), [reviewComments]);

  React.useEffect(() => {
    setExpandedFiles(new Set(files.slice(0, 3).map(f => f.filename)));
  }, [files]);

  const treeItems = useMemo(() => files.map(f => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
  })), [files]);

  const handleSelect = (path: string) => {
    setSelectedPath(path);
    setExpandedFiles(prev => { const next = new Set(prev); next.add(path); return next; });
    // Scroll after a tick to allow expansion to render
    setTimeout(() => {
      const el = scrollContainerRef.current?.querySelector(`#pr-diff-${CSS.escape(path)}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  if (loading) {
    return (
      <div className="flex gap-3 h-full">
        <div className="w-56 shrink-0 border-r border-border/40 p-2 flex flex-col gap-1">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-5 rounded" style={{ width: `${50 + (i % 4) * 12}%` }} />)}
        </div>
        <div className="flex-1 p-2 flex flex-col gap-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40 shrink-0">
        <button
          className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          onClick={() => setTreeVisible(v => !v)}
          title={treeVisible ? 'Hide file tree' : 'Show file tree'}
        >
          {treeVisible ? <PanelLeftClose className="size-3.5" /> : <PanelLeftOpen className="size-3.5" />}
        </button>

        <div className="flex-1" />

        {/* Stats */}
        {files.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] font-mono font-medium">
            <span className="text-emerald-500">+{totalStats.additions}</span>
            <span className="text-red-500">-{totalStats.deletions}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => {
                const filled = Math.round((totalStats.changed / Math.max(totalStats.changed, 1)) * 5);
                return (
                  <div
                    key={i}
                    className={cn("size-2.5 rounded-sm", i < filled ? "bg-emerald-500" : "bg-muted-foreground/20")}
                  />
                );
              })}
            </div>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center size-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="View options"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setDiffStyle(s => s === 'unified' ? 'split' : 'unified')} className="text-xs">
              {diffStyle === 'unified' ? 'Split view' : 'Unified view'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PanelGroup direction="horizontal" className="flex-1 min-h-0">
        {treeVisible && (
        <Panel defaultSize={20} minSize={12} maxSize={40}>
          <ScrollArea className="h-full py-1">
          <DiffFileTree
            items={treeItems}
            selectedPath={selectedPath ?? undefined}
            ariaLabel="PR changed files"
            renderFileInlineDecoration={(item) => {
              const count = commentsByPath.get(item.path)?.length ?? 0;
              if (!count) return null;
              return (
                <span className="ml-1 flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0">
                  <MessageSquare className="size-3" />{count}
                </span>
              );
            }}
            onSelectFile={handleSelect}
          />
          </ScrollArea>
        </Panel>
        )}

        {treeVisible && <PanelResizeHandle className="w-px bg-border/40 hover:bg-primary/40 transition-colors" />}

        <Panel>
        <div className="h-full overflow-auto">
        <div ref={scrollContainerRef} className="p-2 pb-20 min-w-0">
          <Virtualizer>
            {files.map((file) => (
              <div key={file.filename} id={`pr-diff-${file.filename}`}>
                <FileDiffItem
                  file={file}
                  threads={commentsByPath.get(file.filename) ?? []}
                  options={diffOptions}
                  expanded={expandedFiles.has(file.filename)}
                  onToggle={() => setExpandedFiles(prev => {
                    const next = new Set(prev);
                    if (next.has(file.filename)) next.delete(file.filename); else next.add(file.filename);
                    return next;
                  })}
                />
              </div>
            ))}
          </Virtualizer>
        </div>
        </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
