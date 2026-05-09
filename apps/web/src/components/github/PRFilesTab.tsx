"use client";

import React, { useMemo, useState } from 'react';
import { PatchDiff, Virtualizer } from '@pierre/diffs/react';
import { useTheme } from 'next-themes';
import { getFileIconProps } from '@workspace/ui';
import { Avatar, AvatarImage, AvatarFallback, Skeleton } from '@workspace/ui';
import { ChevronRight, ChevronDown, MessageSquare, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
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
interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: PrFile;
  commentCount: number;
}

function buildTree(files: PrFile[], commentsByPath: Map<string, ReviewComment[][]>): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  for (const file of files) {
    const parts = file.filename.split('/');
    let current = root;
    let pathSoFar = '';

    for (let i = 0; i < parts.length - 1; i++) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${parts[i]}` : parts[i];
      if (!dirMap.has(pathSoFar)) {
        const node: TreeNode = { name: parts[i], path: pathSoFar, isDir: true, children: [], commentCount: 0 };
        dirMap.set(pathSoFar, node);
        current.push(node);
      }
      current = dirMap.get(pathSoFar)!.children;
    }

    const threads = commentsByPath.get(file.filename) ?? [];
    current.push({
      name: parts[parts.length - 1],
      path: file.filename,
      isDir: false,
      children: [],
      file,
      commentCount: threads.length,
    });
  }

  // Propagate comment counts up
  function propagate(nodes: TreeNode[]): number {
    let total = 0;
    for (const n of nodes) {
      if (n.isDir) {
        n.commentCount = propagate(n.children);
      }
      total += n.commentCount;
    }
    return total;
  }
  propagate(root);

  // Compact single-child dir chains (e.g. "apps" > "web" > "src" → "apps/web/src")
  function compact(nodes: TreeNode[]): TreeNode[] {
    return nodes.map(node => {
      if (!node.isDir) return node;
      node.children = compact(node.children);
      while (node.children.length === 1 && node.children[0].isDir) {
        const child = node.children[0];
        node.name = `${node.name}/${child.name}`;
        node.path = child.path;
        node.children = child.children;
        node.commentCount = child.commentCount;
      }
      return node;
    });
  }

  return compact(root);
}

function TreeNodeItem({
  node,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  node: TreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-muted/40 transition-colors text-left text-[12px] text-muted-foreground"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => setOpen(v => !v)}
        >
          {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
          <img {...getFileIconProps({ name: node.name, isDir: true })} className="size-4 shrink-0" />
          <span className="truncate">{node.name}</span>
          {node.commentCount > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-0.5 shrink-0">
              <MessageSquare className="size-2.5" />{node.commentCount}
            </span>
          )}
        </button>
        {open && node.children.map(child => (
          <TreeNodeItem key={child.path} node={child} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <button
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1 transition-colors text-left text-[12px]",
        isSelected ? "bg-muted text-foreground" : "hover:bg-muted/40 text-muted-foreground hover:text-foreground"
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      onClick={() => onSelect(node.path)}
    >
      <img {...getFileIconProps({ name: node.name, isDir: false })} className="size-4 shrink-0" />
      <span className="truncate flex-1">{node.name}</span>
      {node.commentCount > 0 && (
        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 shrink-0">
          <MessageSquare className="size-2.5" />{node.commentCount}
        </span>
      )}
    </button>
  );
}

export function PRFilesTab({ files, loading, reviewComments = [], owner, repo }: PRFilesTabProps) {
  const { resolvedTheme } = useTheme();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const isDark = resolvedTheme === 'dark' || (!resolvedTheme && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const diffOptions = useMemo(() => ({
    theme: (resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light') as 'pierre-dark' | 'pierre-light',
    diffStyle: 'unified' as const,
    overflow: 'wrap' as const,
    disableFileHeader: true,
  }), [resolvedTheme]);

  const commentsByPath = useMemo(() => groupCommentsByPath(reviewComments), [reviewComments]);
  const tree = useMemo(() => buildTree(files, commentsByPath), [files, commentsByPath]);

  const handleSelect = (path: string) => {
    setSelectedPath(path);
    const id = `pr-diff-${CSS.escape(path)}`;
    const el = scrollContainerRef.current?.querySelector(`#${id}`);
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
          {tree.map(node => (
            <TreeNodeItem key={node.path} node={node} selectedPath={selectedPath} onSelect={handleSelect} />
          ))}
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
