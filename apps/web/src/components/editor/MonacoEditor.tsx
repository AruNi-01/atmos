'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import Editor, { Monaco, OnMount, OnChange } from '@monaco-editor/react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTheme } from 'next-themes';
import { cn, Loader2, toastManager } from '@workspace/ui';
import { useEditorStore, OpenFile } from '@/hooks/use-editor-store';
import type { editor } from 'monaco-editor';

interface MonacoEditorProps {
  file: OpenFile;
  className?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({ file, className }) => {
  const { updateFileContent, saveFile } = useEditorStore();
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  
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
      updateFileContent(file.path, value);
    }
  }, [file.path, updateFileContent]);
  
  // Handle save
  const handleSave = useCallback(async () => {
    try {
      await saveFile(file.path);
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
  }, [file.path, file.name, saveFile]);
  
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
    <div className={cn('h-full w-full', className)}>
      <Editor
        height="100%"
        language={file.language}
        value={file.content}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
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
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
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
        }}
      />
    </div>
  );
};

export default MonacoEditor;
