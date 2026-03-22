import React from 'react';
import { Command } from 'lucide-react';
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

import { useEffect, useState } from 'react';

import { fsApi, appApi } from '@/api/ws-api';
import { Workspace } from '@/types/types';
import {
  getQuickOpenAppsByGroup,
  QUICK_OPEN_APP_MAP,
  QuickOpenAppIcon,
  type QuickOpenAppName,
} from '@/components/layout/quick-open-apps';

interface QuickOpenProps {
  workspace?: Workspace | null;
  path?: string | null;
}

const STORAGE_KEY = 'atmos_quick_open_last_used';

export const QuickOpen = ({ workspace, path }: QuickOpenProps) => {
  const [lastUsedApp, setLastUsedApp] = useState<QuickOpenAppName>('Finder');
  const [homeDir, setHomeDir] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && Object.prototype.hasOwnProperty.call(QUICK_OPEN_APP_MAP, saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastUsedApp(saved as QuickOpenAppName);
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

  const handleOpenApp = async (appName: QuickOpenAppName) => {
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

  const currentApp = QUICK_OPEN_APP_MAP[lastUsedApp] || QUICK_OPEN_APP_MAP['Finder'];
  const CurrentLabel = currentApp?.label || 'Open';

  return (
    <div
      className="flex h-7 items-stretch rounded-md border border-transparent bg-muted/40 transition-colors hover:border-border hover:bg-muted/60"
      onMouseLeave={() => { if (!isDropdownOpen) setIsExpanded(false); }}
    >
      {/* Main Action Button */}
      <button
        onClick={handleMainClick}
        onMouseEnter={() => setIsExpanded(true)}
        className="flex h-full items-center overflow-hidden rounded-l-md border-r border-border/50 px-2 transition-all outline-none hover:cursor-pointer hover:bg-accent/50"
        title={`Open in ${CurrentLabel} (Cmd+O)`}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <QuickOpenAppIcon iconName={currentApp.iconName} themed={currentApp.themed} className="size-3.5" />
        </span>
        <span className={`ml-0 overflow-hidden whitespace-nowrap text-[13px] font-medium text-muted-foreground transition-all duration-200 ease-out ${isExpanded ? 'ml-2 max-w-24 opacity-100 text-foreground' : 'max-w-0 opacity-0'}`}>
          Open
        </span>
        <kbd className={`pointer-events-none hidden h-4 select-none items-center gap-1 overflow-hidden rounded border bg-muted font-mono text-[10px] font-medium text-muted-foreground transition-all duration-200 ease-out sm:flex ${isExpanded ? 'ml-2 max-w-16 px-1.5 opacity-100' : 'ml-0 max-w-0 px-0 opacity-0'}`}>
          <Command className="size-3" /><span className="text-xs">O</span>
        </kbd>
      </button>

      {/* Dropdown Trigger */}
      <DropdownMenu onOpenChange={(open) => { setIsDropdownOpen(open); if (!open) setIsExpanded(false); }}>
        <DropdownMenuTrigger asChild>
          <button className="flex h-full items-center justify-center rounded-r-md px-1.5 outline-none transition-all duration-200 ease-out hover:bg-accent/50">
            <ChevronDown className="size-3 shrink-0 text-muted-foreground opacity-60 transition-opacity hover:opacity-100" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {getQuickOpenAppsByGroup('system').map((app) => (
            <DropdownMenuItem key={app.name} className="cursor-pointer" onClick={() => handleOpenApp(app.name)}>
              <QuickOpenAppIcon iconName={app.iconName} themed={app.themed} className="mr-2 size-4" />
              <span>{app.label}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {getQuickOpenAppsByGroup('editors').map((app) => (
            <DropdownMenuItem key={app.name} className="cursor-pointer" onClick={() => handleOpenApp(app.name)}>
              <QuickOpenAppIcon iconName={app.iconName} themed={app.themed} className="mr-2 size-4" />
              <span>{app.label}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {getQuickOpenAppsByGroup('terminals').map((app) => (
            <DropdownMenuItem key={app.name} className="cursor-pointer" onClick={() => handleOpenApp(app.name)}>
              <QuickOpenAppIcon iconName={app.iconName} themed={app.themed} className="mr-2 size-4" />
              <span>{app.label}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <QuickOpenAppIcon iconName="vscode" className="mr-2 size-4" />
              <span>VS Code</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {getQuickOpenAppsByGroup('vscode').map((app) => (
                <DropdownMenuItem key={app.name} className="cursor-pointer" onClick={() => handleOpenApp(app.name)}>
                  <QuickOpenAppIcon iconName={app.iconName} themed={app.themed} className="mr-2 size-4" />
                  <span>{app.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <QuickOpenAppIcon iconName="jet_brains" className="mr-2 size-4" />
              <span>JetBrains</span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent>
              {getQuickOpenAppsByGroup('jetbrains').map((app) => (
                <DropdownMenuItem key={app.name} className="cursor-pointer" onClick={() => handleOpenApp(app.name)}>
                  <QuickOpenAppIcon iconName={app.iconName} themed={app.themed} className="mr-2 size-4" />
                  <span>{app.label}</span>
                </DropdownMenuItem>
              ))}
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
