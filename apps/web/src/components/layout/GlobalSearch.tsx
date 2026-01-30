"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  FileText,
  Code,
  Sun,
  Moon,
  Laptop,
  Plus,
  Zap,
  FolderPlus,
} from '@workspace/ui';
import { useDialogStore } from '@/hooks/use-dialog-store';
import { useProjectStore } from '@/hooks/use-project-store';
import { useEditorStore } from '@/hooks/use-editor-store';
import { fsApi, SearchMatch, FileTreeNode } from '@/api/ws-api';

type SearchTab = 'app' | 'files' | 'code';

interface AppSearchItem {
  id: string;
  type: 'workspace' | 'theme' | 'project' | 'new-workspace';
  title: string;
  description?: string;
  keywords: string[];
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export function GlobalSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTheme, theme } = useTheme();
  
  const {
    isGlobalSearchOpen,
    setGlobalSearchOpen,
    globalSearchTab,
    setGlobalSearchTab,
    setCreateProjectOpen,
    setCreateWorkspaceOpen,
    setSelectedProjectId,
  } = useDialogStore();
  
  const { projects, quickAddWorkspace } = useProjectStore();
  const { openFile, currentProjectPath } = useEditorStore();
  const currentWorkspaceId = searchParams.get('workspaceId');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTreeCache, setFileTreeCache] = useState<FileTreeNode[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [codeSearchResults, setCodeSearchResults] = useState<SearchMatch[]>([]);
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [codeSearchTruncated, setCodeSearchTruncated] = useState(false);

  // Find current project based on active workspace
  const currentProject = useMemo(() => {
    return projects.find(p => p.workspaces.some(w => w.id === currentWorkspaceId));
  }, [projects, currentWorkspaceId]);

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
    }
  }, [isGlobalSearchOpen]);

  // Load file tree when switching to files tab
  useEffect(() => {
    if (globalSearchTab === 'files' && currentProject?.mainFilePath && fileTreeCache.length === 0) {
      loadFileTree();
    }
  }, [globalSearchTab, currentProject?.mainFilePath]);

  const loadFileTree = async () => {
    if (!currentProject?.mainFilePath) return;
    
    setIsLoadingFiles(true);
    try {
      const response = await fsApi.listProjectFiles(currentProject.mainFilePath);
      setFileTreeCache(response.tree);
    } catch (error) {
      console.error('Failed to load file tree:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Debounced code search
  useEffect(() => {
    if (globalSearchTab !== 'code' || !searchQuery.trim() || !currentProject?.mainFilePath) {
      setCodeSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingCode(true);
      try {
        const response = await fsApi.searchContent(currentProject.mainFilePath, searchQuery.trim());
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
  }, [searchQuery, globalSearchTab, currentProject?.mainFilePath]);

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
            router.push(`?workspaceId=${workspace.id}`);
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
            router.push(`?workspaceId=${workspaceId}`);
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

    return items;
  }, [projects, router, setTheme, setGlobalSearchOpen, setCreateProjectOpen, setSelectedProjectId, setCreateWorkspaceOpen, quickAddWorkspace]);

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
    };

    filteredAppItems.forEach(item => {
      groups[item.type].push(item);
    });

    return groups;
  }, [filteredAppItems]);

  const handleFileSelect = (path: string) => {
    openFile(path, currentWorkspaceId ?? undefined);
    setGlobalSearchOpen(false);
  };

  const handleCodeResultSelect = (match: SearchMatch) => {
    if (currentProject?.mainFilePath) {
      const fullPath = `${currentProject.mainFilePath}/${match.file_path}`;
      openFile(fullPath, currentWorkspaceId ?? undefined);
      setGlobalSearchOpen(false);
    }
  };

  return (
    <CommandDialog open={isGlobalSearchOpen} onOpenChange={setGlobalSearchOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Search for workspaces, files, code..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      
      {/* Tab Navigation */}
      <div className="border-b border-border">
        <Tabs value={globalSearchTab} onValueChange={(v) => setGlobalSearchTab(v as SearchTab)}>
          <TabsList variant="underline" className="w-full justify-start px-2 gap-0">
            <TabsTab value="app" className="h-9 px-4 text-[13px] gap-1.5">
              <Layers className="size-3.5" />
              <span>App</span>
            </TabsTab>
            <TabsTab value="files" className="h-9 px-4 text-[13px] gap-1.5">
              <File className="size-3.5" />
              <span>Files</span>
            </TabsTab>
            <TabsTab value="code" className="h-9 px-4 text-[13px] gap-1.5">
              <Code className="size-3.5" />
              <span>Code</span>
            </TabsTab>
          </TabsList>
        </Tabs>
      </div>

      <CommandList>
        {/* App Search Tab */}
        {globalSearchTab === 'app' && (
          <>
            {filteredAppItems.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No results found.</div>
            )}
            
            {groupedAppItems.workspace.length > 0 && (
              <CommandGroup heading="Workspaces">
                {groupedAppItems.workspace.map(item => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                  >
                    {item.icon}
                    <div className="flex flex-col">
                      <span>{item.title}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      )}
                    </div>
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {groupedAppItems.theme.length > 0 && (
              <CommandGroup heading="Theme">
                {groupedAppItems.theme.map(item => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {groupedAppItems.project.length > 0 && (
              <CommandGroup heading="Actions">
                {groupedAppItems.project.map(item => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {groupedAppItems['new-workspace'].length > 0 && (
              <CommandGroup heading="New Workspace">
                {groupedAppItems['new-workspace'].map(item => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={item.action}
                  >
                    {item.icon}
                    <div className="flex flex-col">
                      <span>{item.title}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {/* Files Search Tab */}
        {globalSearchTab === 'files' && (
          <>
            {!currentProject ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a workspace to search files
              </div>
            ) : isLoadingFiles ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Loading files...
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No files found.</div>
            ) : (
              <CommandGroup heading="Files">
                {filteredFiles.map(file => (
                  <CommandItem
                    key={file.path}
                    value={file.path}
                    onSelect={() => handleFileSelect(file.path)}
                  >
                    <FileText className="size-4 text-muted-foreground" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {file.path.replace(currentProject.mainFilePath + '/', '')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {/* Code Search Tab */}
        {globalSearchTab === 'code' && (
          <>
            {!currentProject ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a workspace to search code
              </div>
            ) : !searchQuery.trim() ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Type to search in file contents
              </div>
            ) : isSearchingCode ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Searching...
              </div>
            ) : codeSearchResults.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No matches found.</div>
            ) : (
              <CommandGroup heading={codeSearchTruncated ? "Results (truncated)" : "Results"}>
                {codeSearchResults.map((match, index) => (
                  <CommandItem
                    key={`${match.file_path}-${match.line_number}-${index}`}
                    value={`${match.file_path}:${match.line_number}`}
                    onSelect={() => handleCodeResultSelect(match)}
                    className="flex-col items-start gap-1"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Code className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{match.file_path}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        L{match.line_number}
                      </span>
                    </div>
                    <pre className="text-xs text-muted-foreground font-mono truncate w-full pl-6">
                      {match.line_content.trim()}
                    </pre>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground mt-auto shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↵</kbd>
            <span>Open</span>
          </span>
        </div>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Esc</kbd>
          <span>Close</span>
        </span>
      </div>
    </CommandDialog>
  );
}

export default GlobalSearch;
