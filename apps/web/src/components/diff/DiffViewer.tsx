'use client';

import React, { useEffect, useState } from 'react';
import { MultiFileDiff } from '@pierre/diffs/react';
import type { FileContents } from '@pierre/diffs';
import { gitApi } from '@/api/ws-api';
import { useGitStore } from '@/hooks/use-git-store';
import { Loader2 } from '@workspace/ui';
import { useTheme } from 'next-themes';

interface DiffViewerProps {
  repoPath: string;
  filePath: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ repoPath, filePath }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oldFile, setOldFile] = useState<FileContents | null>(null);
  const [newFile, setNewFile] = useState<FileContents | null>(null);
  const [diffStyle, setDiffStyle] = useState<'split' | 'unified'>('split');
  const [disableBackground, setDisableBackground] = useState(false);
  const { resolvedTheme } = useTheme();

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
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      {/* Custom Header Metadata */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-sidebar-border bg-muted/30 shrink-0 z-10">
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

      {/* Diff Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <div className="min-w-fit min-h-full">
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: resolvedTheme === 'dark' ? 'pierre-dark' : 'pierre-light',
              diffStyle: diffStyle,
              disableBackground: disableBackground,
            }}
          />
        </div>
      </div>
    </div>
  );
};
