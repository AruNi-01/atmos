'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OnMount, OnChange } from '@monaco-editor/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { cn, toastManager } from '@workspace/ui';
import { Loader2, Eye, FileText } from 'lucide-react';
import { useEditorStore, OpenFile } from '@/hooks/use-editor-store';
import type { editor } from 'monaco-editor';
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer';
import { MarkdownToc } from '@/components/markdown/MarkdownToc';
import { BaseMonacoEditor } from './BaseMonacoEditor';
import { useSelectionPopover } from '@/hooks/use-selection-popover';
import { SelectionPopover } from '@/components/selection/SelectionPopover';
import { useContextParams } from "@/hooks/use-context-params";

interface MonacoEditorProps {
  file: OpenFile;
  className?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({ file, className }) => {
  const { workspaceId } = useContextParams();
  const { updateFileContent, saveFile } = useEditorStore();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [debouncedContent, setDebouncedContent] = useState(file.content);

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

    // In editor mode, use Monaco editor selection
    const editor = editorRef.current;
    if (!editor) return null;

    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return null;

    const model = editor.getModel();
    if (!model) return null;

    const selectedText = model.getValueInRange(selection);
    if (!selectedText.trim()) return null;

    return {
      filePath: file.path,
      startLine: selection.startLineNumber,
      endLine: selection.endLineNumber,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDebouncedContent(file.content);
    }, 3000); // 3 seconds debouncing as requested

    return () => clearTimeout(timer);
  }, [file.content, isPreview, isMarkdown]);

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
    } catch (error) {
      toastManager.add({
        title: 'Save Failed',
        description: `Failed to save ${file.name}`,
        type: 'error',
      });
    }
  }, [file.path, file.name, saveFile, workspaceId]);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Focus the editor
    editor.focus();

    // Add custom keyboard shortcut for save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  }, [handleSave]);

  // Handle content change
  const handleEditorChange: OnChange = useCallback((value) => {
    if (value !== undefined) {
      updateFileContent(file.path, value, workspaceId || undefined);
    }
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

          {/* Markdown Preview Toggle */}
          {isMarkdown && (
            <button
              role="button"
              onClick={togglePreview}
              className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-md bg-muted/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground border border-border shadow-sm cursor-pointer select-none"
              title={isPreview ? "Show Editor" : "Show Preview"}
            >
              {isPreview ? (
                <>
                  <FileText className="size-3.5" />
                  <span>Editor</span>
                </>
              ) : (
                <>
                  <Eye className="size-3.5" />
                  <span>Preview</span>
                </>
              )}
            </button>
          )}

          <div className="flex-1 min-h-0 w-full relative">
            <div className={cn("absolute inset-0", isPreview && "hidden")}>
              <BaseMonacoEditor
                height="100%"
                language={file.language}
                value={file.content}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
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

export default MonacoEditor;
