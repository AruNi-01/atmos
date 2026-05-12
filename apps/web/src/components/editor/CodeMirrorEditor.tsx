'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import { useHotkeys } from 'react-hotkeys-hook';
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
import { useEditorStore, OpenFile } from '@/hooks/use-editor-store';
import { useFileTreeStore } from '@/hooks/use-file-tree-store';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { MarkdownToc } from '@/components/markdown/MarkdownToc';
import { BaseCodeMirrorEditor } from './BaseCodeMirrorEditor';
import { useSelectionPopover } from '@/hooks/use-selection-popover';
import { SelectionPopover } from '@/components/selection/SelectionPopover';
import { useContextParams } from "@/hooks/use-context-params";
import { useEditorSettings } from '@/hooks/use-editor-settings';
import { useQueryState } from 'nuqs';
import { settingsModalParams } from '@/lib/nuqs/searchParams';
import { parseReviewReportMetadata } from '@/lib/review-report-frontmatter';
import { ReviewReportMetadataCard } from '@/components/code-review/ReviewReportMetadataCard';
import { useProjectStore } from '@/hooks/use-project-store';
import { type FileTreeNode } from '@/api/ws-api';
import { FileTree } from '@/components/files/FileTree';
import { tryRelativePathUnderRoot } from '@/lib/path-under-root';

