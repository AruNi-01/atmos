'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  ScrollArea,
  Checkbox,
} from '@workspace/ui';
import { fsApi, FsEntry } from '@/api/ws-api';
import { useWebSocket } from '@/hooks/use-websocket';
import { cn } from '@/lib/utils';
import {
  ChevronUp,
  File,
  Folder,
  FolderGit2,
  Home,
  RefreshCw,
} from '@workspace/ui';

interface FileBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string, isGitRepo: boolean, suggestedName: string | null) => void;
  title?: string;
  selectLabel?: string;
  dirsOnly?: boolean;
  showHidden?: boolean;
}

export function FileBrowser({
  open,
  onOpenChange,
  onSelect,
  title = 'Browse Files',
  selectLabel = 'Select',
  dirsOnly = true,
  showHidden: initialShowHidden = false,
}: FileBrowserProps) {
  const { isConnected, connectionState } = useWebSocket();

  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<FsEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(initialShowHidden);
  const [pathInput, setPathInput] = useState('');

  // 加载目录内容
  const loadDirectory = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    setSelectedEntry(null);

    try {
      const result = await fsApi.listDir(path, { dirsOnly, showHidden });
      setCurrentPath(result.path);
      setParentPath(result.parent_path);
      setEntries(result.entries);
      setPathInput(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  }, [dirsOnly, showHidden]);

  // 初始化：加载主目录
  useEffect(() => {
    if (open && isConnected) {
      const init = async () => {
        try {
          const homeDir = await fsApi.getHomeDir();
          await loadDirectory(homeDir);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to initialize');
        }
      };
      init();
    }
  }, [open, isConnected, loadDirectory]);

  // 当 showHidden 改变时重新加载
  useEffect(() => {
    if (currentPath && isConnected) {
      loadDirectory(currentPath);
    }
  }, [showHidden]);

  // 处理条目点击（单击选中，双击进入）
  const handleEntryClick = (entry: FsEntry) => {
    setSelectedEntry(entry);
  };

  const handleEntryDoubleClick = (entry: FsEntry) => {
    if (entry.is_dir) {
      loadDirectory(entry.path);
    }
  };

  // 处理路径输入
  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      loadDirectory(pathInput.trim());
    }
  };

  // 处理选择
  const handleSelect = () => {
    if (selectedEntry) {
      onSelect(
        selectedEntry.path,
        selectedEntry.is_git_repo,
        selectedEntry.is_git_repo ? selectedEntry.name : null
      );
      onOpenChange(false);
    }
  };

  // 选择当前目录
  const handleSelectCurrentDir = () => {
    // 检查当前目录是否为 git repo
    const isGitRepo = entries.some(e => e.name === '.git' && !e.is_dir) ||
                      entries.length === 0; // 需要重新验证
    onSelect(currentPath, false, currentPath.split('/').pop() || null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* 连接状态提示 */}
        {connectionState !== 'connected' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm">
            <span className="text-yellow-700 dark:text-yellow-300">
              {connectionState === 'connecting' && 'Connecting to server...'}
              {connectionState === 'reconnecting' && 'Reconnecting to server...'}
              {connectionState === 'disconnected' && 'Not connected to server'}
            </span>
          </div>
        )}

        {/* 路径输入和导航 */}
        <div className="flex gap-2 items-center">
          <form onSubmit={handlePathSubmit} className="flex-1 flex gap-2">
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="Enter path..."
              className="flex-1 font-mono text-sm"
            />
          </form>

          <Button
            variant="outline"
            size="icon"
            onClick={() => parentPath && loadDirectory(parentPath)}
            disabled={!parentPath || isLoading}
            title="Go to parent directory"
          >
            <ChevronUp className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={async () => {
              const homeDir = await fsApi.getHomeDir();
              loadDirectory(homeDir);
            }}
            disabled={isLoading}
            title="Go to home directory"
          >
            <Home className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => loadDirectory(currentPath)}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* 选项 */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="showHidden"
            checked={showHidden}
            onCheckedChange={(checked) => setShowHidden(checked === true)}
          />
          <label htmlFor="showHidden" className="text-sm text-muted-foreground cursor-pointer">
            Show hidden files
          </label>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 文件列表 */}
        <ScrollArea className="flex-1 min-h-0 border rounded-md" scrollFade>
          {isLoading ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
              Empty directory
            </div>
          ) : (
            <div className="p-2">
              {entries.map((entry) => (
                <div
                  key={entry.path}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer',
                    'hover:bg-muted/50 transition-colors',
                    selectedEntry?.path === entry.path && 'bg-primary/10 ring-1 ring-primary'
                  )}
                  onClick={() => handleEntryClick(entry)}
                  onDoubleClick={() => handleEntryDoubleClick(entry)}
                >
                  {entry.is_git_repo ? <FolderGit2 className="w-4 h-4 text-orange-500" /> : entry.is_dir ? <Folder className="w-4 h-4" /> : <File className="w-4 h-4 text-gray-400" />}
                  <span className="flex-1 truncate">{entry.name}</span>
                  {entry.is_git_repo && (
                    <span className="text-xs text-orange-500 bg-orange-400/10 px-2 py-0.5 rounded">
                      Git Repo
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* 当前选中信息 */}
        {selectedEntry && (
          <div className="text-sm text-muted-foreground truncate shrink-0">
            Selected: <span className="font-mono">{selectedEntry.path}</span>
          </div>
        )}

        <DialogFooter className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleSelectCurrentDir}
            disabled={!currentPath}
          >
            Select Current Directory
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedEntry}
          >
            {selectLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
