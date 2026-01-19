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

// Icons
const FolderIcon = () => (
  <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

const GitRepoIcon = () => (
  <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
  </svg>
);

const FileIcon = () => (
  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
    <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const HomeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

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
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
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
            <ChevronUpIcon />
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
            <HomeIcon />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => loadDirectory(currentPath)}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshIcon />
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
        <ScrollArea className="flex-1 min-h-[300px] border rounded-md">
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
                  {entry.is_git_repo ? <GitRepoIcon /> : entry.is_dir ? <FolderIcon /> : <FileIcon />}
                  <span className="flex-1 truncate">{entry.name}</span>
                  {entry.is_git_repo && (
                    <span className="text-xs text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded">
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
          <div className="text-sm text-muted-foreground truncate">
            Selected: <span className="font-mono">{selectedEntry.path}</span>
          </div>
        )}
        
        <DialogFooter className="flex gap-2">
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
