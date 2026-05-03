'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
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
  RotateCw,
  Search,
  X,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchDirectoriesRef = useRef<((query: string) => Promise<void>) | null>(null);
  const prevSearchQueryRef = useRef<string>('');

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
      setIsSearchMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  }, [dirsOnly, showHidden]);

  // 搜索目录（递归）
  const searchDirectories = useCallback(async (query: string) => {
    if (!query.trim()) {
      // 如果搜索为空，返回当前目录浏览模式
      if (currentPath) {
        setIsLoading(true);
        setError(null);
        try {
          const result = await fsApi.listDir(currentPath, { dirsOnly, showHidden });
          setCurrentPath(result.path);
          setParentPath(result.parent_path);
          setEntries(result.entries);
          setPathInput(result.path);
          setIsSearchMode(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load directory');
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsSearchMode(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedEntry(null);

    try {
      // 从当前路径或用户主目录开始搜索
      const searchPath = currentPath || (await fsApi.getHomeDir());
      const result = await fsApi.searchDirs(searchPath, query, {
        maxResults: 50,
        maxDepth: 4,
      });
      setEntries(result.entries);
      setIsSearchMode(true);
      setPathInput(searchPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [currentPath, dirsOnly, showHidden]);

  // Store the latest searchDirectories implementation in a ref
  useEffect(() => {
    searchDirectoriesRef.current = searchDirectories;
  }, [searchDirectories]);

  // 搜索输入防抖
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      if (searchQuery) {
        searchDirectoriesRef.current?.(searchQuery);
      } else if (prevSearchQueryRef.current && !searchQuery && currentPath) {
        // 清空搜索时返回浏览模式
        loadDirectory(currentPath);
      }
      prevSearchQueryRef.current = searchQuery;
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, currentPath, loadDirectory]);

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
    if (currentPath && isConnected && !isSearchMode) {
      loadDirectory(currentPath);
    }
  // Only re-run when showHidden changes explicitly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden]);

  // 处理条目点击
  const handleEntryClick = (entry: FsEntry) => {
    setSelectedEntry(entry);
  };

  // 处理条目双击
  const handleEntryDoubleClick = (entry: FsEntry) => {
    if (entry.is_dir && !isSearchMode) {
      loadDirectory(entry.path);
    } else if (isSearchMode) {
      // 搜索模式下，双击进入该目录
      loadDirectory(entry.path);
      setSearchQuery('');
    }
  };

  // 处理路径输入
  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      loadDirectory(pathInput.trim());
      setSearchQuery('');
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
    onSelect(currentPath, false, currentPath.split('/').pop() || null);
    onOpenChange(false);
  };

  // 清除搜索
  const handleClearSearch = () => {
    setSearchQuery('');
    if (currentPath) {
      loadDirectory(currentPath);
    }
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

          {!isSearchMode && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => parentPath && loadDirectory(parentPath)}
                disabled={!parentPath || isLoading}
                title="Go to parent directory"
                className="cursor-pointer"
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
                className="cursor-pointer"
              >
                <Home className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => loadDirectory(currentPath)}
                disabled={isLoading}
                title="Refresh"
                className="cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isSearchMode ? "Searching all folders..." : "Search folders recursively..."}
            className="pl-9 pr-10 font-mono text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 选项 - 仅在非搜索模式显示 */}
        {!isSearchMode && (
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
        )}

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
              {searchQuery
                ? `No folders match "${searchQuery}"`
                : isSearchMode
                  ? 'No results found'
                  : 'Empty directory'}
            </div>
          ) : (
            <div className="p-2">
              {isSearchMode && searchQuery && (
                <div className="text-xs text-muted-foreground px-3 py-1 mb-1 sticky top-0 bg-background">
                  {entries.length} {entries.length === 1 ? 'folder' : 'folders'} found matching &quot;{searchQuery}&quot;
                </div>
              )}
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
                  {isSearchMode && (
                    <span className="text-xs text-muted-foreground truncate ml-2 max-w-[200px]">
                      {entry.path}
                    </span>
                  )}
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

        {/* 搜索结果信息 */}
        {isSearchMode && entries.length > 0 && (
          <div className="text-xs text-muted-foreground shrink-0">
            Found {entries.length} {entries.length === 1 ? 'folder' : 'folders'} • Double-click to browse
          </div>
        )}

        {/* 当前选中信息 */}
        {selectedEntry && (
          <div className="text-sm text-muted-foreground truncate shrink-0">
            Selected: <span className="font-mono">{selectedEntry.path}</span>
          </div>
        )}

        <DialogFooter className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Cancel
          </Button>
          {!isSearchMode && (
            <Button
              variant="secondary"
              onClick={handleSelectCurrentDir}
              disabled={!currentPath}
              className="cursor-pointer"
            >
              Select Current Directory
            </Button>
          )}
          <Button
            onClick={handleSelect}
            disabled={!selectedEntry}
            className="cursor-pointer"
          >
            {selectLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
