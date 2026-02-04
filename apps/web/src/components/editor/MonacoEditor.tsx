'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OnMount, OnChange } from '@monaco-editor/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTheme } from 'next-themes';
import { cn, toastManager } from '@workspace/ui';
import { Loader2, Eye, FileText } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEditorStore, OpenFile } from '@/hooks/use-editor-store';
import type { editor } from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BaseMonacoEditor } from './BaseMonacoEditor';

interface MonacoEditorProps {
  file: OpenFile;
  className?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({ file, className }) => {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const { updateFileContent, saveFile } = useEditorStore();
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
  const [debouncedContent, setDebouncedContent] = useState(file.content);

  const isMarkdown = file.language === 'markdown' || file.name.endsWith('.md') || file.name.endsWith('.mdx');
  const isPreview = isMarkdown && previewFilePath === file.path;

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

  // Loading state
  if (file.isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full bg-background', className)}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('h-full w-full relative flex flex-col', className)}>
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
          <div className={cn(
            "absolute inset-0 overflow-y-auto bg-background px-8 py-12 prose prose-sm max-w-none scroll-smooth",
            resolvedTheme === 'dark' && "prose-invert"
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {debouncedContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonacoEditor;
