import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  FolderOpen,
  Terminal,
  Code2,
  Copy,
  ChevronDown,
  MousePointer2,
  Zap,
  FileText,
  Hammer,
  Cpu,
  Ghost,
  Blocks,
  FileCode,
  Database,
  AppWindow,
  Braces,
  Orbit,
  toastManager
} from '@workspace/ui';
import { cn } from '@workspace/ui';
import { useEffect, useState } from 'react';
import { fsApi, appApi } from '@/api/ws-api';
import { Workspace } from '@/types/types';

interface QuickOpenProps {
  workspace: Workspace;
}

const STORAGE_KEY = 'atmos_quick_open_last_used';

// App Map for Icons and labels
const APP_MAP: Record<string, { icon: React.ReactNode; label: string }> = {
  'Finder': { icon: <FolderOpen className="size-3.5 text-blue-500" />, label: 'Finder' },
  'Terminal': { icon: <Terminal className="size-3.5" />, label: 'Terminal' },
  'Cursor': { icon: <MousePointer2 className="size-3.5 text-foreground/80" />, label: 'Cursor' },
  'Zed': { icon: <Zap className="size-3.5 text-yellow-500" />, label: 'Zed' },
  'Sublime Text': { icon: <FileText className="size-3.5 text-orange-500" />, label: 'Sublime Text' },
  'Xcode': { icon: <Hammer className="size-3.5 text-blue-600" />, label: 'Xcode' },
  'iTerm': { icon: <Terminal className="size-3.5 text-foreground/80" />, label: 'iTerm' },
  'Warp': { icon: <Cpu className="size-3.5 text-cyan-500" />, label: 'Warp' },
  'Ghostty': { icon: <Ghost className="size-3.5 text-purple-500" />, label: 'Ghostty' },
  'VS Code': { icon: <Code2 className="size-3.5 text-blue-500" />, label: 'VS Code' },
  'VS Code Insiders': { icon: <Code2 className="size-3.5 text-green-600" />, label: 'VS Code Insiders' },
  'IntelliJ IDEA': { icon: <Braces className="size-3.5 text-pink-500" />, label: 'IntelliJ IDEA' },
  'WebStorm': { icon: <AppWindow className="size-3.5 text-blue-400" />, label: 'WebStorm' },
  'PyCharm': { icon: <FileCode className="size-3.5 text-yellow-400" />, label: 'PyCharm' },
  'DataGrip': { icon: <Database className="size-3.5 text-purple-400" />, label: 'DataGrip' },
  'Antigravity': { icon: <Orbit className="size-3.5 text-blue-400" />, label: 'Antigravity' },
};

export const QuickOpen = ({ workspace }: QuickOpenProps) => {
  const [lastUsedApp, setLastUsedApp] = useState<string>('Finder');
  const [homeDir, setHomeDir] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && APP_MAP[saved]) {
      setLastUsedApp(saved);
    }

    fsApi.getHomeDir().then(dir => {
      setHomeDir(dir);
      setLoading(false);
    });
  }, []);



  const getWorktreePath = () => {
    if (!workspace) return '';
    return workspace.localPath;
  };

  const handleOpenApp = async (appName: string) => {
    // Save to local storage
    localStorage.setItem(STORAGE_KEY, appName);
    setLastUsedApp(appName);

    const path = getWorktreePath();
    if (!path) return;

    try {
      await appApi.openWith(appName, path);
      toastManager.add({
        title: `Opened in ${appName}`,
        description: `Path: ${path}`,
        type: 'success'
      });
    } catch (error) {
      toastManager.add({
        title: 'Failed to open',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error'
      });
    }
  };

  const handleMainClick = () => {
    handleOpenApp(lastUsedApp);
  };

  const handleCopyPath = () => {
    const path = getWorktreePath();
    if (path) {
      navigator.clipboard.writeText(path);
      toastManager.add({
        title: 'Copied',
        description: 'Worktree path copied to clipboard',
        type: 'success'
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        handleMainClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMainClick]);

  const CurrentIcon = APP_MAP[lastUsedApp]?.icon || APP_MAP['Finder'].icon;
  const CurrentLabel = APP_MAP[lastUsedApp]?.label || 'Open';

  return (
    <div className="flex items-stretch bg-muted/40 hover:bg-muted/60 transition-colors rounded-md border border-transparent hover:border-border group h-7">
      {/* Main Action Button */}
      <button
        onClick={handleMainClick}
        className="flex items-center space-x-1.5 px-2.5 border-r hover:bg-accent/50 border-border/50 rounded-l-md transition-all outline-none h-full hover:cursor-pointer"
        title={`Open in ${CurrentLabel} (Cmd+O)`}
      >
        {CurrentIcon}
        <span className="text-[13px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          Open
        </span>
        <kbd className="pointer-events-none hidden h-4 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-70 group-hover:opacity-100 sm:flex">
          <span className="text-xs">⌘</span>O
        </kbd>
      </button>

      {/* Dropdown Trigger */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="px-1.5 hover:bg-accent/50 rounded-r-md transition-all outline-none flex items-center justify-center h-full">
            <ChevronDown className="size-3 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Finder')}>
            <FolderOpen className="mr-2 size-4 text-blue-500" />
            <span>Finder</span>
          </DropdownMenuItem>

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Terminal')}>
            <Terminal className="mr-2 size-4" />
            <span>Terminal</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Cursor')}>
            <MousePointer2 className="mr-2 size-4 text-foreground/80" />
            <span>Cursor</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Antigravity')}>
            <Orbit className="mr-2 size-4 text-blue-400" />
            <span>Antigravity</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Zed')}>
            <Zap className="mr-2 size-4 text-yellow-500" />
            <span>Zed</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Sublime Text')}>
            <FileText className="mr-2 size-4 text-orange-500" />
            <span>Sublime Text</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Xcode')}>
            <Hammer className="mr-2 size-4 text-blue-600" />
            <span>Xcode</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('iTerm')}>
            <Terminal className="mr-2 size-4 text-foreground/80" />
            <span>iTerm</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Warp')}>
            <Cpu className="mr-2 size-4 text-cyan-500" />
            <span>Warp</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Ghostty')}>
            <Ghost className="mr-2 size-4 text-purple-500" />
            <span>Ghostty</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <Code2 className="mr-2 size-4 text-blue-500" />
              <span>VS Code</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('VS Code')}>
                <Code2 className="mr-2 size-4 text-blue-500" />
                <span>VS Code</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('VS Code Insiders')}>
                <Code2 className="mr-2 size-4 text-green-600" />
                <span>VS Code Insiders</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <Blocks className="mr-2 size-4 text-red-500" />
              <span>JetBrains</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('IntelliJ IDEA')}>
                <Braces className="mr-2 size-4 text-pink-500" />
                <span>IntelliJ IDEA</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('WebStorm')}>
                <AppWindow className="mr-2 size-4 text-blue-400" />
                <span>WebStorm</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('PyCharm')}>
                <FileCode className="mr-2 size-4 text-yellow-400" />
                <span>PyCharm</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('DataGrip')}>
                <Database className="mr-2 size-4 text-purple-400" />
                <span>DataGrip</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem className="cursor-pointer" onClick={handleCopyPath}>
            <Copy className="mr-2 size-4" />
            <span>Copy path</span>
          </DropdownMenuItem>

        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
