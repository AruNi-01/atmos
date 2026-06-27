"use client";

import React from "react";
import {
  KeyboardSensor,
  PointerSensor,
  Tabs,
  arrayMove,
  cn,
  sortableKeyboardCoordinates,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@workspace/ui";
import { useEditor, type TLShapeId } from "tldraw";

import type { ReviewTarget } from "@/api/ws-api";
import {
  CenterStageTabGroupPopover,
  applySavedTabGroupOrder,
  type TabGroupItem,
} from "@/app-shell/center-stage-tabs";
import {
  CenterStageOverviewTab,
  CenterStageScrollableTabs,
  CenterStageStickyTabActions,
  CenterStageSurfaceContentTab,
  CenterStageTabGroupItemContent,
  CenterStageTabList,
  type CenterStageSurfaceTabVariant,
} from "@/app-shell/center-stage-shared-tabs";
import {
  CenterStageFileTabContextMenu,
  type FileTabContextMenuState,
} from "@/app-shell/center-stage-file-menu";
import { FileViewer } from "@/features/editor/components/FileViewer";
import { useEditorStore, type OpenFile } from "@/features/editor/store/use-editor-store";
import { useGitStore } from "@/features/git/store/use-git-store";
import { ChangesCodeView } from "@/features/diff/components/ChangesCodeView";
import { DiffViewer } from "@/features/diff/components/DiffViewer";
import { ReviewCodeView } from "@/features/diff/components/ReviewCodeView";
import { ReviewContextProvider } from "@/features/diff/components/review/ReviewContextProvider";
import type { AgentFixContextRef } from "@/features/agent-fix/types";
import {
  CANVAS_CENTER_OVERVIEW_TAB_ID,
  ensureCanvasCenterOverviewTab,
  getCanvasCenterTabSubtitle,
  removeCanvasCenterTab,
  type CanvasCenterTab,
} from "@/features/canvas/lib/canvas-center-tabs";
import { clientPointToLocalElementPoint } from "@/shared/lib/dom-position";
import {
  CANVAS_WIDGET_SHAPE_TYPE,
  getCanvasContextId,
  sanitizeCanvasWidgetSource,
  type CanvasContextRef,
  type CanvasWidgetSourceRef,
  type CanvasWidgetShape,
} from "@/features/canvas/lib/canvas-widget-shape";
import { CanvasContextOverview } from "@/features/canvas/components/widgets/CanvasContextOverview";

type CanvasCenterWidgetSource = Extract<CanvasWidgetSourceRef, { type: "center" }>;
type ClosableCanvasCenterTab = Exclude<CanvasCenterTab, { kind: "overview" }>;
const EMPTY_OPEN_FILES: OpenFile[] = [];

function isClosableCanvasCenterTab(tab: CanvasCenterTab): tab is ClosableCanvasCenterTab {
  return tab.kind !== "overview";
}

function reviewTargetFromContext(context: CanvasContextRef): ReviewTarget | null {
  if (context.contextScope === "project" && context.projectId) {
    return { kind: "project", projectId: context.projectId };
  }
  if (context.contextScope === "workspace" && context.workspaceId) {
    return { kind: "workspace", workspaceId: context.workspaceId };
  }
  return null;
}

export function CanvasCenterWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "center") {
    return null;
  }
  return <CanvasCenterWidgetBody shapeId={shape.id as TLShapeId} source={source} />;
}

