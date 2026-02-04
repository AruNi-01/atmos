'use client';

import React, { useCallback, useRef } from 'react';
import Editor, { Monaco, OnMount, OnChange, BeforeMount, EditorProps } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { cn } from '@workspace/ui';
import { Loader2 } from 'lucide-react';
import type { editor } from 'monaco-editor';

export interface BaseMonacoEditorProps extends EditorProps {
  className?: string;
  isReadOnly?: boolean;
}

export const BaseMonacoEditor: React.FC<BaseMonacoEditorProps> = ({ 
  className,
  isReadOnly,
  options,
  beforeMount,
  onMount,
  theme,
  ...props 
}) => {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

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

    if (beforeMount) {
      beforeMount(monaco);
    }
  }, [beforeMount]);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    if (onMount) {
      onMount(editor, monaco);
    }
  }, [onMount]);

  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
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
    readOnly: isReadOnly,
  };

  return (
    <div className={cn('h-full w-full relative', className)}>
      <Editor
        height="100%"
        theme={theme || (resolvedTheme === 'dark' ? 'atmos-dark' : 'light')}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorMount}
        loading={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        }
        options={{
          ...defaultOptions,
          ...options,
        }}
        {...props}
      />
      <style jsx global>{`
        .monaco-editor .scrollbar .slider {
          border-radius: 10px !important;
        }
      `}</style>
    </div>
  );
};
