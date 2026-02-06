'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { MultiFileDiff } from '@pierre/diffs/react';
import type { FileContents, SelectedLineRange, Hunk, ContextContent, ChangeContent } from '@pierre/diffs';
import { parseDiffFromFile } from '@pierre/diffs';
import { gitApi } from '@/api/ws-api';
import { Loader2 } from '@workspace/ui';
import { useTheme } from 'next-themes';
import { useGitStore } from '@/hooks/use-git-store';
import { SelectionPopover } from '@/components/selection/SelectionPopover';
import type { SelectionInfo } from '@/lib/format-selection-for-ai';

interface DiffViewerProps {
  repoPath: string;
  filePath: string;
}

const SCROLLBAR_CSS = `
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.4);
  }
  ::-webkit-scrollbar-corner {
    background: transparent;
  }
`;

export const DiffViewer = ({ repoPath, filePath }: DiffViewerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oldFile, setOldFile] = useState<FileContents | null>(null);
  const [newFile, setNewFile] = useState<FileContents | null>(null);
  const [diffStyle, setDiffStyle] = useState<'split' | 'unified'>('split');
  const [wordWrap, setWordWrap] = useState(false);
  const [disableBackground, setDisableBackground] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipPaused, setTipPaused] = useState(false);
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { stagedFiles, unstagedFiles, untrackedFiles } = useGitStore();
  const diffStats = useMemo(() => {
    const allFiles = [...stagedFiles, ...unstagedFiles, ...untrackedFiles];
    const file = allFiles.find(f => f.path === filePath);
    return file ? { additions: file.additions, deletions: file.deletions } : null;
  }, [stagedFiles, unstagedFiles, untrackedFiles, filePath]);

  // Rotating tip timer: show file path 5s, then tip 5s (pauses on hover)
  useEffect(() => {
    if (tipPaused) return;
    const interval = setInterval(() => {
      setShowTip(prev => !prev);
    }, 5000);
    return () => clearInterval(interval);
  }, [tipPaused]);

  // Compute diff hunks for accurate line-type detection
  const diffMeta = useMemo(() => {
    if (!oldFile || !newFile) return null;
    try {
      return parseDiffFromFile(oldFile, newFile);
    } catch {
      return null;
    }
  }, [oldFile, newFile]);

  // Build a map: line number -> { type, correspondingLines } for each side
  type LineTypeInfo = { type: 'context' | 'addition' | 'deletion' | 'mixed'; oldLine?: number; newLine?: number };
  const lineTypeMap = useMemo(() => {
    const oldMap = new Map<number, LineTypeInfo>();
    const newMap = new Map<number, LineTypeInfo>();
    if (!diffMeta) return { oldMap, newMap };

    for (const hunk of diffMeta.hunks) {
      let oldLine = hunk.deletionStart;
      let newLine = hunk.additionStart;

      for (const content of hunk.hunkContent) {
        if (content.type === 'context') {
          for (const _line of content.lines) {
            const info: LineTypeInfo = { type: 'context', oldLine, newLine };
            oldMap.set(oldLine, info);
            newMap.set(newLine, info);
            oldLine++;
            newLine++;
          }
        } else {
          const change = content as ChangeContent;
          const hasBoth = change.deletions.length > 0 && change.additions.length > 0;
          const lineType = hasBoth ? 'mixed' : (change.deletions.length > 0 ? 'deletion' : 'addition');
          const delStart = oldLine;
          const addStart = newLine;
          for (let i = 0; i < change.deletions.length; i++) {
            oldMap.set(oldLine, { type: lineType, oldLine, newLine: addStart });
            oldLine++;
          }
          for (let i = 0; i < change.additions.length; i++) {
            newMap.set(newLine, { type: lineType, oldLine: delStart, newLine });
            newLine++;
          }
        }
      }
    }
    return { oldMap, newMap };
  }, [diffMeta]);

  // Selection popover state
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [isPopoverVisible, setIsPopoverVisible] = useState(false);
  const [isPopoverExpanded, setIsPopoverExpanded] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const dismissPopover = useCallback(() => {
    setIsPopoverVisible(false);
    setIsPopoverExpanded(false);
    setSelectionInfo(null);
  }, []);

  // Handle line selection from @pierre/diffs
  const handleLineSelectionEnd = useCallback((range: SelectedLineRange | null) => {
    if (!range || !containerRef.current) {
      return;
    }

    const startLine = Math.min(range.start, range.end);
    const endLine = Math.max(range.start, range.end);
    const side = range.side;
    const sourceContent = side === 'deletions' ? oldFile?.contents : newFile?.contents;

    let selectedText = '';
    if (sourceContent) {
      const lines = sourceContent.split('\n');
      selectedText = lines.slice(startLine - 1, endLine).join('\n');
    }

    const oldLines = oldFile?.contents?.split('\n') || [];
    const newLines = newFile?.contents?.split('\n') || [];
    const sideMap = side === 'deletions' ? lineTypeMap.oldMap : lineTypeMap.newMap;

    // Determine change type from hunk data
    const lineTypes = new Set<string>();
    for (let ln = startLine; ln <= endLine; ln++) {
      const info = sideMap.get(ln);
      lineTypes.add(info?.type || 'context');
    }

    let changeType: SelectionInfo['changeType'];
    let beforeText: string | undefined;
    let afterText: string | undefined;

    const hasMixed = lineTypes.has('mixed');
    const hasAddition = lineTypes.has('addition');
    const hasDeletion = lineTypes.has('deletion');
    const hasContext = lineTypes.has('context');
    const onlyContext = lineTypes.size === 1 && hasContext;
    const onlyPureAddition = !hasMixed && !hasDeletion && hasAddition;
    const onlyPureDeletion = !hasMixed && !hasAddition && hasDeletion;

    if (onlyContext) {
      changeType = 'context';
      beforeText = oldLines.slice(startLine - 1, endLine).join('\n');
      afterText = newLines.slice(startLine - 1, endLine).join('\n');
    } else if (onlyPureAddition) {
      changeType = 'addition';
      beforeText = undefined;
      afterText = newLines.slice(startLine - 1, endLine).join('\n');
    } else if (onlyPureDeletion) {
      changeType = 'deletion';
      beforeText = oldLines.slice(startLine - 1, endLine).join('\n');
      afterText = undefined;
    } else {
      // Mixed/modification - gather before/after from hunk mapping
      changeType = 'mixed';
      let minOtherLine = Infinity;
      let maxOtherLine = -Infinity;
      for (let ln = startLine; ln <= endLine; ln++) {
        const info = sideMap.get(ln);
        if (info) {
          const otherLine = side === 'deletions' ? info.newLine : info.oldLine;
          if (otherLine != null) {
            minOtherLine = Math.min(minOtherLine, otherLine);
            maxOtherLine = Math.max(maxOtherLine, otherLine);
          }
        }
      }
      if (side === 'deletions') {
        beforeText = oldLines.slice(startLine - 1, endLine).join('\n');
        afterText = minOtherLine <= maxOtherLine
          ? newLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
          : undefined;
      } else {
        afterText = newLines.slice(startLine - 1, endLine).join('\n');
        beforeText = minOtherLine <= maxOtherLine
          ? oldLines.slice(minOtherLine - 1, maxOtherLine).join('\n')
          : undefined;
      }
    }

    const info: SelectionInfo = {
      filePath: filePath,
      startLine,
      endLine,
      selectedText: selectedText || `Lines ${startLine}-${endLine}`,
      changeType,
      beforeText,
      afterText,
    };

    setSelectionInfo(info);

    // Position popover near the selection (relative to container for absolute positioning)
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const diffElement = container.querySelector('diffs-container');
    const shadowRoot = diffElement?.shadowRoot;

    let popX = containerRect.width / 2 - 75;
    let popY = 100;

    if (shadowRoot) {
      // In split view, query within the correct side container to avoid matching wrong panel
      const sideAttr = side === 'deletions' ? '[data-deletions]' : '[data-additions]';
      const sideContainer = shadowRoot.querySelector(sideAttr);
      const selectedLineEl = sideContainer
        ? sideContainer.querySelector(`[data-line="${endLine}"]`)
        : shadowRoot.querySelector(`[data-line="${endLine}"]`);
      if (selectedLineEl) {
        const lineRect = selectedLineEl.getBoundingClientRect();
        popX = Math.min(
          lineRect.left - containerRect.left + 50,
          containerRect.width - 180
        );
        popY = lineRect.bottom - containerRect.top + 8;
      }
    }

    setPopoverPosition({ x: popX, y: popY });
    setIsPopoverVisible(true);
    setIsPopoverExpanded(false);
  }, [filePath, oldFile, newFile, lineTypeMap]);

  // Dismiss on click outside or Escape
  useEffect(() => {
    if (!isPopoverVisible) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check for popover elements (including Portal-rendered content)
      if (
        popoverRef.current?.contains(target) || 
        target.closest('[data-selection-popover]') ||
        target.closest('[data-radix-popper-content-wrapper]') ||
        target.closest('[data-slot="popover-content"]')
      ) {
        return;
      }
      dismissPopover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissPopover();
      }
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPopoverVisible, dismissPopover]);

  useEffect(() => {
    const loadDiff = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const diff = await gitApi.getFileDiff(repoPath, filePath);
        const fileName = filePath.split('/').pop() || filePath;

        setOldFile({ name: fileName, contents: diff.old_content });
        setNewFile({ name: fileName, contents: diff.new_content });
      } catch (err) {
        console.error('Failed to load diff:', err);
        setError(err instanceof Error ? err.message : 'Failed to load diff');
      } finally {
        setIsLoading(false);
      }
    };

    loadDiff();
  }, [repoPath, filePath]);

  const diffOptions = useMemo(() => ({
    theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light' as const,
    diffStyle: diffStyle,
    disableBackground: disableBackground,
    disableFileHeader: true,
    overflow: wordWrap ? 'wrap' : 'scroll' as const,
    unsafeCSS: SCROLLBAR_CSS,
    enableLineSelection: true,
    onLineSelectionEnd: handleLineSelectionEnd,
  }), [resolvedTheme, diffStyle, disableBackground, wordWrap, handleLineSelectionEnd]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading diff</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!oldFile || !newFile) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-muted-foreground">No diff available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-sidebar-border bg-muted/30 shrink-0">
        <div
          className="relative h-5 flex-1 min-w-0 overflow-hidden mr-3"
          onMouseEnter={() => setTipPaused(true)}
          onMouseLeave={() => setTipPaused(false)}
        >
          <div
            className="absolute inset-x-0 h-full flex items-center gap-3 transition-all duration-500 ease-in-out"
            style={{
              transform: showTip ? 'translateY(-100%)' : 'translateY(0)',
              opacity: showTip ? 0 : 1,
            }}
          >
            <span className="text-sm font-medium text-foreground truncate">{filePath}</span>
            {diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) && (
              <span className="text-xs font-mono shrink-0">
                {diffStats.additions > 0 && (
                  <span className="text-green-500">+{diffStats.additions}</span>
                )}
                {diffStats.additions > 0 && diffStats.deletions > 0 && (
                  <span className="text-muted-foreground mx-1">/</span>
                )}
                {diffStats.deletions > 0 && (
                  <span className="text-red-500">-{diffStats.deletions}</span>
                )}
              </span>
            )}
          </div>
          <div
            className="absolute inset-x-0 h-full flex items-center transition-all duration-500 ease-in-out"
            style={{
              transform: showTip ? 'translateY(0)' : 'translateY(100%)',
              opacity: showTip ? 1 : 0,
            }}
          >
            <span className="text-xs text-muted-foreground truncate">
              Tips: Select line numbers to annotate changes and quickly send to AI Agent (⇧ Shift for multi-select)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className="relative px-3 py-1 text-xs font-medium border border-sidebar-border rounded-sm bg-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-all ease-out duration-200 overflow-hidden cursor-pointer"
          >
            <span 
              className="inline-block transition-all duration-300 ease-out"
              style={{ 
                transform: wordWrap ? 'translateY(-100%)' : 'translateY(0)',
                opacity: wordWrap ? 0 : 1,
              }}
            >
              Wrap
            </span>
            <span 
              className="absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out"
              style={{ 
                transform: wordWrap ? 'translateY(0)' : 'translateY(100%)',
                opacity: wordWrap ? 1 : 0,
              }}
            >
              Scroll
            </span>
          </button>

          <button
            onClick={() => setDiffStyle(diffStyle === 'split' ? 'unified' : 'split')}
            className="relative px-3 py-1 text-xs font-medium border border-sidebar-border rounded-sm bg-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-all ease-out duration-200 overflow-hidden cursor-pointer"
          >
            <span 
              className="inline-block transition-all duration-300 ease-out"
              style={{ 
                transform: diffStyle === 'unified' ? 'translateY(-100%)' : 'translateY(0)',
                opacity: diffStyle === 'unified' ? 0 : 1,
              }}
            >
              Unified
            </span>
            <span 
              className="absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out"
              style={{ 
                transform: diffStyle === 'unified' ? 'translateY(0)' : 'translateY(100%)',
                opacity: diffStyle === 'unified' ? 1 : 0,
              }}
            >
              Split
            </span>
          </button>

          <button
            onClick={() => setDisableBackground(!disableBackground)}
            className="relative px-3 py-1 text-xs font-medium border border-sidebar-border rounded-sm bg-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-all ease-out duration-200 overflow-hidden cursor-pointer"
          >
            <span 
              className="inline-block transition-all duration-300 ease-out"
              style={{ 
                transform: disableBackground ? 'translateY(-100%)' : 'translateY(0)',
                opacity: disableBackground ? 0 : 1,
              }}
            >
              No BG
            </span>
            <span 
              className="absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out"
              style={{ 
                transform: disableBackground ? 'translateY(0)' : 'translateY(100%)',
                opacity: disableBackground ? 1 : 0,
              }}
            >
              BG
            </span>
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div 
        ref={containerRef}
        className="diff-viewer-container flex-1 min-h-0 w-full overflow-scroll bg-background relative"
        style={{ height: '100%', scrollbarGutter: 'stable' }}
      >
        {/* Selection Popover for AI */}
        <SelectionPopover
          isVisible={isPopoverVisible}
          position={popoverPosition}
          selectionInfo={selectionInfo}
          isExpanded={isPopoverExpanded}
          onExpand={() => setIsPopoverExpanded(true)}
          onDismiss={dismissPopover}
          type="diff"
          popoverRef={popoverRef}
          positioning="absolute"
        />
        <MultiFileDiff
          oldFile={oldFile}
          newFile={newFile}
          options={diffOptions}
          style={{ minHeight: '100%', width: '100%' }}
        />
      </div>
    </div>
  );
};
