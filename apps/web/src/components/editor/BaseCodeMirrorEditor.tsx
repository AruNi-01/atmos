'use client';

import React, { useEffect, useRef, useState } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState, Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { cn } from '@workspace/ui';
import { loadCodeLanguageSupport } from '@/lib/code-language';

export interface BaseCodeMirrorEditorProps {
  className?: string;
  language?: string;
  value: string;
  isReadOnly?: boolean;
  autoFocus?: boolean;
  lineWrap?: boolean;
  onChange?: (value: string) => void;
  onCreateEditor?: (view: EditorView) => void;
  onSave?: () => void;
}

function createEditorTheme(isDark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        color: isDark ? '#f4f4f5' : '#111827',
        fontSize: '13px',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        lineHeight: '1.6',
        overflow: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: isDark ? 'rgba(161, 161, 170, 0.28) transparent' : 'rgba(113, 113, 122, 0.24) transparent',
      },
      '.cm-content': {
        minHeight: '100%',
        paddingTop: '8px',
        paddingBottom: '8px',
        paddingRight: '0',
        caretColor: isDark ? '#fafafa' : '#111827',
      },
      '.cm-line': {
        paddingLeft: '6px',
        paddingRight: '6px',
      },
      '.cm-cursor': {
        borderLeftColor: isDark ? '#fafafa' : '#111827',
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: isDark ? '#3f3f46' : '#d4d4d8',
      },
      '.cm-activeLine': {
        backgroundColor: isDark ? '#ffffff08' : '#18181b08',
      },
      '.cm-gutters': {
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        border: 'none',
        color: isDark ? '#52525b' : '#71717a',
        position: 'sticky',
        left: '0',
        zIndex: '2',
      },
      '.cm-gutterElement': {
        paddingLeft: '0',
        paddingRight: '0',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        minWidth: '2.5rem',
        paddingLeft: '12px',
        paddingRight: '6px',
      },
      '.cm-foldGutter': {
        display: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        color: isDark ? '#a1a1aa' : '#52525b',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: isDark ? '#18181b' : '#f4f4f5',
        border: 'none',
        color: isDark ? '#a1a1aa' : '#52525b',
      },
      '.cm-tooltip': {
        border: `1px solid ${isDark ? '#27272a' : '#e4e4e7'}`,
        backgroundColor: isDark ? '#09090b' : '#ffffff',
      },
      '.cm-panels': {
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        color: isDark ? '#f4f4f5' : '#111827',
      },
      '.cm-searchMatch': {
        backgroundColor: isDark ? '#854d0e55' : '#fef08a99',
        outline: 'none',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: isDark ? '#ca8a0444' : '#fde047aa',
      },
      '.cm-scroller::-webkit-scrollbar': {
        width: '6px',
        height: '6px',
      },
      '.cm-scroller::-webkit-scrollbar-button': {
        display: 'none',
        width: '0',
        height: '0',
      },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        backgroundColor: isDark ? 'rgba(161, 161, 170, 0.28)' : 'rgba(113, 113, 122, 0.24)',
        borderRadius: '9999px',
        border: 'none',
        boxShadow: 'none',
      },
      '.cm-scroller::-webkit-scrollbar-track': {
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
      },
      '.cm-scroller::-webkit-scrollbar-track-piece': {
        backgroundColor: 'transparent',
      },
      '.cm-scroller::-webkit-scrollbar-corner': {
        backgroundColor: 'transparent',
      },
    },
    { dark: isDark }
  );
}

export const BaseCodeMirrorEditor: React.FC<BaseCodeMirrorEditorProps> = ({
  className,
  value,
  language,
  isReadOnly,
  autoFocus,
  lineWrap = false,
  onChange,
  onCreateEditor,
  onSave,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const initialStateRef = useRef({
    value,
    language,
    isReadOnly,
    isDark,
    autoFocus,
    lineWrap,
  });
  const [languageCompartment] = useState(() => new Compartment());
  const [readOnlyCompartment] = useState(() => new Compartment());
  const [themeCompartment] = useState(() => new Compartment());
  const [lineWrapCompartment] = useState(() => new Compartment());
  const onChangeRef = useRef(onChange);
  const onCreateEditorRef = useRef(onCreateEditor);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onCreateEditorRef.current = onCreateEditor;
  }, [onCreateEditor]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const initialState = initialStateRef.current;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialState.value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          EditorState.tabSize.of(2),
          lineWrapCompartment.of(initialState.lineWrap ? EditorView.lineWrapping : []),
          EditorView.contentAttributes.of({
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
            translate: 'no',
          }),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
          languageCompartment.of([]),
          readOnlyCompartment.of([
            EditorState.readOnly.of(!!initialState.isReadOnly),
            EditorView.editable.of(!initialState.isReadOnly),
          ]),
          themeCompartment.of([
            createEditorTheme(initialState.isDark),
            syntaxHighlighting(
              initialState.isDark ? oneDarkHighlightStyle : defaultHighlightStyle,
              { fallback: true }
            ),
          ]),
        ],
      }),
      parent: root,
    });

    editorRef.current = view;
    onCreateEditorRef.current?.(view);

    if (initialState.autoFocus) {
      view.focus();
    }

    return () => {
      editorRef.current = null;
      view.destroy();
    };
  }, [languageCompartment, lineWrapCompartment, readOnlyCompartment, themeCompartment]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;
    let cancelled = false;

    void loadCodeLanguageSupport(language).then((extension) => {
      if (cancelled || editorRef.current !== view) return;

      view.dispatch({
        effects: languageCompartment.reconfigure(extension),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [language, languageCompartment]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(!!isReadOnly),
        EditorView.editable.of(!isReadOnly),
      ]),
    });
  }, [isReadOnly, readOnlyCompartment]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.reconfigure([
        createEditorTheme(isDark),
        syntaxHighlighting(isDark ? oneDarkHighlightStyle : defaultHighlightStyle, {
          fallback: true,
        }),
      ]),
    });
  }, [isDark, themeCompartment]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: lineWrapCompartment.reconfigure(lineWrap ? EditorView.lineWrapping : []),
    });
  }, [lineWrap, lineWrapCompartment]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    const mainSelection = view.state.selection.main;
    const nextSelection = EditorSelection.single(
      Math.min(mainSelection.anchor, value.length),
      Math.min(mainSelection.head, value.length)
    );

    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
      selection: nextSelection,
    });
  }, [value]);

  return (
    <div ref={rootRef} className={cn('h-full w-full overflow-hidden', className)} />
  );
};
