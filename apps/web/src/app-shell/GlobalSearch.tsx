"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useFocusRestore } from '@/shared/hooks/use-focus-restore';
import { useAppRouter } from '@/shared/hooks/use-app-router';
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useTheme } from 'next-themes';
import { useQueryState } from 'nuqs';
import Fuse from 'fuse.js';
import {
  CommandDialog,
} from '@workspace/ui';
import { useDialogStore } from '@/app-shell/state/use-dialog-store';
import { useProjectStore } from '@/features/project/store/use-project-store';
import { isWorkspaceSetupBlocking } from '@/features/workspace/lib/workspace-setup';
import { useWorkspaceCreationStore } from '@/features/workspace/store/workspace-creation-store';
import { useEditorStore } from '@/features/editor/store/use-editor-store';
import { fsApi, type SearchMatch, type FileTreeNode } from '@/api/ws-api';
import { llmProvidersModalParams, agentChatParams, settingsModalParams, tokenUsageParams, leftSidebarParams } from '@/shared/lib/nuqs/searchParams';
import { useWorkspaceContext } from '@/features/workspace/hooks/use-workspace-context';
import { useSidebarLayout } from '@/app-shell/SidebarLayoutContext';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import {
  type AppSearchItem,
  type SearchTab,
} from '@/app-shell/global-search-parts';
import { buildGlobalSearchItems } from '@/app-shell/global-search-app-items';
import {
  GlobalSearchMainView,
  TodoSubView,
  UsageSubView,
  type GroupedAppItems,
  type SubView,
} from '@/app-shell/global-search-content';

