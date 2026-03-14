"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppRouter } from '@/hooks/use-app-router';
import { useContextParams } from "@/hooks/use-context-params";
import { useTheme } from 'next-themes';
import Fuse from 'fuse.js';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  cn,
  Layers,
  File,
  Code,
  Sun,
  Moon,
  Laptop,
  Plus,
  Zap,
  FolderPlus,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  getFileIconProps,
  Maximize,
  Minimize,
  Terminal,
  Blocks,
  toastManager,
  CommandInputWithoutBorder,
} from '@workspace/ui';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { useProjectStore } from '@/hooks/use-project-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { fsApi, appApi, SearchMatch, FileTreeNode } from '@/api/ws-api';



const AppIcon = ({ name, className, themed }: { name: string; className?: string; themed?: boolean }) => {
  const { resolvedTheme } = useTheme();
  const themeSuffix = themed ? `_${resolvedTheme === 'dark' ? 'dark' : 'light'}` : '';
  const iconPath = useMemo(() => `/quick_open_app/${name}${themeSuffix}.svg`, [name, themeSuffix]);
  return <img src={iconPath} alt="" className={className} />;
};


// App Map for Icons and labels
const APP_MAP: Record<string, { icon: React.ReactNode; label: string }> = {
  'Finder': { icon: <AppIcon name="finder" className="size-4" />, label: 'Finder' },
  'Terminal': { icon: <AppIcon name="terminal" className="size-4" />, label: 'Terminal' },
  'Cursor': { icon: <AppIcon name="Cursor" className="size-4" themed />, label: 'Cursor' },

  'Zed': { icon: <AppIcon name="zed" className="size-4" themed />, label: 'Zed' },

  'Sublime Text': { icon: <AppIcon name="sublime-text" className="size-4" />, label: 'Sublime Text' },
  'Xcode': { icon: <AppIcon name="xcode" className="size-4" />, label: 'Xcode' },
  'iTerm': { icon: <AppIcon name="iterm2" className="size-4" themed />, label: 'iTerm' },
  'Warp': { icon: <AppIcon name="warp" className="size-4" />, label: 'Warp' },
  'Ghostty': { icon: <AppIcon name="ghostty" className="size-4" />, label: 'Ghostty' },
  'VS Code': { icon: <AppIcon name="vscode" className="size-4" />, label: 'VS Code' },
  'VS Code Insiders': { icon: <AppIcon name="vscode-insiders" className="size-4" />, label: 'VS Code Insiders' },
  'IntelliJ IDEA': { icon: <AppIcon name="intellij-idea" className="size-4" />, label: 'IntelliJ IDEA' },
  'WebStorm': { icon: <AppIcon name="webstorm" className="size-4" />, label: 'WebStorm' },
  'PyCharm': { icon: <AppIcon name="pycharm" className="size-4" />, label: 'PyCharm' },
  'GoLand': { icon: <AppIcon name="goland" className="size-4" />, label: 'GoLand' },
  'CLion': { icon: <AppIcon name="clion" className="size-4" />, label: 'CLion' },
  'Rider': { icon: <AppIcon name="rider" className="size-4" />, label: 'Rider' },
  'RustRover': { icon: <AppIcon name="rustrover" className="size-4" />, label: 'RustRover' },
  'Antigravity': { icon: <AppIcon name="antigravity" className="size-4" />, label: 'Antigravity' },
};

type SearchTab = 'app' | 'files' | 'code';

