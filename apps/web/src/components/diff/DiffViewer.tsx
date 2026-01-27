'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { MultiFileDiff } from '@pierre/diffs/react';
import type { FileContents } from '@pierre/diffs';
import { gitApi } from '@/api/ws-api';
import { Loader2 } from '@workspace/ui';
import { useTheme } from 'next-themes';

interface DiffViewerProps {
  repoPath: string;
  filePath: string;
}

// Custom scrollbar CSS for Shadow DOM - matches project's global scrollbar style
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
  /* Hide scrollbar corner (the white square at bottom-right) */
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
  const [disableBackground, setDisableBackground] = useState(false);
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDiff = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const diff = await gitApi.getFileDiff(repoPath, filePath);

        // 从文件路径提取文件名
        const fileName = filePath.split('/').pop() || filePath;

        const oldFileContent: FileContents = {
          name: fileName,
          contents: diff.old_content,
        };

        const newFileContent: FileContents = {
          name: fileName,
          contents: diff.new_content,
        };

        setOldFile(oldFileContent);
        setNewFile(newFileContent);
      } catch (err) {
        console.error('Failed to load diff:', err);
        setError(err instanceof Error ? err.message : 'Failed to load diff');
      } finally {
        setIsLoading(false);
      }
    };

    loadDiff();
  }, [repoPath, filePath]);

  // Memoize options to prevent unnecessary re-renders
  const diffOptions = useMemo(() => ({
    theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light' as const,
    diffStyle: diffStyle,
    disableBackground: disableBackground,
    disableFileHeader: true,
    overflow: 'scroll' as const,
    unsafeCSS: SCROLLBAR_CSS,
  }), [resolvedTheme, diffStyle, disableBackground]);

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
      {/* Custom Header Metadata */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-sidebar-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">{filePath}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Split/Unified Toggle */}
          <div className="flex items-center gap-1 border border-sidebar-border rounded-sm overflow-hidden">
            <button
              onClick={() => setDiffStyle('split')}
              className={`px-3 py-1 text-xs font-medium transition-colors ease-out duration-200 ${diffStyle === 'split'
                ? 'bg-sidebar-accent text-sidebar-foreground'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Split
            </button>
            <button
              onClick={() => setDiffStyle('unified')}
              className={`px-3 py-1 text-xs font-medium transition-colors ease-out duration-200 ${diffStyle === 'unified'
                ? 'bg-sidebar-accent text-sidebar-foreground'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              Unified
            </button>
          </div>

          {/* Background Toggle */}
          <button
            onClick={() => setDisableBackground(!disableBackground)}
            className="px-3 py-1 text-xs font-medium border border-sidebar-border rounded-sm bg-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-all ease-out duration-200"
          >
            {disableBackground ? 'Enable' : 'Disable'} Background
          </button>
        </div>
      </div>

      {/* Diff Content - MultiFileDiff handles its own scrolling */}
      <div 
        ref={containerRef}
        className="diff-viewer-container flex-1 min-h-0 w-full overflow-scroll bg-background"
        style={{ 
          height: '100%',
          scrollbarGutter: 'stable',
        }}
      >
        <MultiFileDiff
          oldFile={oldFile}
          newFile={newFile}
          options={diffOptions}
          style={{
            minHeight: '100%',
            width: '100%',
          }}
        />
      </div>
    </div>
  );
};
