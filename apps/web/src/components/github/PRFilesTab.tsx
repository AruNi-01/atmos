"use client";

import React, { useMemo, useState } from 'react';
import { PatchDiff, Virtualizer } from '@pierre/diffs/react';
import { useTheme } from 'next-themes';
import { Avatar, AvatarImage, AvatarFallback, Skeleton, getFileIconProps } from '@workspace/ui';
import { MessageSquare, Plus, Minus, ChevronRight, ChevronDown } from 'lucide-react';
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
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-background my-1 mx-2 text-[12px]">
      <div className="bg-muted/30 px-3 py-1.5 border-b border-border/30 text-[10px] text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="size-3" />
        {first?.line != null ? `Line ${first.line}` : 'Comment'}
      </div>
      {thread.map((c, i) => (
        <div key={c.id ?? i} className="px-3 py-2 border-b border-border/20 last:border-0">
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="size-4 border border-border/50">
              <AvatarImage src={c.user?.avatar_url ?? `https://github.com/${c.user?.login}.png?size=32`} />
              <AvatarFallback className="text-[6px]">{c.user?.login?.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-foreground/90">{c.user?.login}</span>
            {c.created_at && (
              <span className="text-[10px] text-muted-foreground/60 ml-auto">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </span>
            )}
          </div>
          <MarkdownRenderer className="prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed">
            {c.body ?? ''}
          </MarkdownRenderer>
        </div>
      ))}
    </div>
  );
}

function FileDiffItem({
  file,
  threads,
  options,
  defaultExpanded = false,
}: {
  file: PrFile;
  threads: ReviewComment[][];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const fileName = file.filename.split('/').pop() ?? file.filename;

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden mb-2">
      {/* File header */}
      <button
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left border-b border-border/30"
        onClick={() => setExpanded(v => !v)}
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
            />
          ) : (
            <div className="px-4 py-3 text-[11px] text-muted-foreground italic">
              {file.status === 'renamed' ? 'File renamed' : file.status === 'added' ? 'New file' : file.status === 'removed' ? 'File deleted' : 'No diff available (file too large)'}
            </div>
          )}
          {threads.map((thread, i) => (
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
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const diffOptions = useMemo(() => ({
    theme: (resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light') as 'pierre-dark' | 'pierre-light',
    diffStyle: 'unified' as const,
    overflow: 'wrap' as const,
    disableFileHeader: true,
  }), [resolvedTheme]);

  const commentsByPath = useMemo(() => groupCommentsByPath(reviewComments), [reviewComments]);

  const treeItems = useMemo(() => files.map(f => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
  })), [files]);

  const handleSelect = (path: string) => {
    setSelectedPath(path);
    const el = scrollContainerRef.current?.querySelector(`#pr-diff-${CSS.escape(path)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      <div className="flex h-full min-h-0">
        {/* File tree sidebar */}
        <div className="w-56 shrink-0 border-r border-border/40 overflow-y-auto no-scrollbar py-1">
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
        </div>

        {/* Diff area */}
        <div ref={scrollContainerRef} className="flex-1 min-w-0 overflow-y-auto no-scrollbar p-2">
          <Virtualizer>
            {files.map((file, idx) => (
              <div key={file.filename} id={`pr-diff-${file.filename}`}>
                <FileDiffItem
                  file={file}
                  threads={commentsByPath.get(file.filename) ?? []}
                  options={diffOptions}
                  defaultExpanded={idx < 3}
                />
              </div>
            ))}
          </Virtualizer>
        </div>
      </div>
  );
}
