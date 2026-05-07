"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useHotkeys } from "react-hotkeys-hook";
import {
  SquareTerminal as TerminalIcon,
  X,
  GitCompare,
  Circle,
  Loader2,
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  CSS,
  arrayMove,
  restrictToVerticalAxis,
  sortableKeyboardCoordinates,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toastManager,
  getFileIconProps,
  LayoutDashboard,
} from "@workspace/ui";
import { Command, GitMergeIcon, GripVertical, Inbox, List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useEditorStore,
  useEditorStoreHydration,
  OpenFile,
  getEditorSourcePath,
  isConflictResolveEditorPath,
  isDiffEditorPath,
  EDITOR_REVIEW_DIFF_PREFIX,
} from "@/hooks/use-editor-store";
import { useShallow } from "zustand/react/shallow";
import { useGitStore } from "@/hooks/use-git-store";
import {
  Plus,
  BookOpen,
  LoaderCircle,
  RotateCw,
  Star,
  Bot,
  FileCheckCorner,
} from "lucide-react";
import { AGENT_OPTIONS } from "@/components/wiki/AgentSelect";
import { AgentIcon } from "@/components/agent/AgentIcon";
import { AGENT_STATE, useAgentHooksStore } from "@/hooks/use-agent-hooks-store";
import { AgentHookStatusIndicator } from "@/components/agent/AgentHookStatusIndicator";
import { codeAgentCustomApi, type CodeAgentCustomEntry, functionSettingsApi } from "@/api/ws-api";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";
import type { TerminalPaneAgent } from "@/components/terminal/types";
import WelcomePage from "@/components/welcome/WelcomePage";
import { useQueryStates } from "nuqs";
import { centerStageParams } from "@/lib/nuqs/searchParams";
import { useReviewTerminalRunnerStore } from "@/hooks/use-review-terminal-runner";
import type { FixedTab } from "@/lib/nuqs/searchParams";
import { useContextParams } from "@/hooks/use-context-params";
import { useDialogStore } from "@/hooks/use-dialog-store";
import { useProjectStore } from "@/hooks/use-project-store";
import { WorkspaceSetupProgressView } from "@/components/workspace/WorkspaceSetupProgress";
import { isWorkspaceSetupBlocking } from "@/utils/workspace-setup";
import { OverviewTab } from "@/components/workspace/OverviewTab";
import { WorkspacesManagementView } from "@/components/workspace/WorkspacesManagementView";
import { SkillsView } from "@/components/skills/SkillsView";
import { TerminalManagerView } from "@/components/terminal/TerminalManagerView";
import { AgentManagerView } from "@/components/agent/AgentManagerView";
import { useGitInfoStore } from "@/hooks/use-git-info-store";
import { systemApi } from "@/api/rest-api";
import {
  PROJECT_WIKI_WINDOW_NAME,
  CODE_REVIEW_WINDOW_NAME,
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
  useTerminalStore,
} from "@/hooks/use-terminal-store";
import { CodeReviewDialog } from "@/components/code-review";
import { ReviewContextProvider } from "@/components/diff/review/ReviewContextProvider";
import { useReviewSnapshotStore } from "@/hooks/use-review-snapshot-store";
import { usePrewarmCodeLanguages } from "@/hooks/use-prewarm-code-languages";
import { useAppRouter } from "@/hooks/use-app-router";
import { useWorkspaceCreationStore } from "@/hooks/use-workspace-creation-store";

const WikiTab = dynamic(
  () => import("@/components/wiki").then((m) => m.WikiTab),
  { ssr: false },
);

const DiffViewer = dynamic(
  () => import("@/components/diff/DiffViewer").then((m) => m.DiffViewer),
  { ssr: false },
);

const GitConflictResolver = dynamic(
  () =>
    import("@/components/diff/GitConflictResolver").then(
      (m) => m.GitConflictResolver,
    ),
  { ssr: false },
);

// Dynamic import file viewer to avoid SSR issues
const FileViewer = dynamic(
  () => import("@/components/editor/FileViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

// Dynamic import TerminalGrid to avoid SSR issues with xterm.js
const TerminalGrid = dynamic(
  () =>
    import("@/components/terminal/TerminalGrid").then(
      (mod) => mod.TerminalGrid
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading terminal...</span>
        </div>
      </div>
    ),
  }
);

// File icon component matching the file tree
function FileIcon({ name, className }: { name: string; className?: string }) {
  const iconProps = getFileIconProps({ name, isDir: false, className });
  return <img {...iconProps} />;
}

const FIXED_TABS = new Set<string>(["overview", "wiki", "project-wiki", "code-review"]);
const LAST_ACTIVE_TAB_STORAGE_KEY = "atmos-last-active-tab-by-context";
const TAB_GROUP_ORDER_STORAGE_KEY = "atmos-center-tab-group-order-by-context";
type TabGroupItem = {
  id: string;
  label: string;
  value: string;
  kind: "overview" | "wiki" | "terminal" | "project-wiki" | "code-review" | "file" | "diff" | "review-diff" | "conflict";
  file?: OpenFile;
};
type TabGroupOrderByContext = Record<string, Record<string, string[]>>;

function readTabGroupOrderStorage(): TabGroupOrderByContext {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.sessionStorage.getItem(TAB_GROUP_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([contextId, groups]) => [
        contextId,
        groups && typeof groups === "object"
          ? Object.fromEntries(
              Object.entries(groups as Record<string, unknown>).map(([groupKey, savedOrder]) => [
                groupKey,
                Array.isArray(savedOrder)
                  ? savedOrder.filter((item): item is string => typeof item === "string")
                  : [],
              ])
            )
          : {},
      ])
    ) as TabGroupOrderByContext;
  } catch {
    return {};
  }
}

function writeTabGroupOrderStorage(orderByContext: TabGroupOrderByContext) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(TAB_GROUP_ORDER_STORAGE_KEY, JSON.stringify(orderByContext));
  } catch {
    // Ignore storage quota/privacy failures; ordering still works for this render.
  }
}

