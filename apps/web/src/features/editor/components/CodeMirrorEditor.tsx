'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toastManager,
  getFileIconProps,
} from '@workspace/ui';
import { Loader2 as LucideLoader2, Eye, FileText, Settings2, ChevronRight, Folder, File, Search } from 'lucide-react';
import { useEditorStore, OpenFile } from '@/features/editor/store/use-editor-store';
import { invalidateGitQueries } from '@/features/git/hooks/use-git-changed-files-query';
import { useFileTreeStore } from '@/features/files/store/use-file-tree-store';
import { useFileTreeQuery, useListDirQuery } from '@/features/files/hooks/use-file-tree-query';
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer';
import { MarkdownToc } from '@/shared/components/markdown/MarkdownToc';
import { isLiveEligibleMarkdownPath, isUntitledMarkdownPath } from '@/features/md-live/lib/md-live-paths';
import { isMdLiveStreamLocked, useMdLiveStreamLocked } from '@/features/md-live/lib/md-live-stream-lock';
import { fsApi } from '@/api/ws-api';
import { BaseCodeMirrorEditor } from './BaseCodeMirrorEditor';
import { setCodeMirrorSearchPanelMessages } from './codemirror-search-panel';
import { useSelectionPopover } from '@/features/selection/hooks/use-selection-popover';
import { SelectionPopover } from '@/features/selection/components/SelectionPopover';
import { usePathname } from "next/navigation";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useEditorSettingsStore } from '@/features/settings/store/editor-settings-store';
import { useQueryState } from 'nuqs';
import { settingsModalParams } from '@/shared/lib/nuqs/searchParams';
import { isSettingsPathname } from "@/features/settings/lib/settings-return";
import { parseReviewReportMetadata } from '@/features/code-review/lib/review-report-frontmatter';
import { ReviewReportMetadataCard } from '@/features/code-review/components/ReviewReportMetadataCard';
import { useProjects } from '@/features/project/hooks/use-project-bootstrap-query';
import { type FileTreeNode } from '@/api/ws-api';
import { FileTree } from '@/features/files/components/FileTree';
import { tryRelativePathUnderRoot } from '@/shared/lib/path-under-root';
import { CenterExplorerToggle } from '@/app-shell/CenterExplorerToggle';
import { CENTER_EXPLORER_BODY_INSET_CLASS } from '@/app-shell/center-explorer-layout';

/** Strip trailing slashes only — keep a leading `/` for absolute paths. */
function stripTrailingSlashes(path: string): string {
  if (!path) return path;
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : '/';
}

const MarkdownLiveEditor = dynamic(
  () =>
    import('@/features/md-live/components/MarkdownLiveEditor').then(
      (mod) => mod.MarkdownLiveEditor,
    ),
  { ssr: false },
);
const MdLiveAgentDock = dynamic(
  () =>
    import('@/features/md-live/components/MdLiveAgentDock').then(
      (mod) => mod.MdLiveAgentDock,
    ),
  { ssr: false },
);
const MdLiveSaveAsDialog = dynamic(
  () =>
    import('@/features/md-live/components/MdLiveSaveAsDialog').then(
      (mod) => mod.MdLiveSaveAsDialog,
    ),
  { ssr: false },
);

function markdownJumpWantsSource(target: {
  preferMarkdownSource?: boolean;
  selectRanges?: { startLine: number; endLine: number }[];
  line?: number;
} | null | undefined): boolean {
  return Boolean(
    target?.preferMarkdownSource ||
    (target?.selectRanges?.length ?? 0) > 0 ||
    target?.line != null,
  );
}

function parentDirPath(path: string, fallbackRoot: string | null): string {
  const normalized = stripTrailingSlashes(path);
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) {
    return fallbackRoot && fallbackRoot.length > 0 ? stripTrailingSlashes(fallbackRoot) : '/';
  }
  return normalized.slice(0, idx) || '/';
}