function CanvasCenterWidgetBody({
  shapeId,
  source,
}: {
  shapeId: TLShapeId;
  source: CanvasCenterWidgetSource;
}) {
  const editor = useEditor();
  const contextId = React.useMemo(() => getCanvasContextId(source.context), [source.context]);
  const selectOpenFiles = React.useCallback(
    (state: ReturnType<typeof useEditorStore.getState>) =>
      contextId ? state.getOpenFiles(contextId) : EMPTY_OPEN_FILES,
    [contextId],
  );
  const workspaceOpenFiles = useEditorStore(selectOpenFiles);
  const [tabGroupPopoverOpen, setTabGroupPopoverOpen] = React.useState(false);
  const [tabContextMenu, setTabContextMenu] = React.useState<FileTabContextMenuState>(null);
  const [tabGroupOrder, setTabGroupOrder] = React.useState<Record<string, string[]>>({});
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const tabGroupDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const tabs = React.useMemo(() => ensureCanvasCenterOverviewTab(source.tabs), [source.tabs]);
  const activeTabId = React.useMemo(() => {
    if (source.activeTabId && tabs.some((tab) => tab.id === source.activeTabId)) {
      return source.activeTabId;
    }
    return CANVAS_CENTER_OVERVIEW_TAB_ID;
  }, [source.activeTabId, tabs]);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;
  const fileTabs = React.useMemo(
    () => tabs.filter((tab): tab is Extract<CanvasCenterTab, { kind: "file" }> => tab.kind === "file"),
    [tabs],
  );
  const tabContextMenuFiles = React.useMemo(
    () =>
      fileTabs.map((tab) =>
        workspaceOpenFiles.find((file) => file.path === tab.path) ??
        createCanvasCenterMenuOpenFile(tab),
      ),
    [fileTabs, workspaceOpenFiles],
  );

  const updateCenterSource = React.useCallback(
    (nextSource: typeof source) => {
      editor.updateShape({
        id: shapeId,
        type: CANVAS_WIDGET_SHAPE_TYPE,
        props: {
          source: sanitizeCanvasWidgetSource(nextSource),
          lastActivatedAt: Date.now(),
        },
      });
    },
    [editor, shapeId],
  );

  React.useEffect(() => {
    if (source.tabs === tabs && source.activeTabId === activeTabId) {
      return;
    }
    updateCenterSource({
      ...source,
      tabs,
      activeTabId,
    });
  }, [activeTabId, source, tabs, updateCenterSource]);

  const handleTabChange = React.useCallback(
    (value: string) => {
      if (!tabs.some((tab) => tab.id === value)) {
        return;
      }
      updateCenterSource({
        ...source,
        tabs,
        activeTabId: value,
      });
    },
    [source, tabs, updateCenterSource],
  );

  const closeTab = React.useCallback(
    (tab: CanvasCenterTab) => {
      if (tab.kind === "overview") {
        return;
      }
      const next = removeCanvasCenterTab(tabs, tab.id, activeTabId);
      const nextTabs = ensureCanvasCenterOverviewTab(next.tabs);
      updateCenterSource({
        ...source,
        tabs: nextTabs,
        activeTabId: next.activeTabId ?? CANVAS_CENTER_OVERVIEW_TAB_ID,
      });
    },
    [activeTabId, source, tabs, updateCenterSource],
  );

  const closeFileTabsSafely = React.useCallback(
    (files: OpenFile[]) => {
      const pathsToClose = new Set(files.map((file) => file.path));
      if (pathsToClose.size === 0) {
        return;
      }

      let nextTabs = tabs;
      let nextActiveTabId = activeTabId;
      for (const tab of fileTabs) {
        if (!pathsToClose.has(tab.path)) {
          continue;
        }
        const next = removeCanvasCenterTab(nextTabs, tab.id, nextActiveTabId);
        nextTabs = ensureCanvasCenterOverviewTab(next.tabs);
        nextActiveTabId = next.activeTabId ?? CANVAS_CENTER_OVERVIEW_TAB_ID;
      }

      updateCenterSource({
        ...source,
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
      });
    },
    [activeTabId, fileTabs, source, tabs, updateCenterSource],
  );

  const closeFileTabFromMenu = React.useCallback(
    (file: OpenFile) => {
      closeFileTabsSafely([file]);
    },
    [closeFileTabsSafely],
  );

  const groupedTabItems = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; tabs: TabGroupItem[] }> = [];
    const fileTabs = tabs
      .filter((tab): tab is Extract<CanvasCenterTab, { kind: "file" }> => tab.kind === "file")
      .map((tab) => createCanvasCenterTabGroupItem(tab));
    if (fileTabs.length > 0) {
      groups.push({ key: "file", label: "File", tabs: fileTabs });
    }

    const diffTabs = tabs
      .filter(
        (tab): tab is Extract<CanvasCenterTab, { kind: "changes-group" | "changes-file" }> =>
          tab.kind === "changes-group" || tab.kind === "changes-file",
      )
      .map((tab) => createCanvasCenterTabGroupItem(tab));
    if (diffTabs.length > 0) {
      groups.push({ key: "diff", label: "Diff", tabs: diffTabs });
    }

    const reviewTabs = tabs
      .filter(
        (tab): tab is Extract<CanvasCenterTab, { kind: "review-group" | "review-file" }> =>
          tab.kind === "review-group" || tab.kind === "review-file",
      )
      .map((tab) => createCanvasCenterTabGroupItem(tab));
    if (reviewTabs.length > 0) {
      groups.push({ key: "review-diff", label: "Review", tabs: reviewTabs });
    }

    return groups;
  }, [tabs]);

  const orderedGroupedTabItems = React.useMemo(
    () => groupedTabItems.map((group) => applySavedTabGroupOrder(group, tabGroupOrder[group.key])),
    [groupedTabItems, tabGroupOrder],
  );

  const handleTabGroupDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      if (!event.over || event.active.id === event.over.id) return;

      const activeGroupKey = event.active.data.current?.groupKey;
      const overGroupKey = event.over.data.current?.groupKey;
      if (typeof activeGroupKey !== "string" || activeGroupKey !== overGroupKey) return;

      const group = orderedGroupedTabItems.find((item) => item.key === activeGroupKey);
      if (!group) return;

      const ids = group.tabs.map((tab) => tab.id);
      const oldIndex = ids.indexOf(String(event.active.id));
      const newIndex = ids.indexOf(String(event.over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      setTabGroupOrder((current) => ({
        ...current,
        [activeGroupKey]: arrayMove(ids, oldIndex, newIndex),
      }));
    },
    [orderedGroupedTabItems],
  );

  const handleCloseTabGroupItem = React.useCallback(
    (item: TabGroupItem) => {
      const tab = tabs.find((candidate) => candidate.id === item.value);
      if (tab) {
        closeTab(tab);
      }
    },
    [closeTab, tabs],
  );

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <Tabs
        value={activeTabId}
        onValueChange={handleTabChange}
        className="flex h-full min-h-0 flex-col gap-0 overflow-hidden"
      >
        <CenterStageTabList>
          <CenterStageOverviewTab />
          <CenterStageScrollableTabs>
            {tabs
              .filter(isClosableCanvasCenterTab)
              .map((tab) => (
                <CanvasCenterSurfaceTab
                  key={tab.id}
                  tab={tab}
                  onClose={() => closeTab(tab)}
                  onContextMenu={
                    tab.kind === "file"
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          editor.markEventAsHandled(event);
                          handleTabChange(tab.id);
                          const point = clientPointToLocalElementPoint(
                            rootRef.current,
                            event.clientX,
                            event.clientY,
                          );
                          setTabContextMenu({
                            x: point.x,
                            y: point.y,
                            filePath: tab.path,
                          });
                        }
                      : undefined
                  }
                />
              ))}
          </CenterStageScrollableTabs>
          <CenterStageStickyTabActions>
            <CenterStageTabGroupPopover
              open={tabGroupPopoverOpen}
              onOpenChange={setTabGroupPopoverOpen}
              groups={orderedGroupedTabItems}
              activeValue={activeTabId}
              sensors={tabGroupDndSensors}
              onDragEnd={handleTabGroupDragEnd}
              onSelect={(value) => {
                handleTabChange(value);
                setTabGroupPopoverOpen(false);
              }}
              onClose={handleCloseTabGroupItem}
              isClosable={isCanvasTabGroupItemClosable}
              renderContent={(tab) => <CenterStageTabGroupItemContent tab={tab} />}
            />
          </CenterStageStickyTabActions>
        </CenterStageTabList>
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab ? <CanvasCenterTabContent context={source.context} tab={activeTab} /> : null}
        </div>
      </Tabs>
      <CenterStageFileTabContextMenu
        tabContextMenu={tabContextMenu}
        setTabContextMenu={setTabContextMenu}
        openFiles={tabContextMenuFiles}
        anchorPosition="absolute"
        basePath={source.context.repoPath ?? source.context.localPath}
        onCloseFile={closeFileTabFromMenu}
        closeFilesSafely={closeFileTabsSafely}
      />
    </div>
  );
}