function applySavedTabGroupOrder(group: { key: string; label: string; tabs: TabGroupItem[] }, savedOrder?: string[]) {
  const normalizedSavedOrder = Array.isArray(savedOrder)
    ? savedOrder.filter((item): item is string => typeof item === "string")
    : [];
  if (!normalizedSavedOrder.length) return group;

  const orderIndex = new Map(normalizedSavedOrder.map((id, index) => [id, index]));
  return {
    ...group,
    tabs: [...group.tabs].sort((left, right) => {
      const leftIndex = orderIndex.get(left.id);
      const rightIndex = orderIndex.get(right.id);
      if (leftIndex === undefined && rightIndex === undefined) return 0;
      if (leftIndex === undefined) return 1;
      if (rightIndex === undefined) return -1;
      return leftIndex - rightIndex;
    }),
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Inner component: only subscribes to agent store, receives pane IDs as stable prop.
function TerminalTabAgentIndicator({ stablePaneIds }: { stablePaneIds: string[] }) {
  const state = useAgentHooksStore((s) => {
    if (stablePaneIds.length === 0) return AGENT_STATE.IDLE;
    let hasRunning = false;
    for (const stablePaneId of stablePaneIds) {
      const paneState = s.getAgentStateForPaneId(stablePaneId);
      if (paneState === AGENT_STATE.PERMISSION_REQUEST) return AGENT_STATE.PERMISSION_REQUEST;
      if (paneState === AGENT_STATE.RUNNING) hasRunning = true;
    }
    return hasRunning ? AGENT_STATE.RUNNING : AGENT_STATE.IDLE;
  });
  if (state === AGENT_STATE.IDLE) return null;
  return <AgentHookStatusIndicator state={state} variant="compact" className="ml-0.5" />;
}

// Outer component: only subscribes to terminal store, passes stable string[]
// to the inner component. Two separate subscriptions in two separate render
// scopes — no closure dependency between stores, no infinite-update loop.
function TerminalTabAgentIndicatorWithPanes({ contextId, tabId }: { contextId: string; tabId: string }) {
  const stablePaneIds = useTerminalStore(
    useShallow((s) => {
      const panes = s.getPanes(contextId, tabId);
      return Object.values(panes)
        .map((p) => (p.tmuxWindowName ? `${contextId}:${p.tmuxWindowName}` : null))
        .filter((id): id is string => id !== null);
    })
  );
  return <TerminalTabAgentIndicator stablePaneIds={stablePaneIds} />;
}

function SortableTabGroupItem({
  groupKey,
  tab,
  isActive,
  children,
  closable,
  onSelect,
  onClose,
}: {
  groupKey: string;
  tab: TabGroupItem;
  isActive: boolean;
  children: React.ReactNode;
  closable: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    data: { groupKey },
  });

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group/tab-item relative flex h-10 w-full min-w-max cursor-pointer items-center gap-1 rounded-md pl-2 pr-2 text-left text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground dark:hover:bg-muted/45",
        isActive && "bg-muted/40 hover:bg-sidebar-accent/70",
        isDragging && "z-10 opacity-70 shadow-md"
      )}
    >
      <span
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="-ml-0.5 -mr-1.5 flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-colors hover:text-foreground active:cursor-grabbing group-hover/tab-item:opacity-100"
        aria-label={`Drag ${tab.label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical className="size-3" />
      </span>
      {children}
      {closable ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Close ${tab.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          className="ml-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-all hover:bg-muted-foreground/20 hover:text-foreground group-hover/tab-item:opacity-100"
        >
          <X className="size-3" />
        </span>
      ) : null}
    </div>
  );
}

function isTerminalCenterTabValue(value: string | null | undefined): value is string {
  return value === FIXED_TERMINAL_TAB_VALUE || !!value?.startsWith(TERMINAL_TAB_VALUE_PREFIX);
}

/**
 * Visual hint for keyboard shortcuts shown inside tooltips. Mirrors the
 * styling used by the topbar (see Header.tsx) so the look stays consistent
 * across the app.
 */
function ShortcutHint({ digit }: { digit: number | string }) {
  return (
    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
      <Command className="size-3" />
      <span className="text-xs">{digit}</span>
    </kbd>
  );
}

/**
 * Maximum number of additional terminal tabs (excluding the fixed Term tab)
 * that get a numeric ⌘N shortcut. Fixed Term is ⌘1, so additional tabs use
 * ⌘2..⌘5 in order, capped at 4 entries.
 */
const CENTER_TERMINAL_SHORTCUT_LIMIT = 4;

function getRelativePath(path: string, basePath?: string): string {
  if (!basePath) return path;
  if (path === basePath) return ".";
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return path.startsWith(normalizedBase) ? path.slice(normalizedBase.length) : path;
}

const CenterStage: React.FC = () => {
  usePrewarmCodeLanguages();
  const router = useAppRouter();

  const [fileToClose, setFileToClose] = React.useState<OpenFile | null>(null);
  const terminalGridRef = React.useRef<TerminalGridHandle>(null);
  const terminalGridRefs = React.useRef<Record<string, TerminalGridHandle | null>>({});
  const [mountedTerminalTabsByContext, setMountedTerminalTabsByContext] = React.useState<Record<string, string[]>>({});
  const scrollableTabsRef = React.useRef<HTMLDivElement>(null);
  const reloadingFilesRef = React.useRef<Set<string>>(new Set());
  const projectWikiTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [projectWikiVisibleMap, setProjectWikiVisibleMap] = React.useState<Record<string, boolean>>({});
  const [projectWikiPendingCommand, setProjectWikiPendingCommand] = React.useState<string | null>(null);
  /** When user triggers wiki gen from Wiki tab, skip check overwriting projectWikiTabVisible (avoids race) */
  const projectWikiUserTriggeredRef = React.useRef(false);
  const [projectWikiCloseConfirmOpen, setProjectWikiCloseConfirmOpen] = React.useState(false);
  const [wikiRefreshTrigger, setWikiRefreshTrigger] = React.useState(0);
  const [wikiRefreshing, setWikiRefreshing] = React.useState(false);
  const [tabContextMenu, setTabContextMenu] = React.useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);
  const [tabGroupPopoverOpen, setTabGroupPopoverOpen] = React.useState(false);
  const [tabGroupOrderByContext, setTabGroupOrderByContext] =
    React.useState<TabGroupOrderByContext>(() => readTabGroupOrderStorage());
  const tabGroupDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Agent dropdown state
  const [agentDropdownTabId, setAgentDropdownTabId] = React.useState<string | null>(null);
  const [defaultAgentId, setDefaultAgentId] = React.useState<string>("claude");
  const agentDropdownTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Code Review tab state
  const codeReviewTerminalGridRef = React.useRef<TerminalGridHandle>(null);
  const [codeReviewVisibleMap, setCodeReviewVisibleMap] = React.useState<Record<string, boolean>>({});
  const [codeReviewPendingCommand, setCodeReviewPendingCommand] = React.useState<string | null>(null);
  const codeReviewUserTriggeredRef = React.useRef(false);
  const [codeReviewCloseConfirmOpen, setCodeReviewCloseConfirmOpen] = React.useState(false);
  // codeReviewDialogOpen is managed via useDialogStore for cross-component access
  const pendingWorkspaceAgentRun = useWorkspaceCreationStore((s) => s.pendingAgentRun);
  const consumeWorkspaceAgentRun = useWorkspaceCreationStore((s) => s.consumeAgentRun);

  // Wait for editor store hydration to avoid SSR mismatch
  useEditorStoreHydration();

  const { workspaceId, effectiveContextId, currentView } = useContextParams();
  const {
    terminalTabs,
    createTerminalTab,
    closeTerminalTab,
    setActiveTerminalTab,
    primeWorkspace,
    evictWorkspaceRuntime,
  } = useTerminalStore(
    useShallow((state) => ({
      terminalTabs: effectiveContextId
        ? state.workspaceTerminalTabs[effectiveContextId]
        : undefined,
      createTerminalTab: state.createTerminalTab,
      closeTerminalTab: state.closeTerminalTab,
      setActiveTerminalTab: state.setActiveTerminalTab,
      primeWorkspace: state.primeWorkspace,
      evictWorkspaceRuntime: state.evictWorkspaceRuntime,
    }))
  );
  const isTerminalWorkspaceReady = useTerminalStore((state) => {
    if (!effectiveContextId) return false;
    return (
      state.loadedWorkspaces.has(effectiveContextId) &&
      state.hydratedTerminalScopes.has(effectiveContextId)
    );
  });
  const setupProgressMap = useProjectStore((s) => s.setupProgress);
  const currentSetupProgress = workspaceId ? setupProgressMap[workspaceId] : null;
  const isSetupBlocking = isWorkspaceSetupBlocking(currentSetupProgress);
  const visibleTerminalTabs = React.useMemo(
    () => terminalTabs && terminalTabs.length > 0
      ? terminalTabs
      : [{ id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: false }],
    [terminalTabs]
  );
  const mountedTerminalTabs = React.useMemo(
    () => (effectiveContextId ? mountedTerminalTabsByContext[effectiveContextId] ?? [] : []),
    [effectiveContextId, mountedTerminalTabsByContext]
  );
  const previousTerminalContextRef = React.useRef<string | null>(null);

  // Derive per-workspace visibility (default false for unseen workspaces)
  const projectWikiTabVisible = effectiveContextId ? (projectWikiVisibleMap[effectiveContextId] ?? false) : false;
  const codeReviewTabVisible = effectiveContextId ? (codeReviewVisibleMap[effectiveContextId] ?? false) : false;

  // --- URL-synced tab state ---
  const [{ tab: tabFromUrl, wikiPage: wikiPageFromUrl }, setUrlParams] = useQueryStates(centerStageParams);

  const resolvedTab = React.useMemo(() => {
    if (tabFromUrl === "project-wiki" && !projectWikiTabVisible) return "terminal";
    if (tabFromUrl === "code-review" && !codeReviewTabVisible) return "terminal";
    if (isTerminalCenterTabValue(tabFromUrl)) {
      return visibleTerminalTabs.some((tab) => tab.id === tabFromUrl)
        ? tabFromUrl
        : FIXED_TERMINAL_TAB_VALUE;
    }
    return tabFromUrl;
  }, [tabFromUrl, projectWikiTabVisible, codeReviewTabVisible, visibleTerminalTabs]);

  const setFixedTab = React.useCallback(
    (tab: FixedTab) => {
      if (tab === resolvedTab) return;
      const updates: Parameters<typeof setUrlParams>[0] = { tab };
      // Clear wikiPage when leaving wiki tab
      if (tab !== "wiki") {
        updates.wikiPage = null;
      }
      setUrlParams(updates);
    },
    [resolvedTab, setUrlParams]
  );

  const setWikiPage = React.useCallback(
    (page: string) => {
      setUrlParams({ tab: "wiki" as const, wikiPage: page });
    },
    [setUrlParams]
  );

  // Check Project Wiki window on mount and when workspace changes. Redirect to terminal only when window doesn't exist.
  // Intentionally NOT depending on tabFromUrl: when user triggers wiki gen from Wiki tab, we switch to project-wiki
  // and the window doesn't exist yet — re-running the check would overwrite projectWikiTabVisible and redirect away.
  React.useEffect(() => {
    if (isSetupBlocking) return;
    if (!effectiveContextId) return;
    const ctxId = effectiveContextId;
    systemApi.checkProjectWikiWindow(ctxId).then(
      ({ exists }) => {
        if (projectWikiUserTriggeredRef.current) return; // User just triggered wiki gen, don't overwrite
        setProjectWikiVisibleMap(prev => ({ ...prev, [ctxId]: exists }));
        if (tabFromUrl === "project-wiki" && !exists) {
          setUrlParams({ tab: "terminal" });
        }
      },
      () => {
        if (projectWikiUserTriggeredRef.current) return;
        setProjectWikiVisibleMap(prev => ({ ...prev, [ctxId]: false }));
        if (tabFromUrl === "project-wiki") {
          setUrlParams({ tab: "terminal" });
        }
      }
    );
  }, [effectiveContextId, isSetupBlocking]); // eslint-disable-line react-hooks/exhaustive-deps -- tabFromUrl/setUrlParams in callback; exclude tabFromUrl to avoid race when user switches to project-wiki

  // Check Code Review window on mount and when workspace changes.
  React.useEffect(() => {
    if (isSetupBlocking) return;
    if (!effectiveContextId) return;
    const ctxId = effectiveContextId;
    systemApi.checkCodeReviewWindow(ctxId).then(
      ({ exists }) => {
        if (codeReviewUserTriggeredRef.current) return;
        setCodeReviewVisibleMap(prev => ({ ...prev, [ctxId]: exists }));
        if (tabFromUrl === "code-review" && !exists) {
          setUrlParams({ tab: "terminal" });
        }
      },
      () => {
        if (codeReviewUserTriggeredRef.current) return;
        setCodeReviewVisibleMap(prev => ({ ...prev, [ctxId]: false }));
        if (tabFromUrl === "code-review") {
          setUrlParams({ tab: "terminal" });
        }
      }
    );
  }, [effectiveContextId, isSetupBlocking]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseFile = (file: OpenFile) => {
    if (file.isDirty) {
      setFileToClose(file);
    } else {
      closeFile(file.path);
    }
  };

  const confirmClose = () => {
    if (fileToClose) {
      closeFile(fileToClose.path);
      setFileToClose(null);
    }
  };

  const {
    setWorkspaceId,
    getOpenFiles,
    getActiveFilePath,
    setActiveFile,
    closeFile,
    pinFile,
    reloadFileContent,
  } = useEditorStore(
    useShallow(s => ({
      setWorkspaceId: s.setWorkspaceId,
      getOpenFiles: s.getOpenFiles,
      getActiveFilePath: s.getActiveFilePath,
      setActiveFile: s.setActiveFile,
      closeFile: s.closeFile,
      pinFile: s.pinFile,
      reloadFileContent: s.reloadFileContent,
    }))
  );
  const setCreateProjectOpen = useDialogStore(s => s.setCreateProjectOpen);
  const isCodeReviewDialogOpen = useDialogStore(s => s.isCodeReviewDialogOpen);
  const setCodeReviewDialogOpen = useDialogStore(s => s.setCodeReviewDialogOpen);
  const projects = useProjectStore(s => s.projects);
  const clearSetupProgress = useProjectStore(s => s.clearSetupProgress);
  const { currentBranch } = useGitInfoStore();

  const closeFilesSafely = (files: OpenFile[]) => {
    if (files.length === 0) return;
    const closable = files.filter((f) => !f.isDirty);
    const dirtyCount = files.length - closable.length;

    for (const file of closable) {
      closeFile(file.path, effectiveContextId || undefined);
    }
  };

  const copyToClipboard = async (value: string, successTitle: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toastManager.add({
        title: "Copy failed",
        description: "Clipboard is not available.",
        type: "error",
      });
    }
  };

  const handleFinishSetup = () => {
    if (workspaceId) {
      clearSetupProgress(workspaceId);
    }
  };

  // Sync effective context ID with store
  React.useEffect(() => {
    setWorkspaceId(effectiveContextId);
  }, [effectiveContextId, setWorkspaceId]);

  const openFiles = getOpenFiles(effectiveContextId || undefined);
  const activeFilePath = getActiveFilePath(effectiveContextId || undefined);

  // activeValue 优先使用打开的文件路径，否则使用当前 center tab
  const activeValue = activeFilePath || resolvedTab;

  React.useEffect(() => {
    if (!effectiveContextId) return;
    primeWorkspace(effectiveContextId, currentView === "project");
  }, [currentView, effectiveContextId, primeWorkspace]);

  React.useEffect(() => {
    const previousContextId = previousTerminalContextRef.current;

    if (previousContextId && previousContextId !== effectiveContextId) {
      terminalGridRef.current?.destroyAllTerminals();
      for (const grid of Object.values(terminalGridRefs.current)) {
        grid?.destroyAllTerminals();
      }
      projectWikiTerminalGridRef.current?.destroyAllTerminals();
      codeReviewTerminalGridRef.current?.destroyAllTerminals();

      terminalGridRefs.current = {};

      setMountedTerminalTabsByContext((current) => {
        if (!(previousContextId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[previousContextId];
        return next;
      });

      evictWorkspaceRuntime(previousContextId);
    }

    previousTerminalContextRef.current = effectiveContextId ?? null;
  }, [effectiveContextId, evictWorkspaceRuntime]);

  React.useEffect(() => {
    if (!effectiveContextId || !isTerminalCenterTabValue(activeValue)) return;

    setMountedTerminalTabsByContext((current) => {
      const mountedTabs = current[effectiveContextId] ?? [];
      if (mountedTabs.includes(activeValue)) {
        return current;
      }

      return {
        ...current,
        [effectiveContextId]: [...mountedTabs, activeValue],
      };
    });
  }, [activeValue, effectiveContextId]);

  React.useEffect(() => {
    if (!effectiveContextId) return;

    setMountedTerminalTabsByContext((current) => {
      const mountedTabs = current[effectiveContextId];
      if (!mountedTabs) return current;

      const nextMountedTabs = mountedTabs.filter((tabId) =>
        visibleTerminalTabs.some((tab) => tab.id === tabId),
      );

      if (nextMountedTabs.length === mountedTabs.length) {
        return current;
      }

      return {
        ...current,
        [effectiveContextId]: nextMountedTabs,
      };
    });
  }, [effectiveContextId, visibleTerminalTabs]);

  React.useEffect(() => {
    if (isSetupBlocking) return;
    if (!effectiveContextId) return;
    for (const file of openFiles) {
      if (!file.isLoading) continue;
      const key = `${effectiveContextId}:${file.path}`;
      if (reloadingFilesRef.current.has(key)) continue;
      reloadingFilesRef.current.add(key);
      reloadFileContent(file.path, effectiveContextId)
        .finally(() => {
          reloadingFilesRef.current.delete(key);
        });
    }
  }, [effectiveContextId, isSetupBlocking, openFiles, reloadFileContent]);

  React.useEffect(() => {
    const container = scrollableTabsRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      if (maxScrollLeft <= 0) return;

      const primaryDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (primaryDelta === 0) return;

      const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + primaryDelta));
      if (nextScrollLeft === container.scrollLeft) return;

      event.preventDefault();
      container.scrollLeft = nextScrollLeft;
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [effectiveContextId, openFiles.length, projectWikiTabVisible, codeReviewTabVisible, visibleTerminalTabs.length]);

  React.useEffect(() => {
    if (!effectiveContextId || !isTerminalCenterTabValue(activeValue)) return;
    setActiveTerminalTab(effectiveContextId, activeValue);
  }, [effectiveContextId, activeValue, setActiveTerminalTab]);

  React.useEffect(() => {
    if (!effectiveContextId || !activeValue) return;
    try {
      const raw = sessionStorage.getItem(LAST_ACTIVE_TAB_STORAGE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      map[effectiveContextId] = activeValue;
      sessionStorage.setItem(LAST_ACTIVE_TAB_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore storage errors
    }
  }, [effectiveContextId, activeValue]);

  React.useEffect(() => {
    if (!effectiveContextId || activeFilePath) return;
    try {
      const raw = sessionStorage.getItem(LAST_ACTIVE_TAB_STORAGE_KEY);
      if (!raw) return;
      const map = JSON.parse(raw) as Record<string, string>;
      const last = map[effectiveContextId];
      if (!last || last === activeValue) return;
      if (FIXED_TABS.has(last as string)) {
        setFixedTab(last as FixedTab);
        return;
      }
      if (isTerminalCenterTabValue(last) && visibleTerminalTabs.some((tab) => tab.id === last)) {
        setUrlParams({ tab: last, wikiPage: null });
        return;
      }
      const exists = openFiles.some((f) => f.path === last);
      if (exists) {
        setActiveFile(last, effectiveContextId);
      }
    } catch {
      // ignore storage errors
    }
  }, [effectiveContextId, activeFilePath, activeValue, openFiles, setActiveFile, setFixedTab, setUrlParams, visibleTerminalTabs]);

  // Auto-scroll active tab into view when it changes or context/tabs are restored
  React.useEffect(() => {
    const container = scrollableTabsRef.current;
    if (!activeValue || !container) return;
    if (FIXED_TABS.has(activeValue) || activeValue === FIXED_TERMINAL_TAB_VALUE) return;

    const timer = setTimeout(() => {
      const current = scrollableTabsRef.current;
      if (!current) return;
      const activeTab = current.querySelector<HTMLElement>('[data-active], [aria-selected="true"]');
      if (activeTab) {
        const containerRect = current.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        const isVisible = tabRect.left >= containerRect.left && tabRect.right <= containerRect.right;
        if (!isVisible) {
          activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [activeValue, effectiveContextId, openFiles.length, projectWikiTabVisible, codeReviewTabVisible, visibleTerminalTabs.length]);

  // Run pending wiki command when Project Wiki tab is active and grid is ready
  React.useEffect(() => {
    if (!projectWikiPendingCommand || !effectiveContextId || !projectWikiTabVisible || activeValue !== "project-wiki")
      return;
    const cmd = projectWikiPendingCommand;
    setProjectWikiPendingCommand(null);
    projectWikiTerminalGridRef.current?.createOrFocusAndRunTerminal({
      label: PROJECT_WIKI_WINDOW_NAME,
      command: cmd,
    });
    // Clear user-triggered ref after delay so check result can apply for future navigations
    const t = setTimeout(() => {
      projectWikiUserTriggeredRef.current = false;
    }, 3000);
    return () => clearTimeout(t);
  }, [projectWikiPendingCommand, effectiveContextId, projectWikiTabVisible, activeValue]);

  // Run pending code review command when Code Review tab is active and grid is ready
  React.useEffect(() => {
    if (!codeReviewPendingCommand || !effectiveContextId || !codeReviewTabVisible || activeValue !== "code-review")
      return;
    const cmd = codeReviewPendingCommand;
    setCodeReviewPendingCommand(null);
    codeReviewTerminalGridRef.current?.createOrFocusAndRunTerminal({
      label: CODE_REVIEW_WINDOW_NAME,
      command: cmd,
    });
    const t = setTimeout(() => {
      codeReviewUserTriggeredRef.current = false;
    }, 3000);
    return () => clearTimeout(t);
  }, [codeReviewPendingCommand, effectiveContextId, codeReviewTabVisible, activeValue]);

  // Agent custom settings (built-ins + custom agents) from terminal_code_agent.json
  const [agentCustomSettings, setAgentCustomSettings] = React.useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);

  // Load agent custom settings and custom agents
  React.useEffect(() => {
    if (isSetupBlocking) return;
    Promise.all([
      functionSettingsApi.get(),
      codeAgentCustomApi.get(),
    ]).then(([settings, customData]) => {
      const saved = (settings as Record<string, unknown>)?.agent_cli as Record<string, unknown> | undefined;
      const allAgents = Array.isArray(customData?.agents) ? customData.agents : [];
      const builtInEntries = allAgents.filter((agent: CodeAgentCustomEntry) =>
        AGENT_OPTIONS.some((option) => option.id === agent.id)
      );
      const builtInSettings = Object.fromEntries(
        builtInEntries.map((agent: CodeAgentCustomEntry) => [agent.id, { cmd: agent.cmd, flags: agent.flags, enabled: agent.enabled !== false }])
      );
      setAgentCustomSettings(builtInSettings);
      const agentId = saved?.center_fix_terminal_default_agent as string | undefined;
      if (agentId) {
        const isBuiltIn = AGENT_OPTIONS.some((a) => a.id === agentId);
        const isCustom = customData?.agents?.some((a: CodeAgentCustomEntry) => a.id === agentId);
        if (isBuiltIn || isCustom) {
          setDefaultAgentId(agentId);
        }
      }
      if (customData?.agents && Array.isArray(customData.agents)) {
        setCustomAgents(customData.agents.filter((a: CodeAgentCustomEntry) =>
          !AGENT_OPTIONS.some((option) => option.id === a.id) && a.label && a.cmd
        ));
      }
    }).catch(() => {});
  }, [isSetupBlocking]);

  const visibleBuiltInAgents = React.useMemo(
    () => AGENT_OPTIONS.filter((agent) => (agentCustomSettings[agent.id]?.enabled ?? true)),
    [agentCustomSettings]
  );
  const visibleCustomAgents = React.useMemo(
    () => customAgents.filter((agent) => agent.enabled !== false),
    [customAgents]
  );
  const terminalQuickOpenAgents = React.useMemo(
    () => [
      ...visibleBuiltInAgents.map((agent) => {
        const custom = agentCustomSettings[agent.id];
        const cmd = custom?.cmd?.trim() || agent.cmd;
        const flags = custom?.flags?.trim() || agent.params || "";
        const parts = [cmd];
        if (flags) parts.push(flags);
        return {
          agent: {
            id: agent.id,
            label: agent.label,
            command: cmd,
            iconType: "built-in",
          } satisfies TerminalPaneAgent,
          command: parts.join(" "),
        };
      }),
      ...visibleCustomAgents.map((agent) => {
        const cmd = agent.cmd.trim();
        const flags = agent.flags?.trim() || "";
        return {
          agent: {
            id: agent.id,
            label: agent.label,
            command: cmd,
            iconType: "custom",
          } satisfies TerminalPaneAgent,
          command: flags ? `${cmd} ${flags}` : cmd,
        };
      }),
    ],
    [agentCustomSettings, visibleBuiltInAgents, visibleCustomAgents]
  );

  const runWhenTerminalGridReady = React.useCallback((
    targetTerminalTabId: string,
    callback: (grid: TerminalGridHandle) => void,
    attemptsLeft = 20,
  ) => {
    const attempt = (remaining: number) => {
      const targetGrid =
        targetTerminalTabId === FIXED_TERMINAL_TAB_VALUE
          ? terminalGridRef.current
          : terminalGridRefs.current[targetTerminalTabId];

      if (targetGrid) {
        callback(targetGrid);
        return;
      }

      if (remaining <= 0) {
        return;
      }

      window.setTimeout(() => {
        attempt(remaining - 1);
      }, 50);
    };

    attempt(attemptsLeft);
  }, []);

  React.useEffect(() => {
    if (
      !effectiveContextId ||
      currentView !== "workspace" ||
      isSetupBlocking ||
      !isTerminalWorkspaceReady ||
      pendingWorkspaceAgentRun?.workspaceId !== effectiveContextId
    ) {
      return;
    }

    const pending = consumeWorkspaceAgentRun(effectiveContextId);
    if (!pending) return;
    const selectedAgent =
      pending.agent
        ? { agent: pending.agent, command: pending.agent.command }
        : terminalQuickOpenAgents.find(({ agent }) => agent.id === defaultAgentId) ??
          terminalQuickOpenAgents[0];
    if (!selectedAgent) return;

    const prompt = pending.prompt.trim();
    const command = prompt
      ? `${selectedAgent.command.trim()} ${shellQuote(prompt)}`
      : selectedAgent.command.trim();

    setActiveFile(null, effectiveContextId);
    setActiveTerminalTab(effectiveContextId, FIXED_TERMINAL_TAB_VALUE);
    setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
    runWhenTerminalGridReady(FIXED_TERMINAL_TAB_VALUE, (grid) => {
      void grid.createAndRunTerminal({
        label: selectedAgent.agent.label,
        command,
        agent: selectedAgent.agent,
      });
    }, 40);
  }, [
    consumeWorkspaceAgentRun,
    currentView,
    defaultAgentId,
    effectiveContextId,
    isSetupBlocking,
    isTerminalWorkspaceReady,
    pendingWorkspaceAgentRun,
    setActiveFile,
    setActiveTerminalTab,
    setUrlParams,
    runWhenTerminalGridReady,
    terminalQuickOpenAgents,
  ]);

  const handleRunReviewInTerminal = React.useCallback(
    (command: string, label: string) => {
      if (!effectiveContextId) return;
      if (activeFilePath) {
        setActiveFile(null, effectiveContextId);
      }
      setActiveTerminalTab(effectiveContextId, FIXED_TERMINAL_TAB_VALUE);
      setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
      runWhenTerminalGridReady(FIXED_TERMINAL_TAB_VALUE, (grid) => {
        void grid.createAndRunTerminal({ label, command });
      });
    },
    [activeFilePath, effectiveContextId, setActiveFile, setActiveTerminalTab, setUrlParams],
  );

  React.useEffect(() => {
    useReviewTerminalRunnerStore.getState().setRunner(handleRunReviewInTerminal);
    return () => {
      useReviewTerminalRunnerStore.getState().setRunner(null);
    };
  }, [handleRunReviewInTerminal]);

  const handleAddAgent = (agentId: string, targetTerminalTabId: string = FIXED_TERMINAL_TAB_VALUE) => {
    if (!effectiveContextId) return;

    if (activeFilePath) {
      setActiveFile(null, effectiveContextId);
    }

    if (targetTerminalTabId !== activeValue) {
      setActiveTerminalTab(effectiveContextId, targetTerminalTabId);
      setUrlParams({ tab: targetTerminalTabId, wikiPage: null });
    }

    const builtIn = AGENT_OPTIONS.find((a) => a.id === agentId);
    if (builtIn) {
      const custom = agentCustomSettings[agentId];
      const cmd = custom?.cmd?.trim() || builtIn.cmd;
      const flags = custom?.flags?.trim() || builtIn.params || "";
      const command = flags ? `${cmd} ${flags}` : cmd;
      runWhenTerminalGridReady(targetTerminalTabId, (grid) => {
        void grid.createAndRunTerminal({
          label: builtIn.label,
          command,
          agent: { id: builtIn.id, label: builtIn.label, command: cmd, iconType: "built-in" },
        });
      });
      return;
    }

    const customAgent = customAgents.find((a) => a.id === agentId);
    if (customAgent) {
      const cmd = customAgent.cmd.trim();
      const flags = customAgent.flags?.trim() || "";
      const command = flags ? `${cmd} ${flags}` : cmd;
      runWhenTerminalGridReady(targetTerminalTabId, (grid) => {
        void grid.createAndRunTerminal({
          label: customAgent.label,
          command,
          agent: { id: customAgent.id, label: customAgent.label, command: cmd, iconType: "custom" },
        });
      });
    }
  };

  const handleSetDefaultAgent = (agentId: string) => {
    setDefaultAgentId(agentId);
    functionSettingsApi.update("agent_cli", "center_fix_terminal_default_agent", agentId).catch(() => {});
  };

  const handleAgentDropdownEnter = () => {
    if (agentDropdownTimeoutRef.current) {
      clearTimeout(agentDropdownTimeoutRef.current);
    }
  };

  const handleAgentDropdownOpen = (tabId: string) => {
    handleAgentDropdownEnter();
    setAgentDropdownTabId(tabId);
  };

  const handleAgentDropdownLeave = () => {
    agentDropdownTimeoutRef.current = setTimeout(() => {
      setAgentDropdownTabId(null);
    }, 150);
  };

  const handleCreateTerminalCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return;
    const nextTab = createTerminalTab(effectiveContextId);
    setActiveTerminalTab(effectiveContextId, nextTab.id);
    setUrlParams({ tab: nextTab.id, wikiPage: null });
    setActiveFile(null, effectiveContextId);
    setAgentDropdownTabId(null);
  }, [effectiveContextId, createTerminalTab, setActiveFile, setActiveTerminalTab, setUrlParams]);

  const handleCloseTerminalCenterTab = React.useCallback((tabId: string) => {
    if (!effectiveContextId || tabId === FIXED_TERMINAL_TAB_VALUE) return;
    terminalGridRefs.current[tabId]?.destroyAllTerminals();
    closeTerminalTab(effectiveContextId, tabId);
    delete terminalGridRefs.current[tabId];
    setMountedTerminalTabsByContext((current) => {
      const mountedTabs = current[effectiveContextId];
      if (!mountedTabs || !mountedTabs.includes(tabId)) {
        return current;
      }

      return {
        ...current,
        [effectiveContextId]: mountedTabs.filter((mountedTabId) => mountedTabId !== tabId),
      };
    });
    if (activeValue === tabId) {
      setUrlParams({ tab: FIXED_TERMINAL_TAB_VALUE, wikiPage: null });
    }
  }, [activeValue, closeTerminalTab, effectiveContextId, setUrlParams]);

  const handleCenterStageTabChange = React.useCallback((val: string) => {
    if (isTerminalCenterTabValue(val)) {
      if (effectiveContextId) {
        setActiveTerminalTab(effectiveContextId, val);
      }
      setUrlParams({ tab: val, wikiPage: null });
      setActiveFile(null, effectiveContextId || undefined);
    } else if (FIXED_TABS.has(val)) {
      setFixedTab(val as FixedTab);
      setActiveFile(null, effectiveContextId || undefined);
    } else {
      setActiveFile(val, effectiveContextId || undefined);
      // Clear tab param when opening a file
      setUrlParams({ tab: null, wikiPage: null });
    }
  }, [effectiveContextId, setActiveFile, setActiveTerminalTab, setFixedTab, setUrlParams]);

  // Additional terminal tabs (excluding the fixed Term tab), in display order.
  // Used to map ⌘2..⌘5 onto the first 4 of these tabs.
  const additionalTerminalTabs = React.useMemo(
    () => visibleTerminalTabs.filter((tab) => tab.id !== FIXED_TERMINAL_TAB_VALUE),
    [visibleTerminalTabs],
  );

  // ⌘0 → Overview tab (only when a workspace/project context is active).
  // `enableOnFormTags: true` so the shortcut still fires when focus is on
  // xterm.js's hidden `<textarea.xterm-helper-textarea>` (without this the
  // hook silently skips the event while any terminal pane is focused).
  useHotkeys(
    "mod+0",
    () => {
      if (!effectiveContextId) return;
      handleCenterStageTabChange("overview");
    },
    { enableOnFormTags: true, preventDefault: true },
    [effectiveContextId, handleCenterStageTabChange],
  );

  // ⌘1 → Fixed Term tab.
  useHotkeys(
    "mod+1",
    () => {
      handleCenterStageTabChange(FIXED_TERMINAL_TAB_VALUE);
    },
    { enableOnFormTags: true, preventDefault: true },
    [handleCenterStageTabChange],
  );

  // ⌘2..⌘5 → first 4 additional terminal tabs in their displayed order.
  // Subsequent tabs (>= 5th additional terminal) intentionally have no shortcut.
  useHotkeys(
    "mod+2",
    () => {
      const target = additionalTerminalTabs[0];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnFormTags: true, preventDefault: true },
    [additionalTerminalTabs, handleCenterStageTabChange],
  );
  useHotkeys(
    "mod+3",
    () => {
      const target = additionalTerminalTabs[1];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnFormTags: true, preventDefault: true },
    [additionalTerminalTabs, handleCenterStageTabChange],
  );
  useHotkeys(
    "mod+4",
    () => {
      const target = additionalTerminalTabs[2];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnFormTags: true, preventDefault: true },
    [additionalTerminalTabs, handleCenterStageTabChange],
  );
  useHotkeys(
    "mod+5",
    () => {
      const target = additionalTerminalTabs[3];
      if (target) handleCenterStageTabChange(target.id);
    },
    { enableOnFormTags: true, preventDefault: true },
    [additionalTerminalTabs, handleCenterStageTabChange],
  );

  const groupedTabItems = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; tabs: TabGroupItem[] }> = [];

    const fileTabsGroup = openFiles
      .filter((file) => !isDiffEditorPath(file.path) && !isConflictResolveEditorPath(file.path))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "file" as const,
        file,
      }));
    if (fileTabsGroup.length > 0) {
      groups.push({ key: "file", label: "File", tabs: fileTabsGroup });
    }

    const diffTabsGroup = openFiles
      .filter((file) => isDiffEditorPath(file.path) && !file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "diff" as const,
        file,
      }));
    if (diffTabsGroup.length > 0) {
      groups.push({ key: "diff", label: "Diff", tabs: diffTabsGroup });
    }

    const reviewTabsGroup = openFiles
      .filter((file) => file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "review-diff" as const,
        file,
      }));
    if (reviewTabsGroup.length > 0) {
      groups.push({ key: "review-diff", label: "Review", tabs: reviewTabsGroup });
    }

    const conflictTabsGroup = openFiles
      .filter((file) => isConflictResolveEditorPath(file.path))
      .map((file) => ({
        id: file.path,
        label: file.name,
        value: file.path,
        kind: "conflict" as const,
        file,
      }));
    if (conflictTabsGroup.length > 0) {
      groups.push({ key: "conflict", label: "Conflict Resolve", tabs: conflictTabsGroup });
    }

    return groups;
  }, [codeReviewTabVisible, effectiveContextId, openFiles, projectWikiTabVisible, visibleTerminalTabs]);

  const orderedGroupedTabItems = React.useMemo(() => {
    const contextOrder = effectiveContextId ? tabGroupOrderByContext[effectiveContextId] : undefined;
    return groupedTabItems.map((group) => applySavedTabGroupOrder(group, contextOrder?.[group.key]));
  }, [effectiveContextId, groupedTabItems, tabGroupOrderByContext]);

  const { currentRepoPath } = useGitStore();
  const sessionDisplay = useReviewSnapshotStore((s) => s.sessionDisplay);

  const renderTabGroupItemContent = React.useCallback((tab: TabGroupItem, isActive: boolean) => {
    const textClassName = cn(
      "min-w-0 truncate text-[13px] font-medium whitespace-nowrap",
      tab.kind === "diff" && "text-emerald-500",
      tab.kind === "review-diff" && "text-blue-400",
      tab.kind === "conflict" && "text-amber-500",
      tab.file?.isPreview && "italic",
    );

    if (tab.kind === "overview") {
      return (
        <>
          <LayoutDashboard className="size-3.5 shrink-0" />
          <span className={textClassName}>{tab.label}</span>
        </>
      );
    }

    if (tab.kind === "wiki") {
      return (
        <>
          <BookOpen className="size-3.5 shrink-0" />
          <span className={textClassName}>{tab.label}</span>
        </>
      );
    }

    if (tab.kind === "project-wiki") {
      return (
        <>
          <TerminalIcon className="size-3.5 shrink-0" />
          <span className={textClassName}>{tab.label}</span>
        </>
      );
    }

    if (tab.kind === "code-review") {
      return (
        <>
          <TerminalIcon className="size-3.5 shrink-0 text-primary" />
          <span className={textClassName}>{tab.label}</span>
        </>
      );
    }

    if (tab.kind === "terminal") {
      return (
        <>
          <TerminalIcon className="size-3.5 shrink-0" />
          <span className={textClassName}>{tab.label}</span>
          {effectiveContextId ? (
            <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.value} />
          ) : null}
        </>
      );
    }

    if (!tab.file) {
      return <span className={textClassName}>{tab.label}</span>;
    }

    return (
      <>
        {tab.kind === "review-diff" ? (
          <FileCheckCorner className="size-3.5 shrink-0 text-blue-400" />
        ) : tab.kind === "diff" ? (
          <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
        ) : tab.kind === "conflict" ? (
          <GitMergeIcon className="size-3.5 shrink-0 text-amber-500" />
        ) : (
          <FileIcon name={tab.file.name} className="size-3.5 shrink-0" />
        )}
        <span className={textClassName}>{tab.file.name}</span>
        <span className="relative ml-auto flex size-4 shrink-0 items-center justify-center">
          {tab.file.isDirty ? <Circle className="size-1.5 fill-current text-muted-foreground" /> : null}
        </span>
      </>
    );
  }, [effectiveContextId]);

  const isTabGroupItemClosable = React.useCallback((tab: TabGroupItem) => {
    return (
      (tab.kind === "terminal" && tab.value !== FIXED_TERMINAL_TAB_VALUE) ||
      tab.kind === "project-wiki" ||
      tab.kind === "code-review" ||
      tab.kind === "file" ||
      tab.kind === "diff" ||
      tab.kind === "review-diff" ||
      tab.kind === "conflict"
    );
  }, []);

  const handleCloseTabGroupItem = React.useCallback((tab: TabGroupItem) => {
    if (tab.kind === "terminal" && tab.value !== FIXED_TERMINAL_TAB_VALUE) {
      handleCloseTerminalCenterTab(tab.value);
      return;
    }

    if (tab.kind === "project-wiki") {
      setProjectWikiCloseConfirmOpen(true);
      return;
    }

    if (tab.kind === "code-review") {
      setCodeReviewCloseConfirmOpen(true);
      return;
    }

    if (tab.file) {
      handleCloseFile(tab.file);
    }
  }, [handleCloseFile, handleCloseTerminalCenterTab]);

  const handleTabGroupDragEnd = React.useCallback((event: DragEndEvent) => {
    if (!effectiveContextId || !event.over || event.active.id === event.over.id) return;

    const activeGroupKey = event.active.data.current?.groupKey;
    const overGroupKey = event.over.data.current?.groupKey;
    if (typeof activeGroupKey !== "string" || activeGroupKey !== overGroupKey) return;

    const group = orderedGroupedTabItems.find((item) => item.key === activeGroupKey);
    if (!group) return;

    const ids = group.tabs.map((tab) => tab.id);
    const oldIndex = ids.indexOf(String(event.active.id));
    const newIndex = ids.indexOf(String(event.over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextOrder = arrayMove(ids, oldIndex, newIndex);
    setTabGroupOrderByContext((current) => {
      const next: TabGroupOrderByContext = {
        ...current,
        [effectiveContextId]: {
          ...(current[effectiveContextId] ?? {}),
          [activeGroupKey]: nextOrder,
        },
      };
      writeTabGroupOrderStorage(next);
      return next;
    });
  }, [effectiveContextId, orderedGroupedTabItems]);

  // Derive workspace and project info for OverviewTab
  const { currentProject, currentWorkspace } = (() => {
    if (!effectiveContextId) return { currentProject: undefined, currentWorkspace: undefined };

    for (const project of projects) {
      const workspace = project.workspaces.find(w => w.id === effectiveContextId);
      if (workspace) {
        return { currentProject: project, currentWorkspace: workspace };
      }
    }

    const project = projects.find(p => p.id === effectiveContextId);
    return { currentProject: project, currentWorkspace: undefined };
  })();

  if (!effectiveContextId) {
    if (currentView === "workspaces") {
      return (
        <main className="h-full overflow-hidden">
          <WorkspacesManagementView />
        </main>
      );
    }
    if (currentView === "skills") {
      return (
        <main className="h-full overflow-hidden">
          <SkillsView />
        </main>
      );
    }
    if (currentView === "terminals") {
      return (
        <main className="h-full overflow-hidden">
          <TerminalManagerView />
        </main>
      );
    }
    if (currentView === "agents") {
      return (
        <main className="h-full overflow-hidden">
          <AgentManagerView />
        </main>
      );
    }
    return (
      <main className="h-full overflow-hidden">
        <WelcomePage
          onAddProject={() => setCreateProjectOpen(true)}
          onConnectAgent={() => {
            router.push('/agents');
          }}
        />
      </main>
    );
  }

  // Show setup progress if active workspace is being initialized
  if (currentSetupProgress && isSetupBlocking) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <WorkspaceSetupProgressView
          progress={currentSetupProgress}
          onFinish={handleFinishSetup}
        />
      </main>
    );
  }



  return (
    <main className="h-full flex flex-col overflow-hidden">
      <Tabs
        value={activeValue}
        onValueChange={handleCenterStageTabChange}
        className="flex-1 flex flex-col gap-0 min-h-0 overflow-hidden"
      >
        {/* Top Tab Bar */}
        <TabsList
          variant="underline"
          className="h-10 w-full justify-start border-b border-sidebar-border px-0 bg-transparent overflow-hidden gap-0 items-stretch py-0! [&_[data-slot=tab-indicator]]:hidden"
        >
          {/* Overview Tab - Fixed, shown when workspace/project is selected */}
          {effectiveContextId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTab
                  value="overview"
                  className="h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!"
                >
                  <LayoutDashboard className="size-3.5" />
                </TabsTab>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="flex items-center gap-2">
                  <span>Overview</span>
                  <ShortcutHint digit={0} />
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {effectiveContextId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTab
                  value="wiki"
                  className="group/wiki relative h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!"
                >
                  <span className="relative size-3.5">
                    <BookOpen
                      className={cn(
                        "size-3.5 absolute inset-0 transition-all duration-200",
                        activeValue === "wiki"
                          ? "group-hover/wiki:opacity-0 group-hover/wiki:scale-50 group-hover/wiki:rotate-[-30deg]"
                          : ""
                      )}
                    />
                    {activeValue === "wiki" && (
                      wikiRefreshing
                        ? <LoaderCircle
                            className="size-3.5 absolute inset-0 animate-spin"
                          />
                        : <RotateCw
                            className={cn("size-3.5 absolute inset-0 transition-all duration-200",
                              "opacity-0 scale-50 rotate-60",
                              "group-hover/wiki:opacity-100 group-hover/wiki:scale-100 group-hover/wiki:rotate-0")}
                          />
                    )}
                  </span>
                  {activeValue === "wiki" && (
                    <span
                      role="button"
                      aria-label="Refresh Wiki"
                      className="absolute inset-0 opacity-0 group-hover/wiki:opacity-100 pointer-events-none group-hover/wiki:pointer-events-auto cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setWikiRefreshing(true);
                        setWikiRefreshTrigger((k) => k + 1);
                        setTimeout(() => setWikiRefreshing(false), 600);
                      }}
                    />
                  )}
                </TabsTab>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {activeValue === "wiki" ? "Refresh Wiki" : "Project Wiki"}
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTab
                value="terminal"
                className="group/terminal relative h-full! pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none border-0!"
              >
                <span className="relative size-3.5 shrink-0">
                  <TerminalIcon
                    className={cn(
                      "size-3.5 absolute inset-0 transition-all duration-200",
                      activeValue === FIXED_TERMINAL_TAB_VALUE
                        ? agentDropdownTabId === FIXED_TERMINAL_TAB_VALUE
                          ? "opacity-0 scale-50 rotate-[-20deg]"
                          : "group-hover/terminal:opacity-0 group-hover/terminal:scale-50 group-hover/terminal:rotate-[-20deg]"
                        : ""
                    )}
                  />
                </span>
                <span className="text-[13px] font-medium whitespace-nowrap">Term</span>
                {effectiveContextId && (
                  <TerminalTabAgentIndicatorWithPanes
                    contextId={effectiveContextId}
                    tabId={FIXED_TERMINAL_TAB_VALUE}
                  />
                )}

                <DropdownMenu
                  open={agentDropdownTabId === FIXED_TERMINAL_TAB_VALUE}
                  onOpenChange={(open) => {
                    if (!open) {
                      setAgentDropdownTabId(null);
                    } else {
                      handleAgentDropdownOpen(FIXED_TERMINAL_TAB_VALUE);
                    }
                  }}
                  modal={false}
                >
                  <DropdownMenuTrigger asChild>
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-sm hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-all",
                        activeValue === FIXED_TERMINAL_TAB_VALUE
                          ? agentDropdownTabId === FIXED_TERMINAL_TAB_VALUE
                            ? "opacity-100 scale-100 rotate-0 pointer-events-auto"
                            : "opacity-0 scale-50 rotate-60 pointer-events-none group-hover/terminal:opacity-100 group-hover/terminal:scale-100 group-hover/terminal:rotate-0 group-hover/terminal:pointer-events-auto"
                          : "hidden"
                      )}
                      style={{ left: "12px" }}
                      onMouseEnter={() => handleAgentDropdownOpen(FIXED_TERMINAL_TAB_VALUE)}
                      onMouseLeave={handleAgentDropdownLeave}
                    >
                      <Plus className="size-4" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-64"
                    onMouseEnter={handleAgentDropdownEnter}
                    onMouseLeave={handleAgentDropdownLeave}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <DropdownMenuItem onClick={handleCreateTerminalCenterTab} className="flex items-center">
                      <TerminalIcon className="size-4" />
                      <span className="flex-1">New Terminal Tab</span>
                      <ShortcutHint digit="T" />
                    </DropdownMenuItem>
                    {(visibleBuiltInAgents.length > 0 || visibleCustomAgents.length > 0) && (
                      <DropdownMenuSeparator />
                    )}
                    {visibleBuiltInAgents.map((opt) => (
                      <DropdownMenuItem key={opt.id} className="group/agent-item flex items-center" onClick={() => { handleAddAgent(opt.id, FIXED_TERMINAL_TAB_VALUE); setAgentDropdownTabId(null); }}>
                        <AgentIcon registryId={opt.id} name={opt.label} size={16} />
                        <span className="flex-1">{opt.label}</span>
                        <button
                          className={cn(
                            "size-5 flex items-center justify-center rounded-sm shrink-0 transition-opacity",
                            defaultAgentId === opt.id
                              ? "opacity-100"
                              : "opacity-0 group-hover/agent-item:opacity-100 hover:bg-muted-foreground/20"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefaultAgent(opt.id);
                          }}
                        >
                          <Star className={cn("size-3.5", defaultAgentId === opt.id ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground")} />
                        </button>
                      </DropdownMenuItem>
                    ))}
                    {visibleCustomAgents.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        {visibleCustomAgents.map((agent) => (
                          <DropdownMenuItem key={agent.id} className="group/agent-item flex items-center" onClick={() => { handleAddAgent(agent.id, FIXED_TERMINAL_TAB_VALUE); setAgentDropdownTabId(null); }}>
                            <Bot className="size-4 text-muted-foreground" />
                            <span className="flex-1">{agent.label}</span>
                            <button
                              className={cn(
                                "size-5 flex items-center justify-center rounded-sm shrink-0 transition-opacity",
                                defaultAgentId === agent.id
                                  ? "opacity-100"
                                  : "opacity-0 group-hover/agent-item:opacity-100 hover:bg-muted-foreground/20"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetDefaultAgent(agent.id);
                              }}
                            >
                              <Star className={cn("size-3.5", defaultAgentId === agent.id ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground")} />
                            </button>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TabsTab>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="flex items-center gap-2">
                <span>Term</span>
                <ShortcutHint digit={1} />
              </div>
            </TooltipContent>
          </Tooltip>

          {visibleTerminalTabs
            .filter((tab) => tab.id !== FIXED_TERMINAL_TAB_VALUE)
            .map((tab, index) => {
              const shortcutDigit = index + 2;
              const hasShortcut = index < CENTER_TERMINAL_SHORTCUT_LIMIT;

              return (
                <Tooltip key={tab.id}>
                  <TooltipTrigger asChild>
                    <TabsTab
                      value={tab.id}
                      className="group/term-tab relative !h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
                    >
                      <span className="relative size-3.5 shrink-0">
                        <TerminalIcon
                          className={cn(
                            "size-3.5 absolute inset-0 transition-all duration-200",
                            agentDropdownTabId === tab.id
                              ? "opacity-0 scale-50 rotate-[-20deg]"
                              : activeValue === tab.id
                                ? "group-hover/term-tab:opacity-0 group-hover/term-tab:scale-50 group-hover/term-tab:rotate-[-20deg]"
                                : ""
                          )}
                        />
                      </span>
                      <span className="text-[13px] font-medium whitespace-nowrap">{tab.title}</span>
                      {effectiveContextId && <TerminalTabAgentIndicatorWithPanes contextId={effectiveContextId} tabId={tab.id} />}
                      <DropdownMenu
                        open={agentDropdownTabId === tab.id}
                        onOpenChange={(open) => {
                          if (!open) {
                            setAgentDropdownTabId(null);
                          } else {
                            handleAgentDropdownOpen(tab.id);
                          }
                        }}
                        modal={false}
                      >
                        <DropdownMenuTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "absolute left-3 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-all hover:bg-muted-foreground/20 hover:text-foreground",
                              agentDropdownTabId === tab.id
                                ? "opacity-100 scale-100 rotate-0"
                                : activeValue === tab.id
                                  ? "opacity-0 scale-50 rotate-60 pointer-events-none group-hover/term-tab:opacity-100 group-hover/term-tab:scale-100 group-hover/term-tab:rotate-0 group-hover/term-tab:pointer-events-auto"
                                  : "opacity-0 scale-50 rotate-60 pointer-events-none"
                            )}
                            onClick={(e) => e.stopPropagation()}
                            onMouseEnter={() => handleAgentDropdownOpen(tab.id)}
                            onMouseLeave={handleAgentDropdownLeave}
                          >
                            <Plus className="size-4" />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-64"
                          onMouseEnter={() => handleAgentDropdownOpen(tab.id)}
                          onMouseLeave={handleAgentDropdownLeave}
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <DropdownMenuItem onClick={handleCreateTerminalCenterTab} className="flex items-center">
                            <TerminalIcon className="size-4" />
                            <span className="flex-1">New Terminal Tab</span>
                            <ShortcutHint digit="T" />
                          </DropdownMenuItem>
                          {(visibleBuiltInAgents.length > 0 || visibleCustomAgents.length > 0) && (
                            <DropdownMenuSeparator />
                          )}
                          {visibleBuiltInAgents.map((opt) => (
                            <DropdownMenuItem key={opt.id} className="group/agent-item flex items-center" onClick={() => { handleAddAgent(opt.id, tab.id); setAgentDropdownTabId(null); }}>
                              <AgentIcon registryId={opt.id} name={opt.label} size={16} />
                              <span className="flex-1">{opt.label}</span>
                              <button
                                className={cn(
                                  "size-5 flex items-center justify-center rounded-sm shrink-0 transition-opacity",
                                  defaultAgentId === opt.id
                                    ? "opacity-100"
                                    : "opacity-0 group-hover/agent-item:opacity-100 hover:bg-muted-foreground/20"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetDefaultAgent(opt.id);
                                }}
                              >
                                <Star className={cn("size-3.5", defaultAgentId === opt.id ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground")} />
                              </button>
                            </DropdownMenuItem>
                          ))}
                          {visibleCustomAgents.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              {visibleCustomAgents.map((agent) => (
                                <DropdownMenuItem key={agent.id} className="group/agent-item flex items-center" onClick={() => { handleAddAgent(agent.id, tab.id); setAgentDropdownTabId(null); }}>
                                  <Bot className="size-4 text-muted-foreground" />
                                  <span className="flex-1">{agent.label}</span>
                                  <button
                                    className={cn(
                                      "size-5 flex items-center justify-center rounded-sm shrink-0 transition-opacity",
                                      defaultAgentId === agent.id
                                        ? "opacity-100"
                                        : "opacity-0 group-hover/agent-item:opacity-100 hover:bg-muted-foreground/20"
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSetDefaultAgent(agent.id);
                                    }}
                                  >
                                    <Star className={cn("size-3.5", defaultAgentId === agent.id ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground")} />
                                  </button>
                                </DropdownMenuItem>
                              ))}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div
                        className={cn(
                          "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center rounded-r-sm bg-linear-to-l from-muted/25 to-transparent pl-2.5 pr-1.5 backdrop-blur-[4px] transition-opacity duration-200",
                          activeValue === tab.id
                            ? "opacity-0 group-hover/term-tab:opacity-100"
                            : "opacity-0 pointer-events-none"
                        )}
                      >
                        <span
                          role="button"
                          aria-label={`Close ${tab.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseTerminalCenterTab(tab.id);
                          }}
                          className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground cursor-pointer"
                        >
                          <X className="size-3" />
                        </span>
                      </div>
                    </TabsTab>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="flex items-center gap-2">
                      <span>{tab.title}</span>
                      {hasShortcut ? <ShortcutHint digit={shortcutDigit} /> : null}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}

          <div ref={scrollableTabsRef} className="flex min-w-0 flex-1 overflow-x-auto no-scrollbar">
          {/* Project Wiki Tab - shown when wiki gen runs or tmux window exists */}
          {effectiveContextId && projectWikiTabVisible && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTab
                  value="project-wiki"
                  className="group/pw relative !h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
                >
                  <TerminalIcon className="size-3.5 shrink-0" />
                  <span className="text-[13px] font-medium text-pretty">Project Wiki</span>
                  <div
                    className={cn(
                      "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center pl-2 pr-1.5 backdrop-blur-[4px] [mask-image:linear-gradient(to_right,transparent,black_40%)] transition-opacity duration-200",
                      "opacity-0 group-hover/pw:opacity-100"
                    )}
                  >
                    <span
                      role="button"
                      aria-label="Close Project Wiki tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectWikiCloseConfirmOpen(true);
                      }}
                      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground cursor-pointer"
                    >
                      <X className="size-3" />
                    </span>
                  </div>
                </TabsTab>
              </TooltipTrigger>
              <TooltipContent side="bottom">Project Wiki Terminal</TooltipContent>
            </Tooltip>
          )}

          {/* Code Review Tab - shown when code review runs or tmux window exists */}
          {effectiveContextId && codeReviewTabVisible && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTab
                  value="code-review"
                  className="group/cr relative !h-full pl-4 pr-4 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-2 grow-0 shrink-0 justify-start rounded-none !border-0"
                >
                  <TerminalIcon className="size-3.5 shrink-0 text-blue-500" />
                  <span className="text-[13px] font-medium text-pretty">Code Review</span>
                  <div
                    className={cn(
                      "absolute right-0 top-1/2 z-10 flex h-full -translate-y-1/2 items-center pl-2 pr-1.5 backdrop-blur-[4px] [mask-image:linear-gradient(to_right,transparent,black_40%)] transition-opacity duration-200",
                      "opacity-0 group-hover/cr:opacity-100"
                    )}
                  >
                    <span
                      role="button"
                      aria-label="Close Code Review tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCodeReviewCloseConfirmOpen(true);
                      }}
                      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground cursor-pointer"
                    >
                      <X className="size-3" />
                    </span>
                  </div>
                </TabsTab>
              </TooltipTrigger>
              <TooltipContent side="bottom">Code Review Terminal</TooltipContent>
            </Tooltip>
          )}

          {/* Open File Tabs */}
          {openFiles.map((file) => {
            const isDiff = isDiffEditorPath(file.path);
            const isReviewDiff = file.path.startsWith(EDITOR_REVIEW_DIFF_PREFIX);
            const isConflictResolver = isConflictResolveEditorPath(file.path);
            const displayPath = getEditorSourcePath(file.path);

            return (
              <Tooltip key={file.path}>
                <TooltipTrigger asChild>
                  <TabsTab
                    value={file.path}
                    className="!h-full pl-2 pr-1 data-active:bg-muted/40 data-active:text-foreground text-muted-foreground hover:bg-muted/50 transition-colors gap-1.5 group grow-0 shrink-0 justify-start rounded-none !border-0"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveFile(file.path, effectiveContextId || undefined);
                      setTabContextMenu({ x: e.clientX, y: e.clientY, filePath: file.path });
                    }}
                    onDoubleClick={() => {
                      if (file.isPreview) {
                        pinFile(file.path, effectiveContextId || undefined);
                      }
                    }}
                  >
                    {isReviewDiff ? (
                      <FileCheckCorner className="size-3.5 shrink-0 text-blue-400" />
                    ) : isDiff ? (
                      <GitCompare className="size-3.5 shrink-0 text-emerald-500" />
                    ) : isConflictResolver ? (
                      <GitMergeIcon className="size-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <FileIcon name={file.name} className="size-3.5 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-[13px] font-medium whitespace-nowrap",
                        isReviewDiff && "text-blue-400",
                        isDiff && !isReviewDiff && "text-emerald-500",
                        isConflictResolver && "text-amber-500",
                        file.isPreview && "italic"
                      )}
                    >
                      {file.name}
                    </span>
                    {/* Status Icons Slot (Dirty dot / Close button) */}
                    <div className="relative size-4 flex items-center justify-center shrink-0 ml-0">
                      {/* Dirty indicator: Shown when dirty, hidden on hover so X check can take over */}
                      {file.isDirty && (
                        <Circle className="size-1.5 fill-current text-muted-foreground group-hover:hidden" />
                      )}
                      {/* Close button: Absolutely positioned to not affect width, shown on hover */}
                      <span
                        role="button"
                        aria-label="Close tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseFile(file);
                        }}
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-muted-foreground/20 rounded-sm cursor-pointer transition-all ease-out duration-200"
                      >
                        <X className="size-3" />
                      </span>
                    </div>
                  </TabsTab>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-md break-all">
                  {displayPath}
                  {isReviewDiff && sessionDisplay && (sessionDisplay.sessionTitle || sessionDisplay.revisionLabel) && (
                    <span className="text-background/70"> / {[sessionDisplay.sessionTitle, sessionDisplay.revisionLabel].filter(Boolean).join(" - ")}</span>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
          </div>
          <div className="sticky right-0 z-20 flex h-full shrink-0 items-stretch border-l border-sidebar-border/70 bg-background/95 backdrop-blur-sm">
            <Popover open={tabGroupPopoverOpen} onOpenChange={setTabGroupPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-full rounded-none border-0 px-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  aria-label="Open tab groups"
                >
                  <List className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)] border-border/70 bg-popover/68 p-2 shadow-xl backdrop-blur-2xl">
                {orderedGroupedTabItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-5 text-center">
                    <Inbox className="size-8 text-muted-foreground/50" />
                    <div className="text-sm font-medium text-muted-foreground">No open tabs</div>
                    <p className="max-w-[200px] text-xs text-muted-foreground/70">
                      Only non-pinned tabs such as files, diffs, and conflict resolves will appear here.
                    </p>
                  </div>
                ) : (
                <div className="scrollbar-on-hover max-h-[420px] overflow-auto">
                  <div className="grid min-w-max grid-flow-col auto-cols-max gap-2">
                    {orderedGroupedTabItems.map((group) => (
                      <section
                        key={group.key}
                        className="flex max-h-[396px] min-h-0 w-fit flex-col overflow-hidden rounded-md border border-border/45 bg-muted/45 backdrop-blur-md dark:bg-background/72"
                      >
                        <header className="sticky top-0 z-10 h-10 shrink-0 px-3">
                          <div className="flex h-full items-center text-[11px] font-semibold tracking-wide text-muted-foreground">
                            {group.label}
                          </div>
                        </header>
                        <div className="scrollbar-on-hover min-h-0 flex-1 w-full space-y-1 overflow-y-auto p-2 pt-0">
                          <DndContext
                            sensors={tabGroupDndSensors}
                            collisionDetection={closestCenter}
                            modifiers={[restrictToVerticalAxis]}
                            onDragEnd={handleTabGroupDragEnd}
                          >
                            <SortableContext
                              items={group.tabs.map((tab) => tab.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="w-fit">
                                {group.tabs.map((tab) => (
                                  <SortableTabGroupItem
                                    key={tab.id}
                                    groupKey={group.key}
                                    tab={tab}
                                    isActive={activeValue === tab.value}
                                    closable={isTabGroupItemClosable(tab)}
                                    onSelect={() => {
                                      handleCenterStageTabChange(tab.value);
                                      setTabGroupPopoverOpen(false);
                                    }}
                                    onClose={() => handleCloseTabGroupItem(tab)}
                                  >
                                    {renderTabGroupItemContent(tab, activeValue === tab.value)}
                                  </SortableTabGroupItem>
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </TabsList>

        {/* Main Content Area - Panels are direct children of Tabs flex-col container */}
        {/*
          Terminal is kept mounted and uses CSS visibility to avoid re-initialization.
          This prevents terminal sessions from restarting when switching tabs.
        */}
        {mountedTerminalTabs.includes(FIXED_TERMINAL_TAB_VALUE) && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0",
              activeValue !== FIXED_TERMINAL_TAB_VALUE && "hidden"
            )}
          >
            <div className="h-full w-full">
              <TerminalGrid
                ref={terminalGridRef}
                workspaceId={effectiveContextId || ""}
                quickOpenAgents={terminalQuickOpenAgents}
                className="h-full"
                isProjectContext={currentView === "project"}
                onNewTerminalTab={handleCreateTerminalCenterTab}
              />
            </div>
          </div>
        )}

        {effectiveContextId && visibleTerminalTabs
          .filter((tab) => tab.id !== FIXED_TERMINAL_TAB_VALUE && mountedTerminalTabs.includes(tab.id))
          .map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "flex-1 min-h-0 min-w-0",
                activeValue !== tab.id && "hidden"
              )}
            >
              <div className="h-full w-full">
                <TerminalGrid
                  ref={(instance) => {
                    terminalGridRefs.current[tab.id] = instance;
                  }}
                  workspaceId={effectiveContextId}
                  terminalTabId={tab.id}
                  quickOpenAgents={terminalQuickOpenAgents}
                  className="h-full"
                  isProjectContext={currentView === "project"}
                  onNewTerminalTab={handleCreateTerminalCenterTab}
                />
              </div>
            </div>
          ))}

        {/* Project Wiki Tab Content - Same TerminalGrid/Mosaic UI, separate panes from main Terminal */}
        {effectiveContextId && projectWikiTabVisible && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0",
              activeValue !== "project-wiki" && "hidden"
            )}
          >
            <TerminalGrid
              ref={projectWikiTerminalGridRef}
              workspaceId={effectiveContextId}
              scope="project-wiki"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
              onNewTerminalTab={handleCreateTerminalCenterTab}
            />
          </div>
        )}

        {/* Code Review Tab Content - Same TerminalGrid/Mosaic UI, separate panes from main Terminal */}
        {effectiveContextId && codeReviewTabVisible && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0",
              activeValue !== "code-review" && "hidden"
            )}
          >
            <TerminalGrid
              ref={codeReviewTerminalGridRef}
              workspaceId={effectiveContextId}
              scope="code-review"
              toolbarActions={{ split: false, maximize: false, close: false }}
              className="h-full"
              onNewTerminalTab={handleCreateTerminalCenterTab}
            />
          </div>
        )}

        {/* Overview Tab Content - CSS visibility controlled like terminal */}
        {effectiveContextId && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0 overflow-auto",
              activeValue !== "overview" && "hidden"
            )}
          >
            <OverviewTab
              contextId={effectiveContextId}
              projectId={currentProject?.id}
              projectName={currentProject?.name}
              projectPath={currentProject?.mainFilePath}
              workspaceName={currentWorkspace?.displayName ?? currentWorkspace?.name}
              workspacePath={currentWorkspace?.localPath}
              gitBranch={currentBranch ?? undefined}
              createdAt={currentWorkspace?.createdAt}
              isProjectOnly={!currentWorkspace}
              githubIssue={currentWorkspace?.githubIssue}
              priority={currentWorkspace?.priority}
              workflowStatus={currentWorkspace?.workflowStatus}
              labels={currentWorkspace?.labels}
            />
          </div>
        )}

        {/* Wiki Tab Content */}
        {effectiveContextId && (
          <div
            className={cn(
              "flex-1 min-h-0 min-w-0 overflow-hidden",
              activeValue !== "wiki" && "hidden"
            )}
          >
            <WikiTab
              contextId={effectiveContextId}
              effectivePath={currentProject?.mainFilePath || ""}
              projectName={currentProject?.name}
              refreshTrigger={wikiRefreshTrigger}
              terminalGridRef={terminalGridRef}
              onSwitchToTerminal={() => setFixedTab("terminal")}
              onSwitchToProjectWikiAndRun={(command) => {
                if (!effectiveContextId) return;
                projectWikiUserTriggeredRef.current = true;
                setProjectWikiPendingCommand(command);
                setProjectWikiVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
                setFixedTab("project-wiki");
              }}
              onProjectWikiReplaceAndRun={async (command) => {
                if (!effectiveContextId) return;
                try {
                  await systemApi.killProjectWikiWindow(effectiveContextId);
                  projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(PROJECT_WIKI_WINDOW_NAME);
                  projectWikiUserTriggeredRef.current = true;
                  setProjectWikiPendingCommand(command);
                  setProjectWikiVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
                  setFixedTab("project-wiki");
                  toastManager.add({
                    title: "Wiki generation started",
                    description: "Switched to Project Wiki tab. Check progress there.",
                    type: "info",
                  });
                } catch (err) {
                  setProjectWikiPendingCommand(null);
                  toastManager.add({
                    title: "Failed to close previous terminal",
                    description: err instanceof Error ? err.message : "Unknown error",
                    type: "error",
                  });
                }
              }}
              wikiPage={wikiPageFromUrl ?? undefined}
              onWikiPageChange={setWikiPage}
              isWikiTabActive={activeValue === "wiki"}
            />
          </div>
        )}

        {openFiles.map((file) => (
          <TabsPanel
            key={file.path}
            value={file.path}
            keepMounted
            className="flex-1 min-h-0 min-w-0"
          >
            {isDiffEditorPath(file.path) && currentRepoPath ? (
                <ReviewContextProvider
                  workspaceId={workspaceId}
                  filePath={getEditorSourcePath(file.path)}
                  fileSnapshotGuid={
                    file.path.startsWith('review-diff://')
                      ? file.path.slice('review-diff://'.length).split('/')[0] || null
                      : null
                  }
                >
                  <DiffViewer
                    repoPath={currentRepoPath}
                    filePath={getEditorSourcePath(file.path)}
                    originalPath={file.path}
                  />
                </ReviewContextProvider>
              ) : isConflictResolveEditorPath(file.path) ? (
              <GitConflictResolver />
            ) : (
              <FileViewer file={file} className="flex-1" />
            )}
          </TabsPanel>
        ))}
      </Tabs>

      <DropdownMenu
        open={!!tabContextMenu}
        onOpenChange={(open) => {
          if (!open) setTabContextMenu(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-hidden
            className="fixed size-0 pointer-events-none"
            style={{
              left: tabContextMenu?.x ?? -9999,
              top: tabContextMenu?.y ?? -9999,
            }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="w-52">
          {(() => {
            const target = openFiles.find((f) => f.path === tabContextMenu?.filePath);
            if (!target) return null;
            const targetIndex = openFiles.findIndex((f) => f.path === target.path);
            const leftFiles = openFiles.slice(0, targetIndex);
            const rightFiles = openFiles.slice(targetIndex + 1);
            const basePath = currentWorkspace?.localPath || currentProject?.mainFilePath;
            const relativePath = getRelativePath(target.path, basePath);

            return (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    handleCloseFile(target);
                    setTabContextMenu(null);
                  }}
                >
                  Close
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(openFiles.filter((f) => f.path !== target.path));
                    setTabContextMenu(null);
                  }}
                  disabled={openFiles.length <= 1}
                >
                  Close Others
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(leftFiles);
                    setTabContextMenu(null);
                  }}
                  disabled={leftFiles.length === 0}
                >
                  Close All Left
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(rightFiles);
                    setTabContextMenu(null);
                  }}
                  disabled={rightFiles.length === 0}
                >
                  Close All Right
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    closeFilesSafely(openFiles);
                    setTabContextMenu(null);
                  }}
                  disabled={openFiles.length === 0}
                >
                  Close All
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await copyToClipboard(target.path, "Path copied");
                    setTabContextMenu(null);
                  }}
                >
                  Copy Path
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await copyToClipboard(relativePath, "Relative path copied");
                    setTabContextMenu(null);
                  }}
                >
                  Copy Relative Path
                </DropdownMenuItem>
              </>
            );
          })()}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Project Wiki Tab Close Confirmation */}
      <Dialog open={projectWikiCloseConfirmOpen} onOpenChange={(open) => !open && setProjectWikiCloseConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Project Wiki terminal?</DialogTitle>
            <DialogDescription>
              Any running wiki generation will be stopped. You can start a new generation from the Wiki tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-4">
            <Button variant="outline" className="cursor-pointer" onClick={() => setProjectWikiCloseConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
                if (effectiveContextId) {
                  try {
                    await systemApi.killProjectWikiWindow(effectiveContextId);
                    projectWikiTerminalGridRef.current?.removeTerminalByTmuxWindowName(PROJECT_WIKI_WINDOW_NAME);
                    setProjectWikiVisibleMap(prev => ({ ...prev, [effectiveContextId]: false }));
                    setFixedTab("terminal");
                  } catch (err) {
                    toastManager.add({
                      title: "Failed to close terminal",
                      description: err instanceof Error ? err.message : "Unknown error",
                      type: "error",
                    });
                  }
                }
                setProjectWikiCloseConfirmOpen(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Code Review Close Confirm Dialog */}
      <Dialog open={codeReviewCloseConfirmOpen} onOpenChange={(open) => !open && setCodeReviewCloseConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Code Review terminal?</DialogTitle>
            <DialogDescription>
              Any running code review will be stopped. You can start a new review from the Changes panel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-4">
            <Button variant="outline" className="cursor-pointer" onClick={() => setCodeReviewCloseConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
                if (effectiveContextId) {
                  try {
                    await systemApi.killCodeReviewWindow(effectiveContextId);
                    codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
                    setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: false }));
                    setFixedTab("terminal");
                  } catch (err) {
                    toastManager.add({
                      title: "Failed to close terminal",
                      description: err instanceof Error ? err.message : "Unknown error",
                      type: "error",
                    });
                  }
                }
                setCodeReviewCloseConfirmOpen(false);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Code Review Dialog */}
      {effectiveContextId && (
        <CodeReviewDialog
          open={isCodeReviewDialogOpen}
          onOpenChange={setCodeReviewDialogOpen}
          workspaceId={effectiveContextId}
          projectName={currentProject?.name}
          workspacePath={currentWorkspace?.localPath || currentProject?.mainFilePath || ""}
          projectMainPath={currentProject?.mainFilePath}
          currentBranch={currentBranch ?? undefined}
          onStartTerminalMode={(command) => {
            if (!effectiveContextId) return;
            codeReviewUserTriggeredRef.current = true;
            setCodeReviewPendingCommand(command);
            setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
            setFixedTab("code-review");
          }}
          onReplaceTerminalAndRun={async (command) => {
            if (!effectiveContextId) return;
            try {
              await systemApi.killCodeReviewWindow(effectiveContextId);
              codeReviewTerminalGridRef.current?.removeTerminalByTmuxWindowName(CODE_REVIEW_WINDOW_NAME);
              codeReviewUserTriggeredRef.current = true;
              setCodeReviewPendingCommand(command);
              setCodeReviewVisibleMap(prev => ({ ...prev, [effectiveContextId]: true }));
              setFixedTab("code-review");
              toastManager.add({
                title: "Code review started",
                description: "Switched to Code Review tab. Check progress there.",
                type: "info",
              });
            } catch (err) {
              setCodeReviewPendingCommand(null);
              toastManager.add({
                title: "Failed to close previous terminal",
                description: err instanceof Error ? err.message : "Unknown error",
                type: "error",
              });
            }
          }}
        />
      )}

      {/* Unsaved Changes Dialog */}
      <Dialog
        open={!!fileToClose}
        onOpenChange={(open) => !open && setFileToClose(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              &quot;{fileToClose?.name}&quot; has unsaved changes. Do you want to discard
              them?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileToClose(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmClose}>
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </main>
  );
};

export default CenterStage;