interface CodeMirrorEditorProps {
  file: OpenFile;
  className?: string;
  contextId?: string | null;
  /** False when mounted but not visible (inactive keepMounted editor tab — avoids orphaned floating overlays). */
  surfaceActive?: boolean;
  /** Center-stage file tabs share a files directory sidecar. */
  showFilesExplorerToggle?: boolean;
}

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  file,
  className,
  contextId,
  surfaceActive = true,
  showFilesExplorerToggle = false,
}) => {
  const t = useTranslations("Editor.components");
  const mdLiveT = useTranslations("mdLive");
  const pathname = usePathname();
  const { effectiveContextId } = useContextParams();
  const editorContextId = contextId ?? effectiveContextId;
  const workspaceActivePath = useEditorStore((s) => s.getActiveFilePath(editorContextId || undefined));
  const updateFileContent = useEditorStore(s => s.updateFileContent);
  const saveFile = useEditorStore(s => s.saveFile);
  const replaceOpenFilePath = useEditorStore((s) => s.replaceOpenFilePath);

  const reloadFileContent = useEditorStore((s) => s.reloadFileContent);
  const clearNavigationTarget = useEditorStore(s => s.clearNavigationTarget);
  const navigationTarget = useEditorStore((state) =>
    editorContextId ? state.navigationTargets[editorContextId]?.[file.path] ?? null : null
  );
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const projects = useProjects();
  const {
    autoSave,
    lineWrap,
    bracketMatching,
    minimap,
    lineHighlight,
    gitIntegration,
    mdToggleDefaultOpen,
    loaded: editorSettingsLoaded,
    loadSettings,
    setAutoSave,
    setLineWrap,
    setBracketMatching,
    setMinimap,
    setLineHighlight,
    setGitIntegration,
    setMdToggleDefaultOpen,
  } = useEditorSettingsStore(
    useShallow((s) => ({
      autoSave: s.autoSave,
      lineWrap: s.lineWrap,
      bracketMatching: s.bracketMatching,
      minimap: s.minimap,
      lineHighlight: s.lineHighlight,
      gitIntegration: s.gitIntegration,
      mdToggleDefaultOpen: s.mdToggleDefaultOpen,
      loaded: s.loaded,
      loadSettings: s.loadSettings,
      setAutoSave: s.setAutoSave,
      setLineWrap: s.setLineWrap,
      setBracketMatching: s.setBracketMatching,
      setMinimap: s.setMinimap,
      setLineHighlight: s.setLineHighlight,
      setGitIntegration: s.setGitIntegration,
      setMdToggleDefaultOpen: s.setMdToggleDefaultOpen,
    })),
  );
  const editorRef = useRef<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const liveChromeRef = useRef<HTMLDivElement | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [markdownView, setMarkdownView] = useState<'live' | 'source'>(() => {
    const target = editorContextId
      ? useEditorStore.getState().navigationTargets[editorContextId]?.[file.path]
      : undefined;
    return markdownJumpWantsSource(target) ? 'source' : 'live';
  });
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [debouncedContent, setDebouncedContent] = useState(file.content);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorSettingsSettled, setEditorSettingsSettled] = useState(editorSettingsLoaded);
  const [gitDiffRefreshNonce, setGitDiffRefreshNonce] = useState(0);
  const [settingsModalOpen] = useQueryState('settingsModal', settingsModalParams.settingsModal);
  // Settings path keeps underlay context for push animation — detect via pathname, not currentView.
  const settingsSurfaceOpen = settingsModalOpen || isSettingsPathname(pathname);

  const refreshEditorGitGutter = useCallback(async () => {
    if (currentProjectPath) {
      await invalidateGitQueries(currentProjectPath);
    }
    setGitDiffRefreshNonce((n) => n + 1);
  }, [currentProjectPath]);

  const handleGitGutterStateChanged = useCallback(
    async (kind: 'stage' | 'restore') => {
      await refreshEditorGitGutter();
      if (kind === 'restore') {
        await reloadFileContent(file.path, editorContextId || undefined);
      }
    },
    [refreshEditorGitGutter, reloadFileContent, file.path, editorContextId],
  );

  const handleEditorSettingsPopoverOpenChange = useCallback((open: boolean) => {
    if (!surfaceActive) return;
    if (open && settingsSurfaceOpen) return;
    setSettingsOpen(open);
  }, [settingsSurfaceOpen, surfaceActive]);

  useEffect(() => {
    if (settingsSurfaceOpen) setSettingsOpen(false);
  }, [settingsSurfaceOpen]);
  const [openBreadcrumbIndex, setOpenBreadcrumbIndex] = useState<number | null>(null);
  const storeFileTreeRootPath = useFileTreeStore((s) => s.rootPath);
  const fileTreeShowHidden = useFileTreeStore((s) => s.showHidden);
  const editorViewRef = useRef<EditorView | null>(null);

  // Get relative path for breadcrumbs (strict root boundary + longest project prefix)
  const { relativePath, projectRoot } = useMemo(() => {
    const fullPath = file.path;

    if (currentProjectPath) {
      const rel = tryRelativePathUnderRoot(fullPath, currentProjectPath);
      if (rel !== null) {
        return {
          relativePath: rel,
          projectRoot: currentProjectPath,
        };
      }
    }

    let bestRoot: string | null = null;
    let bestRel: string | null = null;
    for (const project of projects) {
      const rel = tryRelativePathUnderRoot(fullPath, project.mainFilePath);
      if (rel !== null) {
        const root = project.mainFilePath;
        if (!bestRoot || root.length > bestRoot.length) {
          bestRoot = root;
          bestRel = rel;
        }
      }
    }
    if (bestRoot !== null && bestRel !== null) {
      return {
        relativePath: bestRel,
        projectRoot: bestRoot,
      };
    }

    // Last resort: walk up from the file until we still have a path (for canvas
    // opens where sidebar file-tree context was never set).
    const abs = stripTrailingSlashes(fullPath.replace(/\\/g, '/'));
    const lastSlash = abs.lastIndexOf('/');
    if (lastSlash > 0) {
      return {
        relativePath: abs.slice(lastSlash + 1),
        projectRoot: abs.slice(0, lastSlash),
      };
    }

    return {
      relativePath: fullPath,
      projectRoot: '',
    };
  }, [file.path, currentProjectPath, projects]);

  // Canvas / keepMounted editors must not depend on the left sidebar Files panel
  // having set useFileTreeStore.rootPath — query the open file's project root.
  const breadcrumbTreeRoot =
    (projectRoot && projectRoot.length > 0 ? projectRoot : null) ?? storeFileTreeRootPath;

  const fileTreeQuery = useFileTreeQuery(breadcrumbTreeRoot, fileTreeShowHidden);
  const fileTreeData = fileTreeQuery.data?.tree ?? [];
  const fileTreeRootPath = breadcrumbTreeRoot;

  const breadcrumbParts = useMemo(() => {
    return relativePath.split('/').filter(Boolean);
  }, [relativePath]);

  const editorGitDiffSource = useMemo(
    () =>
      !file.isSymlink && projectRoot && relativePath
        ? { repoPath: projectRoot, fileRelativePath: relativePath }
        : null,
    [file.isSymlink, projectRoot, relativePath],
  );

  // Get the full path for a breadcrumb part at a given index
  const getBreadcrumbPath = useCallback((index: number) => {
    const parts = relativePath.split('/').filter(Boolean);
    const relevantParts = parts.slice(0, index + 1);
    if (!projectRoot) return relevantParts.join('/');
    const joined = relevantParts.join('/');
    return joined ? `${stripTrailingSlashes(projectRoot)}/${joined}` : stripTrailingSlashes(projectRoot);
  }, [relativePath, projectRoot]);

  // Parent dir of the open breadcrumb segment — used for listDir fallback when
  // the recursive tree is empty / not synced (common on canvas).
  const openBreadcrumbParentPath = useMemo(() => {
    if (openBreadcrumbIndex == null || !fileTreeRootPath) return null;
    const segmentPath = getBreadcrumbPath(openBreadcrumbIndex);
    return parentDirPath(segmentPath, fileTreeRootPath);
  }, [openBreadcrumbIndex, fileTreeRootPath, getBreadcrumbPath]);

  const breadcrumbListDirQuery = useListDirQuery(openBreadcrumbParentPath, {
    dirsOnly: false,
    showHidden: fileTreeShowHidden,
  });

  // Get the sibling files/directories for a breadcrumb path (same level)
  const getBreadcrumbSiblings = useCallback((targetPath: string): FileTreeNode[] => {
    // Prefer a live listDir for the open popover's parent — independent of
    // whether the left Files panel has loaded this project.
    if (
      openBreadcrumbParentPath &&
      breadcrumbListDirQuery.data?.entries &&
      parentDirPath(targetPath, fileTreeRootPath) === stripTrailingSlashes(openBreadcrumbParentPath)
    ) {
      return breadcrumbListDirQuery.data.entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        is_dir: entry.is_dir,
        is_symlink: entry.is_symlink,
        is_ignored: entry.is_ignored,
        symlink_target: entry.symlink_target,
      }));
    }

    if (!fileTreeData.length || !fileTreeRootPath) return [];

    // Normalize for comparison only (strip trailing slash + unify separators).
    const normalizePath = (path: string) =>
      stripTrailingSlashes(path.replace(/\\/g, '/')).replace(/^\/+/, '');

    const parentPath = parentDirPath(targetPath, fileTreeRootPath);
    const normalizedParentPath = normalizePath(parentPath);
    const normalizedTreeRootPath = normalizePath(fileTreeRootPath);

    // Top-level list_project_files payload is the children of the project root.
    if (normalizedParentPath === normalizedTreeRootPath) {
      return fileTreeData;
    }

    const findSiblings = (nodes: FileTreeNode[], targetParentPath: string): FileTreeNode[] => {
      for (const node of nodes) {
        const normalizedNodePath = normalizePath(node.path);
        if (normalizedNodePath === targetParentPath && node.children) {
          return node.children;
        }
        if (node.children) {
          const result = findSiblings(node.children, targetParentPath);
          if (result.length > 0) return result;
        }
      }
      return [];
    };

    return findSiblings(fileTreeData, normalizedParentPath);
  }, [
    breadcrumbListDirQuery.data?.entries,
    fileTreeData,
    fileTreeRootPath,
    openBreadcrumbParentPath,
  ]);

  // Handle search button click (trigger Cmd+F)
  const handleSearchClick = useCallback(() => {
    if (editorViewRef.current) {
      openSearchPanel(editorViewRef.current);
    }
  }, []);

  // Close breadcrumb popover when file changes
  useEffect(() => {
    if (openBreadcrumbIndex !== null) {
      setOpenBreadcrumbIndex(null);
    }
  }, [file.path]);

  // KeepMounted editor tabs hide inactive panels via CSS; Radix Popovers portal to body and can
  // briefly reposition to (0,0) if still "open" while this panel's file is no longer active.
  useEffect(() => {
    if (workspaceActivePath != null && workspaceActivePath !== file.path) {
      setOpenBreadcrumbIndex(null);
      setSettingsOpen(false);
    }
  }, [workspaceActivePath, file.path]);

  // Popover anchor is the breadcrumb trigger; close as soon as we enter a loading state so
  // Floating UI never repositions against a detached trigger (top-left flash).
  useEffect(() => {
    if (file.isLoading) {
      setOpenBreadcrumbIndex(null);
    }
  }, [file.isLoading]);

  const isMarkdown = file.language === 'markdown' || file.name.endsWith('.md') || file.name.endsWith('.mdx');
  const isLiveEligible = isLiveEligibleMarkdownPath(file.path, {
    fileName: file.name,
    language: file.language,
  });
  const jumpWantsSource = markdownJumpWantsSource(navigationTarget);
  const isLive = isLiveEligible && markdownView === 'live' && !jumpWantsSource;
  const streamLocked = useMdLiveStreamLocked(file.path);
  const isPreview = !isLiveEligible && isMarkdown && previewFilePath === file.path;
  const isReviewReport = isMarkdown && file.path.includes('/.atmos/reviews/');

  // When previewing an Atmos review report, pull the `atmos_review:` frontmatter out so we
  // can render a dedicated card above the preview and strip the raw YAML from the markdown
  // body (otherwise the agent's traceability block would show up as code-ish text).
  const { reportMetadata, previewBody } = useMemo(() => {
    if (!isPreview || !isReviewReport) {
      return { reportMetadata: null, previewBody: debouncedContent };
    }
    const { metadata, body } = parseReviewReportMetadata(debouncedContent);
    return { reportMetadata: metadata, previewBody: body };
  }, [isPreview, isReviewReport, debouncedContent]);

  // Auto-enable preview for .atmos/reviews/ markdown files
  useEffect(() => {
    const liveEligible = isLiveEligibleMarkdownPath(file.path, {
      fileName: file.name,
      language: file.language,
    });
    const target = editorContextId
      ? useEditorStore.getState().navigationTargets[editorContextId]?.[file.path]
      : undefined;
    const jumpToSource = markdownJumpWantsSource(target);
    if (
      !jumpToSource &&
      isMarkdown &&
      file.path.includes('/.atmos/reviews/') &&
      previewFilePath !== file.path
    ) {
      setPreviewFilePath(file.path);
      setDebouncedContent(file.content);
    }
    setMarkdownView(jumpToSource || !liveEligible ? 'source' : 'live');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path]);

  useEffect(() => {
    if (!navigationTarget || !markdownJumpWantsSource(navigationTarget)) return;
    const hasCmTarget =
      (navigationTarget.selectRanges?.length ?? 0) > 0 ||
      navigationTarget.line != null;
    setMarkdownView('source');
    setPreviewFilePath((current) => (current === file.path ? null : current));
    if (!hasCmTarget) {
      clearNavigationTarget(file.path, editorContextId || undefined);
    }
  }, [clearNavigationTarget, editorContextId, file.path, navigationTarget]);

  useEffect(() => {
    let cancelled = false;
    void loadSettings().finally(() => {
      if (!cancelled) setEditorSettingsSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  useEffect(() => {
    setCodeMirrorSearchPanelMessages({
      findInFile: t('searchPanel.findInFile'),
      replaceWith: t('searchPanel.replaceWith'),
      hideReplace: t('searchPanel.hideReplace'),
      showReplace: t('searchPanel.showReplace'),
      find: t('searchPanel.find'),
      previousMatch: t('searchPanel.previousMatch'),
      nextMatch: t('searchPanel.nextMatch'),
      closeSearch: t('searchPanel.closeSearch'),
      matchCase: t('searchPanel.matchCase'),
      wholeWord: t('searchPanel.wholeWord'),
      regexp: t('searchPanel.regexp'),
      replace: t('searchPanel.replace'),
      replaceAll: t('searchPanel.replaceAll'),
    });
  }, [t]);

  // Selection popover for copying code to AI
  const getSelectionInfo = useCallback(() => {
    if (isPreview) {
      // In preview mode, use DOM selection (no line numbers)
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return null;

      const selectedText = sel.toString();
      if (!selectedText.trim()) return null;

      return {
        filePath: file.path,
        startLine: 0,
        endLine: 0,
        selectedText,
        language: file.language,
      };
    }

    const editor = editorRef.current;
    if (!editor) return null;

    const selection = editor.state.selection.main;
    if (selection.empty) return null;

    const selectedText = editor.state.sliceDoc(selection.from, selection.to);
    if (!selectedText.trim()) return null;

    const startLine = editor.state.doc.lineAt(selection.from).number;
    const endPos = Math.max(selection.from, selection.to - 1);
    const endLine = editor.state.doc.lineAt(endPos).number;

    return {
      filePath: file.path,
      startLine,
      endLine,
      selectedText,
      language: file.language,
    };
  }, [file.path, file.language, isPreview]);

  const selectionPopover = useSelectionPopover({
    getSelectionInfo,
    containerRef,
    enabled: surfaceActive && !file.isLoading && !isLive,
  });

  useEffect(() => {
    if (!surfaceActive) {
      selectionPopover.dismiss();
      setOpenBreadcrumbIndex(null);
      setSettingsOpen(false);
    }
  }, [surfaceActive, selectionPopover.dismiss]);

  // Debounce preview updates
  useEffect(() => {
    if (!isPreview || !isMarkdown) return;

    const timer = setTimeout(() => {
      setDebouncedContent(file.content);
    }, 3000); // 3 seconds debouncing as requested

    return () => clearTimeout(timer);
  }, [file.content, isPreview, isMarkdown]);

  useEffect(() => {
    if (!autoSave || file.isLoading || !file.isDirty) return;
    if (isUntitledMarkdownPath(file.path)) return;
    if (isMdLiveStreamLocked(file.path)) return;

    const timer = setTimeout(() => {
      void saveFile(file.path, editorContextId || undefined)
        .then(() => refreshEditorGitGutter())
        .catch(() => {
          toastManager.add({
            title: t('codeMirror.autoSaveFailedTitle'),
            description: t('codeMirror.autoSaveFailedDescription', { fileName: file.name }),
            type: 'error',
          });
        });
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    autoSave,
    file.content,
    file.isDirty,
    file.isLoading,
    file.name,
    file.path,
    refreshEditorGitGutter,
    saveFile,
    editorContextId,
    t,
  ]);

  // Toggle preview
  const togglePreview = useCallback(() => {
    if (isLiveEligible) {
      setMarkdownView((prev) => (prev === 'live' ? 'source' : 'live'));
      return;
    }
    if (!isMarkdown) return;
    setPreviewFilePath((prev) => (prev === file.path ? null : file.path));
    setDebouncedContent(file.content);
  }, [file.content, file.path, isLiveEligible, isMarkdown]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (isUntitledMarkdownPath(file.path)) {
      setSaveAsOpen(true);
      return;
    }
    if (isMdLiveStreamLocked(file.path)) return;
    try {
      await saveFile(file.path, editorContextId || undefined);
      await refreshEditorGitGutter();
      toastManager.add({
        title: t('codeMirror.savedTitle'),
        description: t('codeMirror.savedDescription', { fileName: file.name }),
        type: 'success',
      });
    } catch {
      toastManager.add({
        title: t('codeMirror.saveFailedTitle'),
        description: t('codeMirror.saveFailedDescription', { fileName: file.name }),
        type: 'error',
      });
    }
  }, [editorContextId, file.path, file.name, refreshEditorGitGutter, saveFile, t]);

  const handleSaveAsConfirm = useCallback(async (fullPath: string) => {
    await fsApi.writeFile(fullPath, file.content);
    replaceOpenFilePath(file.path, fullPath, editorContextId || undefined);
    await refreshEditorGitGutter();
  }, [editorContextId, file.content, file.path, refreshEditorGitGutter, replaceOpenFilePath]);

  const handleEditorCreate = useCallback((editor: EditorView) => {
    editorRef.current = editor;
    editorViewRef.current = editor;
    editor.focus();
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    updateFileContent(file.path, value, editorContextId || undefined);
  }, [editorContextId, file.path, updateFileContent]);

  const toolbarIconBtnClass =
    'flex size-6 items-center justify-center rounded hover:bg-accent hover:text-foreground cursor-pointer select-none';

  const renderMarkdownPreviewButton = (buttonClassName: string) =>
    isMarkdown ? (
      <button
        type="button"
        onClick={() => {
          if (streamLocked) return;
          togglePreview();
        }}
        className={buttonClassName}
        title={
          isLiveEligible
            ? (isLive ? mdLiveT('source') : mdLiveT('live'))
            : (isPreview ? t('codeMirror.showEditor') : t('codeMirror.showPreview'))
        }
        aria-label={
          isLiveEligible
            ? (isLive ? mdLiveT('source') : mdLiveT('live'))
            : (isPreview ? t('codeMirror.showEditor') : t('codeMirror.showPreview'))
        }
      >
        {isLive || isPreview ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    ) : null;

  const renderEditorSettingsMenu = (triggerClassName: string) => (
    <Popover open={settingsOpen} onOpenChange={handleEditorSettingsPopoverOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          title={t('codeMirror.editorSettings')}
          aria-label={t('codeMirror.openEditorSettings')}
        >
          <Settings2 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-1.5 max-h-[80vh] overflow-y-auto"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                  {t('codeMirror.settings.lineWrap')}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                {t('codeMirror.settings.lineWrapTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Switch
            checked={lineWrap}
            onCheckedChange={(checked) => {
              void setLineWrap(!!checked);
            }}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                  {t('codeMirror.settings.autoSave')}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                {t('codeMirror.settings.autoSaveTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Switch
            checked={autoSave}
            onCheckedChange={(checked) => {
              void setAutoSave(!!checked);
            }}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                  {t('codeMirror.settings.bracketMatching')}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                {t('codeMirror.settings.bracketMatchingTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Switch
            checked={bracketMatching}
            onCheckedChange={(checked) => {
              void setBracketMatching(!!checked);
            }}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                  {t('codeMirror.settings.minimap')}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                {t('codeMirror.settings.minimapTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Switch
            checked={minimap}
            onCheckedChange={(checked) => {
              void setMinimap(!!checked);
            }}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                  {t('codeMirror.settings.lineHighlight')}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                {t('codeMirror.settings.lineHighlightTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Switch
            checked={lineHighlight}
            onCheckedChange={(checked) => {
              void setLineHighlight(!!checked);
            }}
            className="shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                  {t('codeMirror.settings.gitIntegration')}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                {t('codeMirror.settings.gitIntegrationTooltip')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Switch
            checked={gitIntegration}
            onCheckedChange={(checked) => {
              void setGitIntegration(!!checked);
            }}
            className="shrink-0"
          />
        </div>

        {isLiveEligible ? (
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                    {t('codeMirror.settings.expandToggles')}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                  {t('codeMirror.settings.expandTogglesTooltip')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Switch
              checked={mdToggleDefaultOpen}
              onCheckedChange={(checked) => {
                void setMdToggleDefaultOpen(!!checked);
              }}
              className="shrink-0"
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );

  return (
    <div ref={containerRef} className={cn('relative flex h-full min-h-0 w-full flex-col overflow-hidden', className)}>
      {!surfaceActive || file.isLoading ? null : (
        <>
          {/* Selection Popover for AI */}
          <SelectionPopover
            isVisible={selectionPopover.isVisible && !isLive}
            position={selectionPopover.position}
            selectionInfo={selectionPopover.selectionInfo}
            isExpanded={selectionPopover.isExpanded}
            onExpand={() => selectionPopover.setIsExpanded(true)}
            onDismiss={selectionPopover.dismiss}
            type="editor"
            popoverRef={selectionPopover.popoverRef}
          />
        </>
      )}

      <div ref={liveChromeRef} className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <div data-center-explorer-chrome="" className="flex h-8 items-center justify-between px-2.5 text-xs text-muted-foreground border-b border-border bg-background/50 backdrop-blur-sm flex-shrink-0">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  {breadcrumbParts.map((part, index, array) => {
                    const breadcrumbPath = getBreadcrumbPath(index);
                    const siblingsData = getBreadcrumbSiblings(breadcrumbPath);
                    const siblingRootPath =
                      parentDirPath(breadcrumbPath, fileTreeRootPath) || fileTreeRootPath;
                    const isListDirLoading =
                      openBreadcrumbIndex === index &&
                      breadcrumbListDirQuery.isLoading &&
                      siblingsData.length === 0;
                    const segmentClass =
                      index === array.length - 1
                        ? 'text-foreground font-medium cursor-default truncate flex items-center gap-1'
                        : 'hover:text-foreground cursor-pointer flex items-center gap-1 truncate';

                    if (!surfaceActive) {
                      return (
                        <span key={index} className={segmentClass}>
                          {part}
                          {index < array.length - 1 && <ChevronRight className="size-3 shrink-0" />}
                        </span>
                      );
                    }

                    return (
                      <React.Fragment key={index}>
                        <Popover
                          open={openBreadcrumbIndex === index}
                          onOpenChange={(open) => setOpenBreadcrumbIndex(open ? index : null)}
                        >
                          <PopoverTrigger asChild>
                            <span className={segmentClass}>
                              {part}
                              {index < array.length - 1 && <ChevronRight className="size-3 shrink-0" />}
                            </span>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            side="bottom"
                            sideOffset={4}
                            className="z-[80] w-80 max-h-96 overflow-y-auto p-0"
                          >
                            {isListDirLoading ? (
                              <div className="flex items-center justify-center px-2 py-4 text-muted-foreground">
                                <LucideLoader2 className="size-3.5 animate-spin" />
                              </div>
                            ) : siblingsData.length === 0 ? (
                              <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                                {t('codeMirror.noFilesFound')}
                              </div>
                            ) : (
                              <FileTree
                                data={siblingsData}
                                rootPath={siblingRootPath}
                                showHidden={fileTreeShowHidden}
                                contextId={editorContextId}
                                currentProjectPath={projectRoot || null}
                                onRefresh={() => {
                                  void breadcrumbListDirQuery.refetch();
                                  void fileTreeQuery.refetch();
                                }}
                                beforeOpenFile={() => {
                                  flushSync(() => setOpenBreadcrumbIndex(null));
                                }}
                              />
                            )}
                          </PopoverContent>
                        </Popover>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Right side buttons */}
                {surfaceActive ? (
                <div className="flex items-center gap-1 shrink-0">
                  {!isLive && !isPreview ? (
                    <button
                      type="button"
                      onClick={handleSearchClick}
                      className={toolbarIconBtnClass}
                      title={t('codeMirror.searchWithShortcut')}
                      aria-label={t('codeMirror.search')}
                    >
                      <Search className="size-3.5" />
                    </button>
                  ) : null}

                  {renderMarkdownPreviewButton(toolbarIconBtnClass)}
                  {renderEditorSettingsMenu(toolbarIconBtnClass)}
                  {showFilesExplorerToggle ? (
                    <CenterExplorerToggle kind="files" className={toolbarIconBtnClass} />
                  ) : null}
                </div>
                ) : null}
              </div>
            {file.isLoading ? (
              <div
                className={cn(
                  "flex min-h-0 flex-1 items-center justify-center bg-background",
                  CENTER_EXPLORER_BODY_INSET_CLASS,
                )}
              >
                <LucideLoader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
            <div
              className={cn(
                "relative min-h-0 flex-1 overflow-hidden",
                CENTER_EXPLORER_BODY_INSET_CLASS,
              )}
            >
            {isLive && surfaceActive ? (
              <div id="editor-preview-root" className="absolute inset-0 overflow-y-auto overscroll-contain scroll-smooth bg-background">
                <MarkdownLiveEditor
                  key={file.path}
                  filePath={file.path}
                  value={file.content}
                  onChange={handleEditorChange}
                  onSave={() => void handleSave()}
                />
              </div>
            ) : null}
            <div className={cn("absolute inset-0", (isPreview || isLive) && "hidden")}>
              {editorSettingsSettled && !isLive ? (
                <BaseCodeMirrorEditor
                  language={file.language}
                  value={file.content}
                  lineWrap={lineWrap}
                  enableBracketMatching={bracketMatching}
                  minimap={minimap}
                  breadcrumbs={true}
                  lineHighlight={lineHighlight}
                  gitIntegration={gitIntegration}
                  gitDiffSource={editorGitDiffSource}
                  gitDiffRefreshNonce={gitDiffRefreshNonce}
                  onGitGutterStateChanged={handleGitGutterStateChanged}
                  navigationTarget={
                    navigationTarget?.selectRanges?.length || navigationTarget?.line != null
                      ? {
                          line: navigationTarget.line,
                          column: navigationTarget.column,
                          selectRanges: navigationTarget.selectRanges,
                        }
                      : null
                  }
                  onChange={handleEditorChange}
                  onCreateEditor={handleEditorCreate}
                  onNavigationTargetApplied={() => clearNavigationTarget(file.path, editorContextId || undefined)}
                  onSave={handleSave}
                  autoFocus
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-background">
                  <LucideLoader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {isPreview && isMarkdown && (
              <div id="editor-preview-root" className="absolute inset-0 overflow-y-auto overscroll-contain bg-background px-8 py-12 scroll-smooth">
                  {reportMetadata ? (
                    <ReviewReportMetadataCard metadata={reportMetadata} />
                  ) : null}
                  <MarkdownRenderer
                    key={mdToggleDefaultOpen ? "details-open" : "details-closed"}
                    detailsOpenByDefault={mdToggleDefaultOpen}
                  >
                    {previewBody}
                  </MarkdownRenderer>
                </div>
            )}

            {isPreview && isMarkdown && (
              <MarkdownToc markdown={previewBody} scrollContainerId="editor-preview-root" />
            )}
            {isLive && (
              <MarkdownToc markdown={file.content} scrollContainerId="editor-preview-root" />
            )}
            {isLive && surfaceActive ? (
              <MdLiveAgentDock
                filePath={file.path}
                markdown={file.content}
                ensureLive={() => setMarkdownView("live")}
                scopeRef={liveChromeRef}
              />
            ) : null}
            </div>
              </>
            )}
          </div>
    {saveAsOpen ? (
      <MdLiveSaveAsDialog
        open={saveAsOpen}
        defaultDirectory={currentProjectPath || '/'}
        onOpenChange={setSaveAsOpen}
        onConfirm={handleSaveAsConfirm}
      />
    ) : null}
    </div>
  );
};

export default CodeMirrorEditor;