interface CodeMirrorEditorProps {
  file: OpenFile;
  className?: string;
  /** False when mounted but not visible (inactive keepMounted editor tab — avoids orphaned floating overlays). */
  surfaceActive?: boolean;
}

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  file,
  className,
  surfaceActive = true,
}) => {
  const { effectiveContextId } = useContextParams();
  const workspaceActivePath = useEditorStore((s) => s.getActiveFilePath(effectiveContextId || undefined));
  const updateFileContent = useEditorStore(s => s.updateFileContent);
  const saveFile = useEditorStore(s => s.saveFile);
  const clearNavigationTarget = useEditorStore(s => s.clearNavigationTarget);
  const navigationTarget = useEditorStore((state) =>
    effectiveContextId ? state.navigationTargets[effectiveContextId]?.[file.path] ?? null : null
  );
  const currentProjectPath = useEditorStore((s) => s.currentProjectPath);
  const { projects } = useProjectStore();
  const {
    autoSave,
    lineWrap,
    bracketMatching,
    minimap,
    breadcrumbs,
    lineHighlight,
    gitIntegration,
    loaded: editorSettingsLoaded,
    loadSettings,
    setAutoSave,
    setLineWrap,
    setBracketMatching,
    setMinimap,
    setBreadcrumbs,
    setLineHighlight,
    setGitIntegration,
  } = useEditorSettings();
  const editorRef = useRef<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [debouncedContent, setDebouncedContent] = useState(file.content);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorSettingsSettled, setEditorSettingsSettled] = useState(editorSettingsLoaded);
  const [settingsModalOpen] = useQueryState('settingsModal', settingsModalParams.settingsModal);

  const handleEditorSettingsPopoverOpenChange = useCallback((open: boolean) => {
    if (!surfaceActive) return;
    if (open && settingsModalOpen) return;
    setSettingsOpen(open);
  }, [settingsModalOpen, surfaceActive]);

  useEffect(() => {
    if (settingsModalOpen) setSettingsOpen(false);
  }, [settingsModalOpen]);
  const [openBreadcrumbIndex, setOpenBreadcrumbIndex] = useState<number | null>(null);
  const fileTreeData = useFileTreeStore((s) => s.data);
  const fileTreeRootPath = useFileTreeStore((s) => s.rootPath);
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

    return {
      relativePath: fullPath,
      projectRoot: '',
    };
  }, [file.path, currentProjectPath, projects]);

  const breadcrumbParts = useMemo(() => {
    return relativePath.split('/').filter(Boolean);
  }, [relativePath]);

  const editorGitDiffSource = useMemo(
    () =>
      projectRoot && relativePath
        ? { repoPath: projectRoot, fileRelativePath: relativePath }
        : null,
    [projectRoot, relativePath],
  );

  // Get the full path for a breadcrumb part at a given index
  const getBreadcrumbPath = useCallback((index: number) => {
    const parts = relativePath.split('/').filter(Boolean);
    const relevantParts = parts.slice(0, index + 1);
    return projectRoot ? `${projectRoot}/${relevantParts.join('/')}` : relevantParts.join('/');
  }, [relativePath, projectRoot]);

  // Get the sibling files/directories for a breadcrumb path (same level)
  const getBreadcrumbSiblings = useCallback((targetPath: string): FileTreeNode[] => {
    if (!fileTreeData.length || !fileTreeRootPath) return [];

    // Normalize paths to ensure consistent comparison
    const normalizePath = (path: string) => path.replace(/\/+$/, '').replace(/^\/+/, '');

    const normalizedTargetPath = normalizePath(targetPath);

    // Get the parent directory of the target path
    const getParentPath = (path: string): string => {
      const parts = path.split('/').filter(Boolean);
      parts.pop(); // Remove the last part
      return parts.length > 0 ? parts.join('/') : fileTreeRootPath || '/';
    };

    const parentPath = getParentPath(normalizedTargetPath);
    const normalizedParentPath = normalizePath(parentPath);
    const normalizedTreeRootPath = normalizePath(fileTreeRootPath);

    // `list_project_files` returns immediate children of `root_path` only — no node whose
    // `path` equals the project root. Siblings under the workspace root live at `fileTreeData`.
    if (normalizedParentPath === normalizedTreeRootPath) {
      return fileTreeData;
    }

    // Helper function to find the parent directory and return its children
    const findSiblings = (nodes: FileTreeNode[], targetParentPath: string): FileTreeNode[] => {
      for (const node of nodes) {
        const normalizedNodePath = normalizePath(node.path);
        if (normalizedNodePath === targetParentPath && node.children) {
          // Found the parent directory, return its children (siblings)
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
  }, [fileTreeData, fileTreeRootPath]);

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
  const isPreview = isMarkdown && previewFilePath === file.path;
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
    if (isMarkdown && file.path.includes('/.atmos/reviews/') && previewFilePath !== file.path) {
      setPreviewFilePath(file.path);
      setDebouncedContent(file.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path]);

  useEffect(() => {
    let cancelled = false;
    void loadSettings().finally(() => {
      if (!cancelled) setEditorSettingsSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

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
    enabled: surfaceActive && !file.isLoading,
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

    const timer = setTimeout(() => {
      void saveFile(file.path, effectiveContextId || undefined).catch(() => {
        toastManager.add({
          title: 'Auto Save Failed',
          description: `Failed to auto-save ${file.name}`,
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
    saveFile,
    effectiveContextId,
  ]);

  // Toggle preview
  const togglePreview = useCallback(() => {
    if (!isMarkdown) return;
    setPreviewFilePath((prev) => (prev === file.path ? null : file.path));
    setDebouncedContent(file.content);
  }, [file.content, file.path, isMarkdown]);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await saveFile(file.path, effectiveContextId || undefined);
      toastManager.add({
        title: 'Saved',
        description: `${file.name} saved successfully`,
        type: 'success',
      });
    } catch {
      toastManager.add({
        title: 'Save Failed',
        description: `Failed to save ${file.name}`,
        type: 'error',
      });
    }
  }, [effectiveContextId, file.path, file.name, saveFile]);

  const handleEditorCreate = useCallback((editor: EditorView) => {
    editorRef.current = editor;
    editorViewRef.current = editor;
    editor.focus();
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    updateFileContent(file.path, value, effectiveContextId || undefined);
  }, [effectiveContextId, file.path, updateFileContent]);

  // Global save hotkey (Cmd/Ctrl + S)
  useHotkeys('mod+s', (e) => {
    e.preventDefault();
    handleSave();
  }, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
  }, [handleSave]);

  return (
    <div ref={containerRef} className={cn('h-full w-full relative flex flex-col', className)}>
      {!surfaceActive || file.isLoading ? null : (
        <>
          {/* Selection Popover for AI */}
          <SelectionPopover
            isVisible={selectionPopover.isVisible}
            position={selectionPopover.position}
            selectionInfo={selectionPopover.selectionInfo}
            isExpanded={selectionPopover.isExpanded}
            onExpand={() => selectionPopover.setIsExpanded(true)}
            onDismiss={selectionPopover.dismiss}
            type="editor"
            popoverRef={selectionPopover.popoverRef}
          />

          <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
            {isMarkdown && (
              <button
                role="button"
                onClick={togglePreview}
                className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground cursor-pointer select-none"
                title={isPreview ? "Show Editor" : "Show Preview"}
                aria-label={isPreview ? "Show Editor" : "Show Preview"}
              >
                {isPreview ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            )}
          </div>
        </>
      )}

      <div className="flex flex-1 min-h-0 w-full flex-col">
            {breadcrumbs && !isPreview && (
              <div className="flex items-center justify-between px-2.5 py-1 text-xs text-muted-foreground border-b border-border bg-background/50 backdrop-blur-sm flex-shrink-0">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  {breadcrumbParts.map((part, index, array) => {
                    const breadcrumbPath = getBreadcrumbPath(index);
                    const siblingsData = getBreadcrumbSiblings(breadcrumbPath);
                    const segmentClass =
                      index === array.length - 1
                        ? 'text-foreground font-medium cursor-default truncate flex items-center gap-1'
                        : 'hover:text-foreground cursor-pointer transition-colors flex items-center gap-1 truncate';

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
                            {siblingsData.length === 0 ? (
                              <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                                No files found
                              </div>
                            ) : (
                              <FileTree
                                data={siblingsData}
                                rootPath={breadcrumbPath}
                                onRefresh={() => {}}
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
                  {/* Search button */}
                  <button
                    type="button"
                    onClick={handleSearchClick}
                    className="flex size-6 items-center justify-center rounded hover:bg-accent hover:text-foreground transition-colors cursor-pointer select-none"
                    title="Search (Cmd+F)"
                    aria-label="Search"
                  >
                    <Search className="size-3.5" />
                  </button>

                  {/* Settings button */}
                  <Popover open={settingsOpen} onOpenChange={handleEditorSettingsPopoverOpenChange}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex size-6 items-center justify-center rounded hover:bg-accent hover:text-foreground transition-colors cursor-pointer select-none"
                        title="Editor Settings"
                        aria-label="Open editor settings"
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
                              Line Wrap
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                            Wrap long lines inside the editor instead of scrolling horizontally.
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
                          Auto Save
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                        Automatically saves the current file after 2 seconds of no typing.
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
                          Bracket Matching
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                        Highlight matching brackets and show bracket pairs.
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
                          Minimap
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                        Show a minimap on the right side for quick navigation.
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
                          Breadcrumbs
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                        Show breadcrumb navigation at the top of the editor.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Switch
                    checked={breadcrumbs}
                    onCheckedChange={(checked) => {
                      void setBreadcrumbs(!!checked);
                    }}
                    className="shrink-0"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-[13px] font-medium leading-none text-popover-foreground">
                          Line Highlight
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                        Highlight the current line and matching selections.
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
                          Git Integration
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={8} className="max-w-[220px]">
                        Show git changes and diff information in the editor.
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
              </PopoverContent>
            </Popover>
                </div>
                ) : null}
              </div>
            )}
            {file.isLoading ? (
              <div className="flex flex-1 min-h-0 items-center justify-center bg-background">
                <LucideLoader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
            <div className={cn("flex-1 min-h-0 relative", isPreview && "hidden")}>
              {editorSettingsSettled ? (
                <BaseCodeMirrorEditor
                  language={file.language}
                  value={file.content}
                  lineWrap={lineWrap}
                  enableBracketMatching={bracketMatching}
                  minimap={minimap}
                  breadcrumbs={breadcrumbs}
                  lineHighlight={lineHighlight}
                  gitIntegration={gitIntegration}
                  gitDiffSource={editorGitDiffSource}
                  navigationTarget={navigationTarget}
                  onChange={handleEditorChange}
                  onCreateEditor={handleEditorCreate}
                  onNavigationTargetApplied={() => clearNavigationTarget(file.path, effectiveContextId || undefined)}
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
              <div id="editor-preview-root" className="flex-1 overflow-y-auto bg-background px-8 py-12 scroll-smooth">
                  {reportMetadata ? (
                    <ReviewReportMetadataCard metadata={reportMetadata} />
                  ) : null}
                  <MarkdownRenderer>
                    {previewBody}
                  </MarkdownRenderer>
                </div>
            )}

            {isPreview && isMarkdown && (
              <MarkdownToc markdown={previewBody} scrollContainerId="editor-preview-root" />
            )}
              </>
            )}
          </div>
    </div>
  );
};

export default CodeMirrorEditor;