export function GlobalSearch() {
  const router = useAppRouter();
  const { workspaceId: currentWorkspaceId, projectId: currentProjectIdFromUrl } = useContextParams();
  const { setTheme } = useTheme();

  const isGlobalSearchOpen = useDialogStore(s => s.isGlobalSearchOpen);
  const { onCloseAutoFocusPrevent } = useFocusRestore(isGlobalSearchOpen);
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

  // URL-param driven modals
  const [, setLlmProvidersOpen] = useQueryState("llmProvidersModal", llmProvidersModalParams.llmProvidersModal);
  const [, setAgentChatOpen] = useQueryState("chat", agentChatParams.chat);
  const [, setTokenUsageOpen] = useQueryState("tokenUsage", tokenUsageParams.tokenUsage);
  const [, setSettingsOpen] = useQueryState("settingsModal", settingsModalParams.settingsModal);
  const [, setActiveSettingTab] = useQueryState("activeSettingTab", settingsModalParams.activeSettingTab);
  const [, setLeftSidebarTab] = useQueryState("lsTab", leftSidebarParams.lsTab);
  const [, setKanbanExpanded] = useQueryState("lsKanban", leftSidebarParams.lsKanban);
  const { isLeftCollapsed, setIsLeftCollapsed } = useSidebarLayout();

  const managementTerminalsEnabled = useExperimentSettingsStore((s) => s.managementTerminalsEnabled);
  const managementAgentsEnabled = useExperimentSettingsStore((s) => s.managementAgentsEnabled);
  const automationsEnabled = useExperimentSettingsStore((s) => s.automationsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    void loadExperimentSettings();
  }, [loadExperimentSettings]);

  // Sub-view state (null = search, inline panels reuse the command dialog shell)
  const [subView, setSubView] = useState<SubView | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [fileTreeCache, setFileTreeCache] = useState<FileTreeNode[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [codeSearchResults, setCodeSearchResults] = useState<SearchMatch[]>([]);
  const [isSearchingCode, setIsSearchingCode] = useState(false);
  const [codeSearchTruncated, setCodeSearchTruncated] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string>("");
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, []);

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

  // TODO sub-view
  const contextId = currentWorkspaceId || currentProjectIdFromUrl || null;
  const {
    tasks: todoTasks,
    tasksLoading: todoTasksLoading,
    loadTasks: todoLoadTasks,
    addTask: todoAddTask,
    updateTaskStatus: todoUpdateTaskStatus,
    updateTaskContent: todoUpdateTaskContent,
    deleteTask: todoDeleteTask,
  } = useWorkspaceContext(contextId);

  // Load tasks when entering TODO sub-view
  useEffect(() => {
    if (subView === 'todo' && currentEffectivePath) {
      todoLoadTasks(currentEffectivePath);
    }
  }, [subView, currentEffectivePath, todoLoadTasks]);

  // Keyboard shortcut to open search
  useHotkeys('mod+k', () => setGlobalSearchOpen(!isGlobalSearchOpen), {
    enableOnFormTags: true,
    preventDefault: true,
    description: 'Toggle global search'
  });

  // Keyboard shortcut to switch tabs when search is open
  useHotkeys('tab', () => {
    if (!isGlobalSearchOpen) return;
    const tabs: SearchTab[] = ['app', 'files', 'code'];
    const currentIndex = tabs.indexOf(globalSearchTab);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setGlobalSearchTab(tabs[nextIndex]);
    // Focus input after tab switch
    setTimeout(() => inputRef.current?.focus(), 0);
  }, {
    enabled: isGlobalSearchOpen,
    enableOnFormTags: true,
    preventDefault: true,
    description: 'Switch search tabs'
  });

  // Reset search when dialog closes
  useEffect(() => {
    if (!isGlobalSearchOpen) {
      setSearchQuery('');
      setCodeSearchResults([]);
      setSelectedValue('');
      setSubView(null);
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

  const isSettingUp = isWorkspaceSetupBlocking(
    currentWorkspaceId ? setupProgress[currentWorkspaceId] : null,
  );
  const showCreating = useWorkspaceCreationStore((s) => s.showCreating);
  const showOpening = useWorkspaceCreationStore((s) => s.showOpening);
  const clearWorkspaceCreationOverlay = useWorkspaceCreationStore((s) => s.clear);

  const loadFileTree = useCallback(async () => {
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
  }, [currentEffectivePath]);

  // Load file tree when switching to files tab
  useEffect(() => {
    if (globalSearchTab === 'files' && currentEffectivePath && fileTreeCache.length === 0 && !isSettingUp) {
      loadFileTree();
    }
  }, [globalSearchTab, currentEffectivePath, fileTreeCache.length, isSettingUp, loadFileTree]);

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
  const flattenFileTree = useCallback((nodes: FileTreeNode[]): { name: string; path: string; isDir: boolean }[] => {
    const result: { name: string; path: string; isDir: boolean }[] = [];

    for (const node of nodes) {
      result.push({ name: node.name, path: node.path, isDir: node.is_dir });
      if (node.children) {
        result.push(...flattenFileTree(node.children));
      }
    }

    return result;
  }, []);

  // Build app search items
  const appSearchItems = useMemo((): AppSearchItem[] => {
    return buildGlobalSearchItems({
      projects,
      router,
      setTheme,
      setGlobalSearchOpen,
      setCreateProjectOpen,
      setSelectedProjectId,
      setCreateWorkspaceOpen,
      quickAddWorkspace,
      isFullScreen,
      toggleFullScreen,
      currentProject,
      currentWorkspace,
      currentWorkspaceId,
      currentEffectivePath,
      managementTerminalsEnabled,
      managementAgentsEnabled,
      automationsEnabled,
      isLeftCollapsed,
      setLlmProvidersOpen,
      setAgentChatOpen,
      setTokenUsageOpen,
      setLeftSidebarTab,
      setKanbanExpanded,
      setIsLeftCollapsed,
      setActiveSettingTab,
      setSettingsOpen,
      setSubView,
      showCreating,
      showOpening,
      clearWorkspaceCreationOverlay,
    });
  }, [projects, router, setTheme, setGlobalSearchOpen, setCreateProjectOpen, setSelectedProjectId, setCreateWorkspaceOpen, quickAddWorkspace, isFullScreen, toggleFullScreen, currentProject, setLlmProvidersOpen, setAgentChatOpen, setTokenUsageOpen, setLeftSidebarTab, setKanbanExpanded, isLeftCollapsed, setIsLeftCollapsed, setActiveSettingTab, setSettingsOpen, currentWorkspaceId, currentWorkspace, managementTerminalsEnabled, managementAgentsEnabled, automationsEnabled, clearWorkspaceCreationOverlay, currentEffectivePath, showCreating, showOpening]);

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
    const groups: GroupedAppItems = {
      workspace: [],
      theme: [],
      project: [],
      'new-workspace': [],
      'quick-open': [],
      management: [],
      modal: [],
      todo: [],
      usage: [],
    };

    filteredAppItems.forEach(item => {
      groups[item.type].push(item);
    });

    return groups;
  }, [filteredAppItems]);

  // Select first result when results change
  useEffect(() => {
    if (!isGlobalSearchOpen) return;

    // Clear selection when no results or query is empty
    if (searchQuery.trim() === '') {
      setSelectedValue('');
      return;
    }

    // Select first result based on current tab
    if (globalSearchTab === 'app' && filteredAppItems.length > 0) {
      setSelectedValue(filteredAppItems[0].id);
    } else if (globalSearchTab === 'files' && filteredFiles.length > 0) {
      setSelectedValue(filteredFiles[0].path);
    } else if (globalSearchTab === 'code' && codeSearchResults.length > 0) {
      setSelectedValue(`${codeSearchResults[0].file_path}:${codeSearchResults[0].line_number}`);
    }
  }, [globalSearchTab, searchQuery, filteredAppItems, filteredFiles, codeSearchResults, isGlobalSearchOpen]);

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

  return (
    <CommandDialog
      showCloseButton={false}
      open={isGlobalSearchOpen}
      onOpenChange={(open) => {
        if (!open && subView) {
          setSubView(null);
          return;
        }
        setGlobalSearchOpen(open);
      }}
      onCloseAutoFocus={onCloseAutoFocusPrevent}
      className="w-[min(740px,calc(100vw-2rem))] sm:max-w-[740px] h-[min(82vh,900px)]"
    >
      {subView === 'todo' ? (
        <TodoSubView
          currentProject={currentProject}
          currentWorkspace={currentWorkspace}
          currentEffectivePath={currentEffectivePath}
          tasks={todoTasks}
          tasksLoading={todoTasksLoading}
          addTask={todoAddTask}
          updateTaskStatus={todoUpdateTaskStatus}
          updateTaskContent={todoUpdateTaskContent}
          deleteTask={todoDeleteTask}
          onBack={() => setSubView(null)}
        />
      ) : subView === 'usage' ? (
        <UsageSubView onBack={() => setSubView(null)} />
      ) : (
        <GlobalSearchMainView
          codeSearchResults={codeSearchResults}
          codeSearchTruncated={codeSearchTruncated}
          currentEffectivePath={currentEffectivePath}
          currentProject={currentProject}
          filteredAppItems={filteredAppItems}
          filteredFiles={filteredFiles}
          globalSearchTab={globalSearchTab}
          groupedAppItems={groupedAppItems}
          hoveredValue={hoveredValue}
          inputRef={inputRef}
          isLoadingFiles={isLoadingFiles}
          isSearchingCode={isSearchingCode}
          searchQuery={searchQuery}
          selectedValue={selectedValue}
          setGlobalSearchTab={setGlobalSearchTab}
          setHoveredValue={setHoveredValue}
          setSearchQuery={setSearchQuery}
          onCodeResultSelect={handleCodeResultSelect}
          onFileSelect={handleFileSelect}
        />
      )}
    </CommandDialog>
  );
}

export default GlobalSearch;