function CanvasCenterSurfaceTab({
  onContextMenu,
  onClose,
  tab,
}: {
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClose: () => void;
  tab: ClosableCanvasCenterTab;
}) {
  return (
    <CenterStageSurfaceContentTab
      value={tab.id}
      name={tab.title}
      path={getCanvasCenterTabSubtitle(tab)}
      tooltip={getCanvasCenterTabSubtitle(tab)}
      variant={getCanvasCenterSurfaceTabVariant(tab)}
      closeLabel={`Close ${tab.title}`}
      onClose={onClose}
      onContextMenu={onContextMenu}
    />
  );
}

function getCanvasCenterSurfaceTabVariant(
  tab: ClosableCanvasCenterTab,
): CenterStageSurfaceTabVariant {
  switch (tab.kind) {
    case "file":
      return "file";
    case "changes-group":
      return "diff-group";
    case "changes-file":
      return "diff";
    case "review-group":
    case "review-file":
      return "review-diff";
  }
}

function createCanvasCenterTabGroupItem(tab: ClosableCanvasCenterTab): TabGroupItem {
  return {
    id: tab.id,
    label: tab.title,
    value: tab.id,
    kind: getCanvasCenterTabGroupKind(tab),
  };
}

function createCanvasCenterMenuOpenFile(
  tab: Extract<CanvasCenterTab, { kind: "file" }>,
): OpenFile {
  return {
    path: tab.path,
    name: tab.title,
    content: "",
    originalContent: "",
    language: "",
    isSymlink: false,
    isDirty: false,
    isLoading: false,
    isPreview: tab.mode === "preview",
    lastOpenedAt: 0,
    lastFocusedAt: 0,
  };
}

