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
  Copy,
  ChevronDown,
  Blocks,
  toastManager
} from '@workspace/ui';

import { useEffect, useState, useMemo } from 'react';
import { useTheme } from 'next-themes';

import { fsApi, appApi } from '@/api/ws-api';
import { Workspace } from '@/types/types';

interface QuickOpenProps {
  workspace?: Workspace | null;
  path?: string | null;
}

const STORAGE_KEY = 'atmos_quick_open_last_used';

const AppIcon = ({ name, className, themed }: { name: string; className?: string; themed?: boolean }) => {
  const { resolvedTheme } = useTheme();
  const themeSuffix = themed ? `_${resolvedTheme === 'dark' ? 'dark' : 'light'}` : '';
  const iconPath = useMemo(() => `/quick_open_app/${name}${themeSuffix}.svg`, [name, themeSuffix]);
  return <img src={iconPath} alt="" className={className} />;
};


// App Map for Icons and labels
const APP_MAP: Record<string, { icon: React.ReactNode; label: string }> = {
  'Finder': { icon: <AppIcon name="finder" className="size-3.5" />, label: 'Finder' },
  'Terminal': { icon: <AppIcon name="terminal" className="size-3.5" />, label: 'Terminal' },
  'Cursor': { icon: <AppIcon name="Cursor" className="size-3.5" themed />, label: 'Cursor' },
  'Zed': { icon: <AppIcon name="zed" className="size-3.5" themed />, label: 'Zed' },

  'Sublime Text': { icon: <AppIcon name="sublime-text" className="size-3.5" />, label: 'Sublime Text' },
  'Xcode': { icon: <AppIcon name="xcode" className="size-3.5" />, label: 'Xcode' },
  'iTerm': { icon: <AppIcon name="iterm2" className="size-3.5" themed />, label: 'iTerm' },

  'Warp': { icon: <AppIcon name="warp" className="size-3.5" />, label: 'Warp' },
  'Ghostty': { icon: <AppIcon name="ghostty" className="size-3.5" />, label: 'Ghostty' },
  'VS Code': { icon: <AppIcon name="vscode" className="size-3.5" />, label: 'VS Code' },
  'VS Code Insiders': { icon: <AppIcon name="vscode-insiders" className="size-3.5" />, label: 'VS Code Insiders' },
  'IntelliJ IDEA': { icon: <AppIcon name="intellij-idea" className="size-3.5" />, label: 'IntelliJ IDEA' },
  'WebStorm': { icon: <AppIcon name="webstorm" className="size-3.5" />, label: 'WebStorm' },
  'PyCharm': { icon: <AppIcon name="pycharm" className="size-3.5" />, label: 'PyCharm' },
  'GoLand': { icon: <AppIcon name="goland" className="size-3.5" />, label: 'GoLand' },
  'CLion': { icon: <AppIcon name="clion" className="size-3.5" />, label: 'CLion' },
  'Rider': { icon: <AppIcon name="rider" className="size-3.5" />, label: 'Rider' },
  'RustRover': { icon: <AppIcon name="rustrover" className="size-3.5" />, label: 'RustRover' },
  'Antigravity': { icon: <AppIcon name="antigravity" className="size-3.5" />, label: 'Antigravity' },
};

export const QuickOpen = ({ workspace, path }: QuickOpenProps) => {
  const [lastUsedApp, setLastUsedApp] = useState<string>('Finder');
  const [homeDir, setHomeDir] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && APP_MAP[saved]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastUsedApp(saved);
    }

    fsApi.getHomeDir().then(dir => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHomeDir(dir);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    });
  }, []);



  const getWorktreePath = () => {
    if (path) return path;
    if (workspace) return workspace.localPath;
    return '';
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
            <AppIcon name="finder" className="mr-2 size-4" />
            <span>Finder</span>
          </DropdownMenuItem>

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Terminal')}>
            <AppIcon name="terminal" className="mr-2 size-4" />
            <span>Terminal</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Cursor')}>
            <AppIcon name="Cursor" className="mr-2 size-4" themed />
            <span>Cursor</span>
          </DropdownMenuItem>

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Antigravity')}>
            <AppIcon name="antigravity" className="mr-2 size-4" />
            <span>Antigravity</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Zed')}>
            <AppIcon name="zed" className="mr-2 size-4" themed />
            <span>Zed</span>
          </DropdownMenuItem>

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Sublime Text')}>
            <AppIcon name="sublime-text" className="mr-2 size-4" />
            <span>Sublime Text</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Xcode')}>
            <AppIcon name="xcode" className="mr-2 size-4" />
            <span>Xcode</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('iTerm')}>
            <AppIcon name="iterm2" className="mr-2 size-4" themed />
            <span>iTerm</span>
          </DropdownMenuItem>

          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Warp')}>
            <AppIcon name="warp" className="mr-2 size-4" />
            <span>Warp</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Ghostty')}>
            <AppIcon name="ghostty" className="mr-2 size-4" />
            <span>Ghostty</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <AppIcon name="vscode" className="mr-2 size-4" />
              <span>VS Code</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('VS Code')}>
                <AppIcon name="vscode" className="mr-2 size-4" />
                <span>VS Code</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('VS Code Insiders')}>
                <AppIcon name="vscode-insiders" className="mr-2 size-4" />
                <span>VS Code Insiders</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <AppIcon name="jet_brains" className="mr-2 size-4" />
              <span>JetBrains</span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('IntelliJ IDEA')}>
                <AppIcon name="intellij-idea" className="mr-2 size-4" />
                <span>IntelliJ IDEA</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('WebStorm')}>
                <AppIcon name="webstorm" className="mr-2 size-4" />
                <span>WebStorm</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('PyCharm')}>
                <AppIcon name="pycharm" className="mr-2 size-4" />
                <span>PyCharm</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('GoLand')}>
                <AppIcon name="goland" className="mr-2 size-4" />
                <span>GoLand</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('CLion')}>
                <AppIcon name="clion" className="mr-2 size-4" />
                <span>CLion</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('Rider')}>
                <AppIcon name="rider" className="mr-2 size-4" />
                <span>Rider</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => handleOpenApp('RustRover')}>
                <AppIcon name="rustrover" className="mr-2 size-4" />
                <span>RustRover</span>
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