interface AppSearchItem {
  id: string;
  type: 'workspace' | 'theme' | 'project' | 'new-workspace' | 'quick-open' | 'management';
  title: string;
  description?: string;
  keywords: string[];
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export function GlobalSearch() {
  const router = useAppRouter();
  const { workspaceId: currentWorkspaceId, projectId: currentProjectIdFromUrl } = useContextParams();
  const { setTheme, theme } = useTheme();

  const isGlobalSearchOpen = useDialogStore(s => s.isGlobalSearchOpen);
  const setGlobalSearchOpen = useDialogStore(s => s.setGlobalSearchOpen);
  const globalSearchTab = useDialogStore(s => s.globalSearchTab);
  const setGlobalSearchTab = useDialogStore(s => s.setGlobalSearchTab);
  const setCreateProjectOpen = useDialogStore(s => s.setCreateProjectOpen);
  const setCreateWorkspaceOpen = useDialogStore(s => s.setCreateWorkspaceOpen);
  const setSelectedProjectId = useDialogStore(s => s.setSelectedProjectId);

  const projects = useProjectStore(s => s.projects);
  const quickAddWorkspace = useProjectStore(s => s.quickAddWorkspace);
  const setupProgress = useProjectStore(s => s.setupProgress);
  const openFile = useEditorStore(s => s.openFile);
  const currentProjectPath = useEditorStore(s => s.currentProjectPath);

  const [searchQuery, setSearchQuery] = useState('');
  const [fileTreeCache, setFileTreeCache] = useState<FileTreeNode[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [codeSearchResults, setCodeSearchResults] = useState<SearchMatch[]>([]);
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [codeSearchTruncated, setCodeSearchTruncated] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);

  // Fullscreen state
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    // Initial check
    setIsFullScreen(!!document.fullscreenElement);

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Find current project and workspace
  const currentProject = useMemo(() => {
    return projects.find(p =>
      (currentWorkspaceId && p.workspaces.some(w => w.id === currentWorkspaceId)) ||
      (!currentWorkspaceId && currentProjectIdFromUrl === p.id)
    );
  }, [projects, currentWorkspaceId, currentProjectIdFromUrl]);

  const currentWorkspace = useMemo(() => {
    return currentProject?.workspaces.find(w => w.id === currentWorkspaceId);
  }, [currentProject, currentWorkspaceId]);

  const currentEffectivePath = currentWorkspace?.localPath || currentProject?.mainFilePath;

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(!isGlobalSearchOpen);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isGlobalSearchOpen, setGlobalSearchOpen]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!isGlobalSearchOpen) {
      setSearchQuery('');
      setCodeSearchResults([]);
      setSelectedValue('');
    }
  }, [isGlobalSearchOpen]);

  // Reset selection when tab or query changes
  useEffect(() => {
    setSelectedValue('');
  }, [globalSearchTab, searchQuery]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedValue) {
      const timer = setTimeout(() => {
        const element = document.querySelector(`[cmdk-item][data-selected="true"]`);
        if (element) {
          element.scrollIntoView({ block: 'nearest' });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [selectedValue]);

  const isSettingUp = currentWorkspaceId ? setupProgress[currentWorkspaceId]?.status !== 'completed' && !!setupProgress[currentWorkspaceId] : false;

  // Load file tree when switching to files tab
  useEffect(() => {
    if (globalSearchTab === 'files' && currentEffectivePath && fileTreeCache.length === 0 && !isSettingUp) {
      loadFileTree();
    }
  }, [globalSearchTab, currentEffectivePath, isSettingUp]);

  const loadFileTree = async () => {
    if (!currentEffectivePath) return;

    setIsLoadingFiles(true);
    try {
      const response = await fsApi.listProjectFiles(currentEffectivePath);
      setFileTreeCache(response.tree);
    } catch (error) {
      console.error('Failed to load file tree:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Debounced code search
  useEffect(() => {
    if (globalSearchTab !== 'code' || !searchQuery.trim() || !currentEffectivePath || isSettingUp) {
      setCodeSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingCode(true);
      try {
        const response = await fsApi.searchContent(currentEffectivePath, searchQuery.trim());
        setCodeSearchResults(response.matches);
        setCodeSearchTruncated(response.truncated);
      } catch (error) {
        console.error('Code search failed:', error);
        setCodeSearchResults([]);
      } finally {
        setIsSearchingCode(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, globalSearchTab, currentEffectivePath, isSettingUp]);

  // Flatten file tree for searching
  const flattenFileTree = useCallback((nodes: FileTreeNode[], prefix = ''): { name: string; path: string; isDir: boolean }[] => {
    const result: { name: string; path: string; isDir: boolean }[] = [];

    for (const node of nodes) {
      result.push({ name: node.name, path: node.path, isDir: node.is_dir });
      if (node.children) {
        result.push(...flattenFileTree(node.children, node.path));
      }
    }

    return result;
  }, []);

  // Build app search items
  const appSearchItems = useMemo((): AppSearchItem[] => {
    const items: AppSearchItem[] = [];

    // Workspaces
    projects.forEach(project => {
      project.workspaces.forEach(workspace => {
        items.push({
          id: `workspace-${workspace.id}`,
          type: 'workspace',
          title: workspace.name,
          description: `${project.name} · ${workspace.branch}`,
          keywords: [
            'workspace',
            workspace.name,
            project.name,
            workspace.branch,
            // Split by common separators for better fuzzy matching
            ...workspace.name.split(/[-_/]/),
            ...project.name.split(/[-_/]/),
            ...workspace.branch.split(/[-_/]/),
          ].filter(Boolean),
          icon: <Layers className="size-4 text-muted-foreground" />,
          action: () => {
            router.push(`/workspace?id=${workspace.id}`);
            setGlobalSearchOpen(false);
          },
        });
      });
    });

    // Theme options
    items.push({
      id: 'theme-light',
      type: 'theme',
      title: 'Light Theme',
      keywords: ['light', 'theme', 'appearance', 'mode', 'bright'],
      icon: <Sun className="size-4 text-muted-foreground" />,
      action: () => {
        setTheme('light');
        setGlobalSearchOpen(false);
      },
    });

    items.push({
      id: 'theme-dark',
      type: 'theme',
      title: 'Dark Theme',
      keywords: ['dark', 'theme', 'appearance', 'mode', 'night'],
      icon: <Moon className="size-4 text-muted-foreground" />,
      action: () => {
        setTheme('dark');
        setGlobalSearchOpen(false);
      },
    });

    items.push({
      id: 'theme-system',
      type: 'theme',
      title: 'System Theme',
      keywords: ['system', 'theme', 'appearance', 'auto', 'default'],
      icon: <Laptop className="size-4 text-muted-foreground" />,
      action: () => {
        setTheme('system');
        setGlobalSearchOpen(false);
      },
    });

    // Add Project
    items.push({
      id: 'add-project',
      type: 'project',
      title: 'Add Project',
      keywords: ['add', 'import', 'project', 'repository', 'new', 'create', 'repo'],
      icon: <FolderPlus className="size-4 text-muted-foreground" />,
      action: () => {
        setCreateProjectOpen(true);
        setGlobalSearchOpen(false);
      },
    });

    // Management Center shortcuts
    items.push({
      id: 'management-workspaces',
      type: 'management',
      title: 'Management Center: Workspaces',
      description: 'Open workspace management',
      keywords: ['management', 'center', 'workspaces', 'workspace', 'admin', 'overview'],
      icon: <Layers className="size-4 text-muted-foreground" />,
      action: () => {
        router.push('/workspaces');
        setGlobalSearchOpen(false);
      },
    });

    items.push({
      id: 'management-skills',
      type: 'management',
      title: 'Management Center: Skills',
      description: 'Open skills management',
      keywords: ['management', 'center', 'skills', 'skill', 'catalog', 'library'],
      icon: <Blocks className="size-4 text-muted-foreground" />,
      action: () => {
        router.push('/skills');
        setGlobalSearchOpen(false);
      },
    });

    items.push({
      id: 'management-terminals',
      type: 'management',
      title: 'Management Center: Terminals',
      description: 'Open terminal management',
      keywords: ['management', 'center', 'terminals', 'terminal', 'sessions'],
      icon: <Terminal className="size-4 text-muted-foreground" />,
      action: () => {
        router.push('/terminals');
        setGlobalSearchOpen(false);
      },
    });

    // Toggle Full Screen
    items.push({
      id: 'toggle-fullscreen',
      type: 'project',
      title: isFullScreen ? 'Exit Full Screen' : 'Enter Full Screen',
      keywords: ['full', 'screen', 'maximize', 'minimize', 'toggle', 'view'],
      icon: isFullScreen ? <Minimize className="size-4 text-muted-foreground" /> : <Maximize className="size-4 text-muted-foreground" />,
      action: () => {
        toggleFullScreen();
        setGlobalSearchOpen(false);
      },
    });

    // New Workspace options (for each project)
    projects.forEach(project => {
      items.push({
        id: `quick-workspace-${project.id}`,
        type: 'new-workspace',
        title: 'Quick New Workspace',
        description: project.name,
        keywords: ['new', 'workspace', 'quick', 'create', project.name],
        icon: <Zap className="size-4 text-muted-foreground" />,
        action: async () => {
          const workspaceId = await quickAddWorkspace(project.id);
          if (workspaceId) {
            router.push(`/workspace?id=${workspaceId}`);
          }
          setGlobalSearchOpen(false);
        },
      });

      items.push({
        id: `new-workspace-${project.id}`,
        type: 'new-workspace',
        title: 'New Workspace',
        description: project.name,
        keywords: ['new', 'workspace', 'create', project.name],
        icon: <Plus className="size-4 text-muted-foreground" />,
        action: () => {
          setSelectedProjectId(project.id);
          setCreateWorkspaceOpen(true);
          setGlobalSearchOpen(false);
        },
      });
    });



    // Quick Open Apps
    if (currentEffectivePath) {
      Object.entries(APP_MAP).forEach(([appName, { icon, label }]) => {
        items.push({
          id: `quick-open-${appName}`,
          type: 'quick-open',
          title: `Open in ${label}`,
          description: appName === 'Finder' ? 'Reveal in Finder' : `Open project in ${label}`,
          keywords: ['open', 'external', 'app', label, appName, 'quick'],
          icon: icon,
          action: async () => {
            // Save to local storage to sync with QuickOpen button
            localStorage.setItem('atmos_quick_open_last_used', appName);

            try {
              await appApi.openWith(appName, currentEffectivePath);
              toastManager.add({
                title: `Opened in ${label}`,
                description: `Path: ${currentEffectivePath}`,
                type: 'success'
              });
            } catch (error) {
              toastManager.add({
                title: 'Failed to open',
                description: error instanceof Error ? error.message : 'Unknown error',
                type: 'error'
              });
            }
            setGlobalSearchOpen(false);
          },
        });
      });
    }

    return items;
  }, [projects, router, setTheme, setGlobalSearchOpen, setCreateProjectOpen, setSelectedProjectId, setCreateWorkspaceOpen, quickAddWorkspace, isFullScreen, currentProject]);

  // Fuse.js instance for app search
  const appFuse = useMemo(() => {
    return new Fuse(appSearchItems, {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'description', weight: 0.3 },
        { name: 'keywords', weight: 0.3 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });
  }, [appSearchItems]);

  // Filter app items based on search using Fuse.js
  const filteredAppItems = useMemo(() => {
    if (!searchQuery.trim()) return appSearchItems;

    const results = appFuse.search(searchQuery);
    return results.map(r => r.item);
  }, [appSearchItems, appFuse, searchQuery]);

  // Flatten all files for Fuse.js
  const allFiles = useMemo(() => {
    return flattenFileTree(fileTreeCache).filter(f => !f.isDir);
  }, [fileTreeCache, flattenFileTree]);

  // Fuse.js instance for file search
  const fileFuse = useMemo(() => {
    return new Fuse(allFiles, {
      keys: [
        { name: 'name', weight: 0.6 },
        { name: 'path', weight: 0.4 },
      ],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });
  }, [allFiles]);

  // Filter files based on search using Fuse.js
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return allFiles.slice(0, 20);

    const results = fileFuse.search(searchQuery, { limit: 50 });
    return results.map(r => r.item);
  }, [allFiles, fileFuse, searchQuery]);

  // Group app items by type
  const groupedAppItems = useMemo(() => {
    const groups: Record<string, AppSearchItem[]> = {
      workspace: [],
      theme: [],
      project: [],
      'new-workspace': [],
      'quick-open': [],
      management: [],
    };

    filteredAppItems.forEach(item => {
      groups[item.type].push(item);
    });

    return groups;
  }, [filteredAppItems]);

  const handleFileSelect = (path: string) => {
    // Search results open in pinned mode since user explicitly searched for them
    openFile(path, currentWorkspaceId ?? undefined, { preview: false });
    setGlobalSearchOpen(false);
  };

  const handleCodeResultSelect = (match: SearchMatch) => {
    if (currentEffectivePath) {
      const fullPath = `${currentEffectivePath}/${match.file_path}`;
      // Search results open in pinned mode since user explicitly searched for them
      openFile(fullPath, currentWorkspaceId ?? undefined, { preview: false });
      setGlobalSearchOpen(false);
    }
  };

  const SearchItem = ({
    icon,
    title,
    description,
    shortcut,
    onSelect,
    value,
    className,
    isDir = false,
  }: {
    icon?: React.ReactNode,
    title: string,
    description?: string,
    shortcut?: string,
    onSelect: () => void,
    value: string,
    className?: string,
    isDir?: boolean,
  }) => {
    const iconToRender = useMemo(() => {
      if (icon) return icon;
      const props = getFileIconProps({ name: title, isDir });
      return <img {...props} className={cn("size-4", props.className)} />;
    }, [icon, title, isDir]);

    return (
      <CommandItem
        value={value}
        onSelect={onSelect}
        className={cn("group", className)}
      >
        <div className="flex items-center gap-3 flex-1 overflow-hidden">
          <div className="shrink-0 size-8 flex items-center justify-center rounded-lg bg-muted group-data-[selected=true]:bg-background transition-colors text-muted-foreground group-data-[selected=true]:text-primary">
            {iconToRender}
          </div>
          <div className="flex flex-col min-w-0 pr-2">
            <span className="font-medium truncate">{title}</span>
            {description && (
              <span className="text-xs text-muted-foreground truncate opacity-80">{description}</span>
            )}
          </div>
        </div>
        {shortcut && (
          <CommandShortcut className="opacity-0 group-data-[selected=true]:opacity-100 transition-opacity">
            {shortcut}
          </CommandShortcut>
        )}
      </CommandItem>
    );
  };

  const CodeSearchResultItem = ({ match, onSelect }: { match: SearchMatch, onSelect: () => void }) => {
    const fileName = match.file_path.split('/').pop() || match.file_path;
    const iconProps = getFileIconProps({ name: fileName, isDir: false });

    return (
      <CommandItem
        value={`${match.file_path}:${match.line_number}`}
        onSelect={onSelect}
        onMouseEnter={() => setHoveredValue(`${match.file_path}:${match.line_number}`)}
        onMouseLeave={() => setHoveredValue(null)}
        className="group items-start flex-col gap-2.5 py-3"
      >
        <div className="flex items-center gap-3 w-full">
          <div className="shrink-0 size-7 flex items-center justify-center rounded bg-muted group-data-[selected=true]:bg-background transition-colors text-muted-foreground group-data-[selected=true]:text-primary">
            <img {...iconProps} className="size-3.5" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-medium truncate text-[13px]">{match.file_path}</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 group-data-[selected=true]:text-muted-foreground shrink-0 tabular-nums">
            Line {match.line_number}
          </span>
        </div>
        <div className="w-full pl-10">
          <pre className="text-[11px] text-muted-foreground/90 font-mono truncate bg-muted/30 group-data-[selected=true]:bg-muted/10 p-1.5 rounded-sm border border-border/20">
            {match.line_content.trim()}
          </pre>
        </div>
      </CommandItem>
    );
  };

  const CodePreviewTooltip = () => {
    const activeValue = hoveredValue || selectedValue;
    const match = codeSearchResults.find(m => `${m.file_path}:${m.line_number}` === activeValue);

    if (globalSearchTab !== 'code' || !match) return null;

    const fileName = match.file_path.split('/').pop() || match.file_path;
    const iconProps = getFileIconProps({ name: fileName, isDir: false });

    return (
      <div className="absolute left-[calc(100%+8px)] bottom-0 z-50 w-[440px] pointer-events-none p-4 bg-popover border border-border shadow-2xl rounded-xl animate-in fade-in zoom-in-95 duration-150 origin-bottom-left">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/60">
          <img {...iconProps} className="size-4" />
          <span className="text-xs font-bold truncate flex-1 text-foreground">{match.file_path}</span>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/20">L{match.line_number}</span>
        </div>
        <div className="font-mono text-[11px] leading-relaxed space-y-1 overflow-hidden">
          {match.context_before.map((line, i) => (
            <div key={i} className="text-muted-foreground/70 whitespace-pre overflow-hidden truncate">{line}</div>
          ))}
          <div className="bg-primary/20 text-foreground px-2 py-1.5 -mx-2 rounded-md border-l-4 border-primary shadow-sm font-medium whitespace-pre-wrap break-all">
            {match.line_content}
          </div>
          {match.context_after.map((line, i) => (
            <div key={i} className="text-muted-foreground/70 whitespace-pre overflow-hidden truncate">{line}</div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <CommandDialog
      showCloseButton={false}
      open={isGlobalSearchOpen}
      onOpenChange={setGlobalSearchOpen}
      className="w-[min(740px,calc(100vw-2rem))] sm:max-w-[740px] h-[min(82vh,900px)]"
    >
      <CodePreviewTooltip />
      {/* Tab Navigation */}
      <div className="px-1">
        <Tabs value={globalSearchTab} onValueChange={(v) => setGlobalSearchTab(v as SearchTab)} className="w-full h-full">
          <TabsList variant="underline" className="h-12 w-full flex border-b border-border">
            <TabsTab value="app" className="h-full flex-1 text-[12px] gap-2 font-semibold transition-all">
              <Layers className="size-3.5" />
              <span>App</span>
            </TabsTab>
            <TabsTab value="files" className="h-full flex-1 text-[12px] gap-2 font-semibold transition-all">
              <File className="size-3.5" />
              <span>Files</span>
            </TabsTab>
            <TabsTab value="code" className="h-full flex-1 text-[12px] gap-2 font-semibold transition-all">
              <Code className="size-3.5" />
              <span>Code</span>
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <CommandInputWithoutBorder
        placeholder="Search for apps, files, or code..."
        value={searchQuery}
        onValueChange={setSearchQuery}
        className="text-base"
      />

      <CommandList className="flex-1 h-full max-h-none bg-muted/50 dark:bg-black/60 rounded-t-[20px] pt-1 shadow-inner/5">
        {/* App Search Tab */}
        {globalSearchTab === 'app' && (
          <>
            {filteredAppItems.length === 0 && (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                No results found.
              </div>
            )}

            {groupedAppItems.workspace.length > 0 && (
              <CommandGroup heading="Workspaces">
                {groupedAppItems.workspace.map(item => (
                  <SearchItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                    shortcut={item.shortcut}
                  />
                ))}
              </CommandGroup>
            )}

            {groupedAppItems.theme.length > 0 && (
              <CommandGroup heading="Theme">
                {groupedAppItems.theme.map(item => (
                  <SearchItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                    icon={item.icon}
                    title={item.title}
                    shortcut={item.shortcut}
                  />
                ))}
              </CommandGroup>
            )}

            {groupedAppItems.project.length > 0 && (
              <CommandGroup heading="Actions">
                {groupedAppItems.project.map(item => (
                  <SearchItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                    icon={item.icon}
                    title={item.title}
                    shortcut={item.shortcut}
                  />
                ))}
              </CommandGroup>
            )}

            {groupedAppItems.management.length > 0 && (
              <CommandGroup heading="Management Center">
                {groupedAppItems.management.map(item => (
                  <SearchItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                  />
                ))}
              </CommandGroup>
            )}

            {groupedAppItems['new-workspace'].length > 0 && (
              <CommandGroup heading="New Workspace">
                {groupedAppItems['new-workspace'].map(item => (
                  <SearchItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                  />
                ))}
              </CommandGroup>
            )}

            {/* Start: Quick Open Apps Group */}
            {groupedAppItems['quick-open'].length > 0 && (
              <CommandGroup heading="Quick Open">
                {groupedAppItems['quick-open'].map(item => (
                  <SearchItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                    icon={item.icon}
                    title={item.title}
                    description={item.description}
                  />
                ))}
              </CommandGroup>
            )}
            {/* End: Quick Open Apps Group */}
          </>
        )}

        {/* Files Search Tab */}
        {globalSearchTab === 'files' && (
          <>
            {!currentProject ? (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                Select a workspace to search files
              </div>
            ) : isLoadingFiles ? (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                Loading files...
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                No files found.
              </div>
            ) : (
              <CommandGroup heading="Files">
                {filteredFiles.map(file => (
                  <SearchItem
                    key={file.path}
                    value={file.path}
                    onSelect={() => handleFileSelect(file.path)}
                    title={file.name}
                    description={file.path.replace(currentEffectivePath + '/', '')}
                    isDir={file.isDir}
                    shortcut="Open"
                  />
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {/* Code Search Tab */}
        {globalSearchTab === 'code' && (
          <>
            {!currentProject ? (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                Select a workspace to search code
              </div>
            ) : !searchQuery.trim() ? (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                Type to search in file contents
              </div>
            ) : isSearchingCode ? (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                Searching...
              </div>
            ) : codeSearchResults.length === 0 ? (
              <div className="flex h-[300px] w-full flex-col items-center justify-center text-sm text-muted-foreground text-center">
                No matches found.
              </div>
            ) : (
              <CommandGroup heading={codeSearchTruncated ? "Results (truncated)" : "Results"}>
                {codeSearchResults.map((match, index) => (
                  <CodeSearchResultItem
                    key={`${match.file_path}-${match.line_number}-${index}`}
                    match={match}
                    onSelect={() => handleCodeResultSelect(match)}
                  />
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
      {/* Footer */}
      <div className="mt-auto flex items-center justify-between px-4 py-2.5 bg-transparent border-t border-border/40 text-[11px] text-muted-foreground/80 shrink-0 select-none">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-1.5 group">
            <div className="flex items-center gap-0.5">
              <kbd className="min-w-[18px] h-[18px] flex items-center justify-center bg-background border border-border/60 rounded text-[10px] font-sans shadow-sm">
                <ArrowUp className="size-2.5" />
              </kbd>
              <kbd className="min-w-[18px] h-[18px] flex items-center justify-center bg-background border border-border/60 rounded text-[10px] font-sans shadow-sm">
                <ArrowDown className="size-2.5" />
              </kbd>
            </div>
            <span className="opacity-80">Navigate</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-muted/50 transition-colors cursor-default">
            <kbd className="min-w-[20px] h-[18px] flex items-center justify-center bg-background border border-border/60 rounded text-[10px] font-sans shadow-sm">
              <CornerDownLeft className="size-2.5" />
            </kbd>
            <span className="opacity-80">Open Result</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 opacity-80">
            <kbd className="px-1.5 h-[18px] flex items-center justify-center bg-background border border-border/60 rounded text-[10px] font-sans shadow-sm uppercase font-medium">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </CommandDialog>
  );
}

export default GlobalSearch;