function getCanvasCenterTabGroupKind(tab: ClosableCanvasCenterTab): TabGroupItem["kind"] {
  switch (tab.kind) {
    case "file":
      return "file";
    case "changes-group":
      return "diff-group";
    case "changes-file":
      return "diff";
    case "review-group":
    case "review-file":
      return "review-diff";
  }
}

function isCanvasTabGroupItemClosable(tab: TabGroupItem) {
  return (
    tab.kind === "file" ||
    tab.kind === "diff" ||
    tab.kind === "diff-group" ||
    tab.kind === "review-diff"
  );
}

function CanvasCenterTabContent({
  context,
  tab,
}: {
  context: CanvasContextRef;
  tab: CanvasCenterTab;
}) {
  switch (tab.kind) {
    case "overview":
      return <CanvasContextOverview context={context} />;
    case "file":
      return <CanvasCenterFileTab context={context} tab={tab} />;
    case "changes-group":
      return <CanvasCenterChangesGroupTab context={context} tab={tab} />;
    case "changes-file":
      return <CanvasCenterChangesFileTab context={context} tab={tab} />;
    case "review-group":
      return <CanvasCenterReviewGroupTab context={context} tab={tab} />;
    case "review-file":
      return <CanvasCenterReviewFileTab context={context} tab={tab} />;
  }
}

function CanvasCenterFileTab({
  context,
  tab,
}: {
  context: CanvasContextRef;
  tab: Extract<CanvasCenterTab, { kind: "file" }>;
}) {
  const contextId = getCanvasContextId(context);
  const openFile = useEditorStore((state) => state.openFile);
  const file = useEditorStore((state) =>
    contextId ? state.getOpenFiles(contextId).find((item) => item.path === tab.path) : undefined,
  );

  React.useEffect(() => {
    if (!contextId) return;
    void openFile(tab.path, contextId, {
      preview: tab.mode === "preview",
      line: tab.line,
      column: tab.column,
    });
  }, [contextId, openFile, tab.column, tab.line, tab.mode, tab.path]);

  if (!contextId) {
    return <BrokenCenterTab message="Missing context id." />;
  }
  if (!file || file.isLoading) {
    return <BrokenCenterTab message="Loading file..." muted />;
  }
  return <FileViewer file={file} contextId={contextId} className="h-full" surfaceActive />;
}

