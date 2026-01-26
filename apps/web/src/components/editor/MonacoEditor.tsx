'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { Monaco, OnMount, OnChange, BeforeMount } from '@monaco-editor/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTheme } from 'next-themes';
import { cn, toastManager } from '@workspace/ui';
import { Loader2, Eye, EyeOff, FileText } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEditorStore, OpenFile } from '@/hooks/use-editor-store';
import type { editor } from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const monacoRef = useRef<Monaco | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [debouncedContent, setDebouncedContent] = useState(file.content);

  const isMarkdown = file.language === 'markdown' || file.name.endsWith('.md') || file.name.endsWith('.mdx');

  // Debounce preview updates
  useEffect(() => {
    if (!isPreview || !isMarkdown) return;

    const timer = setTimeout(() => {
      setDebouncedContent(file.content);
    }, 3000); // 3 seconds debouncing as requested

    return () => clearTimeout(timer);
  }, [file.content, isPreview, isMarkdown]);

  // Sync debounced content immediately when entering preview mode or switching files
  useEffect(() => {
    if (isPreview) {
      setDebouncedContent(file.content);
    }
  }, [isPreview, file.path]); // Added file.path to sync on file switch

  // Toggle preview
  const togglePreview = useCallback(() => {
    setIsPreview(prev => !prev);
  }, []);

  // Sync state if file changes and isn't markdown
  useEffect(() => {
    if (!isMarkdown) {
      setIsPreview(false);
    }
  }, [isMarkdown, file.path]);

  // Define custom theme before mount
  const handleEditorWillMount: BeforeMount = useCallback((monaco) => {
    // Disable validation to remove error squiggly lines
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    // Also for javascript
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    monaco.editor.defineTheme('atmos-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#09090b', // Match project backgroud (zinc-950)
        'editor.lineHighlightBackground': '#ffffff08',
        'editorLineNumber.foreground': '#4b5563',
        'scrollbarSlider.background': '#71717a33', // muted-foreground/20
        'scrollbarSlider.hoverBackground': '#71717a66', // muted-foreground/40
        'scrollbarSlider.activeBackground': '#71717a99',
      },
    });
  }, []);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Focus the editor
    editor.focus();

    // Add custom keyboard shortcut for save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  }, []);

  // Handle content change
  const handleEditorChange: OnChange = useCallback((value) => {
    if (value !== undefined) {
      updateFileContent(file.path, value, workspaceId || undefined);
    }
  }, [file.path, updateFileContent, workspaceId]);

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
          <Editor
            height="100%"
            language={file.language}
            value={file.content}
            theme={resolvedTheme === 'dark' ? 'atmos-dark' : 'light'}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            beforeMount={handleEditorWillMount}
            loading={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            }
            options={{
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              lineHeight: 1.6,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              renderWhitespace: 'selection',
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              smoothScrolling: true,
              padding: { top: 16, bottom: 16 },
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
                useShadows: false,
                vertical: 'visible',
                horizontal: 'visible',
              },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              renderLineHighlight: 'line',
              lineNumbers: 'on',
              lineNumbersMinChars: 4,
              glyphMargin: false,
              folding: true,
              foldingHighlight: true,
              showFoldingControls: 'mouseover',
              bracketPairColorization: { enabled: true },
              guides: {
                bracketPairs: true,
                indentation: true,
              },
              // Disable error/validation noise
              hover: { enabled: false },
              renderValidationDecorations: 'off',
              quickSuggestions: false,
              parameterHints: { enabled: false },
              suggestOnTriggerCharacters: false,
            }}
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
      <style jsx global>{`
        .monaco-editor .scrollbar .slider {
          border-radius: 10px !important;
        }
      `}</style>
    </div>
  );
};

export default MonacoEditor;
