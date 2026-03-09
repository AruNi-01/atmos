'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
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
} from '@workspace/ui';
import { Loader2, Eye, FileText, Settings2 } from 'lucide-react';
import { useEditorStore, OpenFile } from '@/hooks/use-editor-store';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { MarkdownToc } from '@/components/markdown/MarkdownToc';
import { BaseCodeMirrorEditor } from './BaseCodeMirrorEditor';
import { useSelectionPopover } from '@/hooks/use-selection-popover';
import { SelectionPopover } from '@/components/selection/SelectionPopover';
import { useContextParams } from "@/hooks/use-context-params";
import { usePrewarmCodeLanguages } from '@/hooks/use-prewarm-code-languages';
import { useEditorSettings } from '@/hooks/use-editor-settings';

interface CodeMirrorEditorProps {
  file: OpenFile;
  className?: string;
}

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({ file, className }) => {
  usePrewarmCodeLanguages();

  const { workspaceId } = useContextParams();
  const { updateFileContent, saveFile } = useEditorStore();
  const {
    autoSave,
    lineWrap,
    loaded: editorSettingsLoaded,
    loadSettings,
    setAutoSave,
    setLineWrap,
  } = useEditorSettings();
  const editorRef = useRef<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [debouncedContent, setDebouncedContent] = useState(file.content);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isMarkdown = file.language === 'markdown' || file.name.endsWith('.md') || file.name.endsWith('.mdx');
  const isPreview = isMarkdown && previewFilePath === file.path;

  // Auto-enable preview for .atmos/reviews/ markdown files
  useEffect(() => {
    if (isMarkdown && file.path.includes('/.atmos/reviews/') && previewFilePath !== file.path) {
      setPreviewFilePath(file.path);
      setDebouncedContent(file.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.path]);

  useEffect(() => {
    void loadSettings();
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
  });

  // Debounce preview updates
  useEffect(() => {
    if (!isPreview || !isMarkdown) return;

    const timer = setTimeout(() => {
      setDebouncedContent(file.content);
    }, 3000); // 3 seconds debouncing as requested

    return () => clearTimeout(timer);
  }, [file.content, isPreview, isMarkdown]);

  useEffect(() => {
    if (!editorSettingsLoaded || !autoSave || file.isLoading || !file.isDirty) return;

    const timer = setTimeout(() => {
      void saveFile(file.path, workspaceId || undefined).catch(() => {
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
    editorSettingsLoaded,
    file.content,
    file.isDirty,
    file.isLoading,
    file.name,
    file.path,
    saveFile,
    workspaceId,
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
      await saveFile(file.path, workspaceId || undefined);
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
  }, [file.path, file.name, saveFile, workspaceId]);

  const handleEditorCreate = useCallback((editor: EditorView) => {
    editorRef.current = editor;
    editor.focus();
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    updateFileContent(file.path, value, workspaceId || undefined);
  }, [file.path, updateFileContent, workspaceId]);

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
      {file.isLoading ? (
        <div className="flex items-center justify-center h-full bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
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

            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground cursor-pointer select-none"
                  title="Editor Setting"
                  aria-label="Open editor setting"
                >
                  <Settings2 className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-56 p-1.5"
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
                    disabled={!editorSettingsLoaded}
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
                    disabled={!editorSettingsLoaded}
                    onCheckedChange={(checked) => {
                      void setAutoSave(!!checked);
                    }}
                    className="shrink-0"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex-1 min-h-0 w-full relative">
            <div className={cn("absolute inset-0", isPreview && "hidden")}>
              <BaseCodeMirrorEditor
                language={file.language}
                value={file.content}
                lineWrap={lineWrap}
                onChange={handleEditorChange}
                onCreateEditor={handleEditorCreate}
                onSave={handleSave}
                autoFocus
              />
            </div>

            {isPreview && isMarkdown && (
              <>
                <div id="editor-preview-root" className="absolute inset-0 overflow-y-auto bg-background px-8 py-12 scroll-smooth">
                  <MarkdownRenderer>
                    {debouncedContent}
                  </MarkdownRenderer>
                </div>
                <MarkdownToc markdown={debouncedContent} scrollContainerId="editor-preview-root" />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CodeMirrorEditor;