function CanvasCenterChangesGroupTab({
  context,
  tab,
}: {
  context: CanvasContextRef;
  tab: Extract<CanvasCenterTab, { kind: "changes-group" }>;
}) {
  const contextId = getCanvasContextId(context);
  const currentRepoPath = useGitStore((state) => state.currentRepoPath);
  const setCurrentRepoPath = useGitStore((state) => state.setCurrentRepoPath);
  const refreshRepositoryState = useGitStore((state) => state.refreshRepositoryState);

  React.useEffect(() => {
    setCurrentRepoPath(tab.repoPath);
    if (currentRepoPath === tab.repoPath) {
      void refreshRepositoryState({ fetchRemote: false });
    }
  }, [currentRepoPath, refreshRepositoryState, setCurrentRepoPath, tab.repoPath]);

  return (
    <ChangesCodeView
      repoPath={tab.repoPath}
      groupPath={tab.groupPath}
      agentFixContext={agentFixContextFromCanvasContext(context)}
      contextId={contextId}
      navigationTarget={
        tab.diffFilePath
          ? {
              diffFilePath: tab.diffFilePath,
              line: tab.line,
            }
          : null
      }
    />
  );
}

function agentFixContextFromCanvasContext(context: CanvasContextRef): AgentFixContextRef | null {
  const contextId = getCanvasContextId(context);
  if (!contextId) {
    return null;
  }
  return {
    contextId,
    scope: context.contextScope,
  };
}

function CanvasCenterChangesFileTab({
  context,
  tab,
}: {
  context: CanvasContextRef;
  tab: Extract<CanvasCenterTab, { kind: "changes-file" }>;
}) {
  return (
    <ReviewContextProvider target={null} filePath={tab.filePath} selectionMode="local">
      <DiffViewer
        repoPath={tab.repoPath}
        filePath={tab.filePath}
        originalPath={tab.originalPath}
        contextId={getCanvasContextId(context)}
      />
    </ReviewContextProvider>
  );
}

function CanvasCenterReviewGroupTab({
  context,
  tab,
}: {
  context: CanvasContextRef;
  tab: Extract<CanvasCenterTab, { kind: "review-group" }>;
}) {
  return (
    <ReviewContextProvider
      target={reviewTargetFromContext(context)}
      filePath=""
      revisionGuid={tab.revisionGuid}
      selectionMode="local"
      initialSessionGuid={tab.reviewSessionGuid ?? null}
      initialRevisionGuid={tab.revisionGuid ?? null}
    >
      <ReviewCodeView
        groupPath={tab.groupPath}
        contextId={getCanvasContextId(context)}
        navigationTarget={
          tab.diffFilePath
            ? {
                diffFilePath: tab.diffFilePath,
                line: tab.line,
                reviewCommentGuid: tab.reviewCommentGuid,
                reviewMessageGuid: tab.reviewMessageGuid,
              }
            : null
        }
      />
    </ReviewContextProvider>
  );
}

function CanvasCenterReviewFileTab({
  context,
  tab,
}: {
  context: CanvasContextRef;
  tab: Extract<CanvasCenterTab, { kind: "review-file" }>;
}) {
  return (
    <ReviewContextProvider
      target={reviewTargetFromContext(context)}
      filePath={tab.filePath}
      fileSnapshotGuid={tab.originalPath.startsWith("review-diff://") ? tab.originalPath.slice("review-diff://".length).split("/")[0] : undefined}
      revisionGuid={tab.revisionGuid}
      selectionMode="local"
      initialSessionGuid={tab.reviewSessionGuid ?? null}
      initialRevisionGuid={tab.revisionGuid ?? null}
    >
      <DiffViewer
        repoPath={tab.repoPath}
        filePath={tab.filePath}
        originalPath={tab.originalPath}
        contextId={getCanvasContextId(context)}
      />
    </ReviewContextProvider>
  );
}

function BrokenCenterTab({ message, muted }: { message: string; muted?: boolean }) {
  return (
    <div className={cn("flex h-full items-center justify-center px-6 text-sm", muted ? "text-muted-foreground" : "text-destructive")}>
      {message}
    </div>
  );
}
