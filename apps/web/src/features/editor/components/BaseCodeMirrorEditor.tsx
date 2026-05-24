'use client';

import React, { useEffect, useRef, useState } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  codeFolding,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
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
import { showMinimap } from '@replit/codemirror-minimap';
import { useTheme } from 'next-themes';
import { cn } from '@workspace/ui';
import { gitApi } from '@/api/ws-api';
import { loadCodeLanguageSupport } from '@/shared/lib/code-language';
import { isTauriRuntime } from '@/shared/lib/desktop-runtime';
import { createGitChangeGutterExtensions } from '@/shared/lib/codemirror-git-gutter';
import { createSearchExtension } from './codemirror-search-panel';
/** 用于在启用 Git 集成时拉取 `git_file_diff`（仓库根路径 + 相对路径）。 */
export interface BaseCodeMirrorEditorGitDiffSource {
  repoPath: string;
  fileRelativePath: string;
}

export interface BaseCodeMirrorEditorProps {
  className?: string;
  language?: string;
  value: string;
  isReadOnly?: boolean;
  autoFocus?: boolean;
  lineWrap?: boolean;
  enableBracketMatching?: boolean;
  minimap?: boolean;
  breadcrumbs?: boolean;
  lineHighlight?: boolean;
  gitIntegration?: boolean;
  /** 提供仓库与文件相对路径时才可显示 git gutter；缺省则关闭。 */
  gitDiffSource?: BaseCodeMirrorEditorGitDiffSource | null;
  /** 变化时重新拉取 `git_file_diff`（index vs 工作区）。 */
  gitDiffRefreshNonce?: number;
  onGitGutterStateChanged?: (kind: 'stage' | 'restore') => void;
  navigationTarget?: { line: number; column?: number } | null;
  onChange?: (value: string) => void;
  onCreateEditor?: (view: EditorView) => void;
  onSave?: () => void;
  onNavigationTargetApplied?: () => void;
}

function createEditorTheme(isDark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        color: isDark ? '#f4f4f5' : '#111827',
        fontSize: '13px',
        position: 'relative',
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
      // Selection bg is text-bound only — `drawSelection` sizes the rect to the actual character widths, leaving
      // the rest of the line (and the gutter strip) untouched so the user can see exactly which characters are
      // selected. The small line-height gap above/below the rect is intentional: prior attempts (pseudo-bleed,
      // per-line full-width bg, gutter strip) all introduced worse visual artifacts than the gap.
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: isDark ? '#3f3f46' : '#d4d4d8',
      },
      '.cm-activeLine': {
        backgroundColor: isDark ? '#ffffff12' : '#18181b0f',
      },
      '.cm-matchingBracket': {
        color: isDark ? '#22d3ee' : '#0891b2',
        fontWeight: 'bold',
      },
      '.cm-nonmatchingBracket': {
        color: isDark ? '#f87171' : '#dc2626',
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
        width: '1.5rem',
      },
      // Match `.cm-activeLine`'s translucent tint so the focus highlight visually extends across the gutters
      // (line numbers + fold + change-gutter cells), giving the active line one continuous bg strip from the
      // left edge of the editor to the right. `.cm-gutters` keeps its opaque editor-bg color (so horizontal
      // scrolling can't reveal code under the line numbers); the translucent overlay here paints over that and
      // mathematically matches `.cm-activeLine`'s tint over the same editor bg, so the strip looks seamless.
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? '#ffffff12' : '#18181b0f',
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
        position: 'absolute',
        top: '0',
        right: '16px',
        left: 'auto',
        width: 'min(calc(100% - 32px), 420px)',
        backgroundColor: 'transparent',
        color: isDark ? '#f4f4f5' : '#111827',
        border: 'none',
        zIndex: '30',
        pointerEvents: 'none',
      },
      '.cm-panels-top': {
        borderBottom: 'none',
        transform: 'translateY(44px)',
      },
      '.cm-panel': {
        backgroundColor: 'transparent',
        pointerEvents: 'auto',
      },
      '.cm-atmos-search': {
        display: 'grid',
        gap: '10px',
        padding: '12px',
        borderRadius: '8px',
        border: `1px solid ${isDark ? 'rgba(113, 113, 122, 0.34)' : 'rgba(212, 212, 216, 0.96)'}`,
        background: isDark
          ? 'linear-gradient(180deg, rgba(24, 24, 27, 0.56), rgba(9, 9, 11, 0.64))'
          : 'linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(250, 250, 250, 0.72))',
        boxShadow: isDark
          ? '0 18px 50px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
          : '0 18px 44px rgba(24, 24, 27, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.82)',
        backdropFilter: 'blur(14px)',
      },
      '.cm-atmos-search__header': {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      },
      '.cm-atmos-search__title-group': {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: '0',
      },
      '.cm-atmos-search__title': {
        fontSize: '12px',
        fontWeight: '600',
        color: isDark ? '#a1a1aa' : '#71717a',
      },
      '.cm-atmos-search__counter': {
        minWidth: '0',
        fontSize: '12px',
        color: isDark ? '#d4d4d8' : '#52525b',
      },
      '.cm-atmos-search__nav-button': {
        width: '20px',
        minWidth: '20px',
        height: '20px',
        borderRadius: '4px',
        backgroundColor: 'transparent',
        border: 'none',
        boxShadow: 'none',
        padding: '0',
      },
      '.cm-atmos-search__icon-button.cm-atmos-search__nav-button': {
        border: 'none',
        backgroundColor: 'transparent',
        boxShadow: 'none',
      },
      '.cm-atmos-search__nav-button:hover': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.72)' : 'rgba(244, 244, 245, 0.78)',
      },
      '.cm-atmos-search__nav-button.is-hidden': {
        display: 'none',
      },
      '.cm-atmos-search__header-actions': {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      },
      '.cm-atmos-search__fields': {
        display: 'grid',
        gap: '8px',
      },
      '.cm-atmos-search__row': {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 32px',
        alignItems: 'center',
        gap: '8px',
      },
      '.cm-atmos-search__replace-section .cm-atmos-search__row': {
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        minHeight: '0',
        overflow: 'hidden',
      },
      '.cm-atmos-search__field': {
        position: 'relative',
        minWidth: '0',
      },
      '.cm-atmos-search__input': {
        width: '100%',
        height: '40px',
        paddingLeft: '16px',
        paddingRight: '12px',
        border: `1px solid ${isDark ? '#27272a' : '#e4e4e7'}`,
        borderRadius: '8px',
        outline: 'none',
        boxSizing: 'border-box',
        backgroundColor: isDark ? 'rgba(9, 9, 11, 0.42)' : 'rgba(250, 250, 250, 0.56)',
        color: isDark ? '#fafafa' : '#111827',
        textAlign: 'left',
        textIndent: '0',
        transition: 'border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease',
      },
      '.cm-atmos-search__input::placeholder': {
        color: isDark ? '#52525b' : '#a1a1aa',
      },
      '.cm-atmos-search__input:focus': {
        borderColor: isDark ? '#f4f4f5' : '#111827',
        boxShadow: isDark ? '0 0 0 3px rgba(244, 244, 245, 0.08)' : '0 0 0 3px rgba(17, 24, 39, 0.08)',
      },
      '.cm-atmos-search__button, .cm-atmos-search__icon-button, .cm-atmos-search__toggle': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        height: '32px',
        borderRadius: '8px',
        border: `1px solid ${isDark ? '#27272a' : '#e4e4e7'}`,
        backgroundColor: isDark ? 'rgba(24, 24, 27, 0.76)' : 'rgba(255, 255, 255, 0.76)',
        color: isDark ? '#e4e4e7' : '#27272a',
        fontSize: '12px',
        fontWeight: '600',
        lineHeight: '1',
        transition: 'border-color 140ms ease, background-color 140ms ease, color 140ms ease',
        appearance: 'none',
      },
      '.cm-atmos-search__button': {
        padding: '0 12px',
      },
      '.cm-atmos-search__button--icon': {
        width: '32px',
        minWidth: '32px',
        padding: '0',
      },
      '.cm-atmos-search__icon-button': {
        width: '32px',
        padding: '0',
      },
      '.cm-atmos-search__icon-button[aria-label=\"Close search\"]': {
        fontSize: '20px',
        lineHeight: '1',
      },
      '.cm-atmos-search__button:hover, .cm-atmos-search__icon-button:hover, .cm-atmos-search__toggle:hover': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.84)' : 'rgba(244, 244, 245, 0.84)',
      },
      '.cm-atmos-search__button--primary': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.96)' : 'rgba(244, 244, 245, 0.96)',
        color: isDark ? '#e4e4e7' : '#27272a',
        borderColor: isDark ? '#27272a' : '#e4e4e7',
      },
      '.cm-atmos-search__button--secondary': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.96)' : 'rgba(244, 244, 245, 0.96)',
      },
      '.cm-atmos-search__button--outline': {
        backgroundColor: 'transparent',
        borderColor: isDark ? '#3f3f46' : '#d4d4d8',
        color: isDark ? '#e4e4e7' : '#27272a',
      },
      '.cm-atmos-search__button--outline:hover': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.52)' : 'rgba(244, 244, 245, 0.72)',
      },
      '.cm-atmos-search__button--ghost': {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
      },
      '.cm-atmos-search__button--ghost:hover': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.68)' : 'rgba(244, 244, 245, 0.72)',
      },
      '.cm-atmos-search__toggle': {
        position: 'relative',
        padding: '0 12px',
        cursor: 'pointer',
      },
      '.cm-atmos-search__toggle-input': {
        position: 'absolute',
        opacity: '0',
        pointerEvents: 'none',
      },
      '.cm-atmos-search__toggle.is-active': {
        backgroundColor: isDark ? 'rgba(244, 244, 245, 0.08)' : 'rgba(24, 24, 27, 0.06)',
        borderColor: 'transparent',
        color: isDark ? '#fafafa' : '#111827',
      },
      '.cm-atmos-search__toggle-label': {
        fontSize: '11px',
        fontWeight: '600',
      },
      '.cm-atmos-search__disclosure': {
        width: '32px',
        minWidth: '32px',
        height: '32px',
        padding: '0',
      },
      '.cm-atmos-search__disclosure.is-active': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.84)' : 'rgba(244, 244, 245, 0.84)',
      },
      '.cm-atmos-search__inline-options': {
        position: 'absolute',
        top: '50%',
        right: '8px',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      },
      '.cm-atmos-search__row:first-child .cm-atmos-search__field .cm-atmos-search__input': {
        paddingRight: '124px',
      },
      '.cm-atmos-search__inline-options .cm-atmos-search__toggle': {
        height: '24px',
        minWidth: '24px',
        padding: '0 7px',
        borderRadius: '6px',
        backgroundColor: 'transparent',
        borderColor: 'transparent',
      },
      '.cm-atmos-search__inline-options .cm-atmos-search__toggle:hover': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.72)' : 'rgba(244, 244, 245, 0.78)',
      },
      '.cm-atmos-search__inline-options .cm-atmos-search__toggle.is-active': {
        backgroundColor: isDark ? 'rgba(244, 244, 245, 0.1)' : 'rgba(24, 24, 27, 0.08)',
        borderColor: 'transparent',
      },
      '.cm-atmos-search__inline-options .cm-atmos-search__toggle-label': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
      },
      '.cm-atmos-search__icon-wrap': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      '.cm-atmos-search__icon': {
        width: '14px',
        height: '14px',
        strokeWidth: '2',
      },
      '.cm-atmos-search__nav-button .cm-atmos-search__icon': {
        width: '12px',
        height: '12px',
      },
      '.cm-atmos-search__close-button': {
        backgroundColor: 'transparent',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'none',
      },
      '.cm-atmos-search__close-button:hover': {
        backgroundColor: isDark ? 'rgba(39, 39, 42, 0.68)' : 'rgba(244, 244, 245, 0.72)',
      },
      '.cm-atmos-search__close-button .cm-atmos-search__icon': {
        width: '18px',
        height: '18px',
      },
      '.cm-atmos-search__replace-section': {
        display: 'grid',
        gridTemplateRows: '1fr',
        opacity: '1',
        transition: 'grid-template-rows 180ms ease, opacity 180ms ease',
      },
      '.cm-atmos-search__replace-section.is-collapsed': {
        gridTemplateRows: '0fr',
        opacity: '0',
        pointerEvents: 'none',
      },
      '.cm-atmos-search__replace-actions': {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      '.cm-searchMatch': {
        backgroundColor: isDark ? '#854d0e55' : '#fef08a99',
        outline: 'none',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: isDark ? '#ca8a0444' : '#fde047aa',
      },
      '.cm-selectionMatch': {
        backgroundColor: isDark ? '#3b82f633' : '#3b82f622',
      },
      '.cm-minimap-gutter': {
        width: '50px !important',
        maxWidth: '50px !important',
        fontSize: '2px',
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        borderLeft: "1px solid " + (isDark ? "#27272a" : "#e4e4e7"),
      },
      '.cm-minimap-inner': {
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        width: '50px !important',
      },
      '.cm-minimap-inner canvas': {
        maxWidth: '50px !important',
        width: '50px !important',
      },
      '.cm-minimap-overlay-container': {
        zIndex: '2',
        pointerEvents: 'auto',
      },
      '.cm-minimap-overlay': {
        backgroundColor: isDark ? 'rgba(161, 161, 170, 0.55)' : 'rgba(113, 113, 122, 0.45)',
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
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        backgroundColor: isDark ? 'rgba(161, 161, 170, 0.42)' : 'rgba(113, 113, 122, 0.38)',
      },
      '.cm-scroller::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '.cm-scroller::-webkit-scrollbar-corner': {
        background: 'transparent',
      },
    },
    { dark: isDark }
  );
}

function createMinimapExtension(): Extension {
  return showMinimap.compute(['doc'], () => ({
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'cm-minimap';
      return { dom };
    },
    displayText: 'blocks',
    showOverlay: 'always',
  }));
}

export const BaseCodeMirrorEditor: React.FC<BaseCodeMirrorEditorProps> = ({
  className,
  value,
  language,
  isReadOnly,
  autoFocus,
  lineWrap = false,
  enableBracketMatching = true,
  minimap = false,
  breadcrumbs = true,
  lineHighlight = true,
  gitIntegration = false,
  gitDiffSource = null,
  gitDiffRefreshNonce = 0,
  onGitGutterStateChanged,
  navigationTarget,
  onChange,
  onCreateEditor,
  onSave,
  onNavigationTargetApplied,
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
    enableBracketMatching,
    minimap,
    breadcrumbs,
    lineHighlight,
    gitIntegration,
    useDrawSelection: !isTauriRuntime(),
  });
  const [languageCompartment] = useState(() => new Compartment());
  const [readOnlyCompartment] = useState(() => new Compartment());
  const [themeCompartment] = useState(() => new Compartment());
  const [lineWrapCompartment] = useState(() => new Compartment());
  const [bracketMatchingCompartment] = useState(() => new Compartment());
  const [breadcrumbsCompartment] = useState(() => new Compartment());
  const [lineHighlightCompartment] = useState(() => new Compartment());
  const [gitIntegrationCompartment] = useState(() => new Compartment());
  const [searchCompartment] = useState(() => new Compartment());
  const onChangeRef = useRef(onChange);
  const onCreateEditorRef = useRef(onCreateEditor);
  const onSaveRef = useRef(onSave);
  const onNavigationTargetAppliedRef = useRef(onNavigationTargetApplied);
  const onGitGutterStateChangedRef = useRef(onGitGutterStateChanged);

  useEffect(() => {
    onGitGutterStateChangedRef.current = onGitGutterStateChanged;
  }, [onGitGutterStateChanged]);

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
    onNavigationTargetAppliedRef.current = onNavigationTargetApplied;
  }, [onNavigationTargetApplied]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const initialState = initialStateRef.current;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialState.value,
        extensions: [
          gitIntegrationCompartment.of([]),
          lineNumbers(),
          foldGutter(),
          codeFolding(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          ...(initialState.useDrawSelection ? [drawSelection()] : []),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatchingCompartment.of(initialState.enableBracketMatching ? [bracketMatching()] : []),
          closeBrackets(),
          rectangularSelection(),
          crosshairCursor(),
          lineHighlightCompartment.of(initialState.lineHighlight ? [highlightActiveLine(), highlightSelectionMatches()] : []),
          EditorState.tabSize.of(2),
          lineWrapCompartment.of(initialState.lineWrap ? EditorView.lineWrapping : []),
          searchCompartment.of(createSearchExtension()),
          ...(initialState.minimap ? [createMinimapExtension()] : []),
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
  }, [languageCompartment, lineWrapCompartment, readOnlyCompartment, searchCompartment, themeCompartment, bracketMatchingCompartment, breadcrumbsCompartment, lineHighlightCompartment, gitIntegrationCompartment]);

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

    view.dispatch({
      effects: searchCompartment.reconfigure(createSearchExtension()),
    });
  }, [isDark, searchCompartment, themeCompartment]);

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

    view.dispatch({
      effects: bracketMatchingCompartment.reconfigure(enableBracketMatching ? [bracketMatching()] : []),
    });
  }, [enableBracketMatching, bracketMatchingCompartment]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    view.dispatch({
      effects: lineHighlightCompartment.reconfigure(lineHighlight ? [highlightActiveLine(), highlightSelectionMatches()] : []),
    });
  }, [lineHighlight, lineHighlightCompartment]);

  // Breadcrumbs - simple file path breadcrumbs
  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    // Breadcrumbs are implemented in the parent component (CodeMirrorEditor)
    // This compartment is kept for future AST-based breadcrumbs
    view.dispatch({
      effects: breadcrumbsCompartment.reconfigure([]),
    });
  }, [breadcrumbs, breadcrumbsCompartment]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view) return;

    if (!gitIntegration || !gitDiffSource?.repoPath || !gitDiffSource?.fileRelativePath) {
      view.dispatch({
        effects: gitIntegrationCompartment.reconfigure([]),
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const diff = await gitApi.getFileDiff(
          gitDiffSource.repoPath,
          gitDiffSource.fileRelativePath,
          null,
          { againstIndex: true },
        );
        if (cancelled || editorRef.current !== view) return;

        view.dispatch({
          effects: gitIntegrationCompartment.reconfigure(
            createGitChangeGutterExtensions({
              fileRelativePath: gitDiffSource.fileRelativePath,
              fileStatus: diff.status,
              originalContent: diff.old_content,
              stagePatch: async (patch) => {
                try {
                  const r = await gitApi.stagePatchChunk(
                    gitDiffSource.repoPath,
                    gitDiffSource.fileRelativePath,
                    patch,
                    diff.status,
                  );
                  if (!r.success) {
                    return { ok: false, error: r.error ?? 'stage_patch_chunk failed' };
                  }
                  return { ok: true };
                } catch (e) {
                  return {
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                  };
                }
              },
              restorePatch: async (patch) => {
                try {
                  const r = await gitApi.restorePatchChunk(
                    gitDiffSource.repoPath,
                    gitDiffSource.fileRelativePath,
                    patch,
                    diff.status,
                  );
                  if (!r.success) {
                    return { ok: false, error: r.error ?? 'restore_patch_chunk failed' };
                  }
                  return { ok: true };
                } catch (e) {
                  return {
                    ok: false,
                    error: e instanceof Error ? e.message : String(e),
                  };
                }
              },
              onGitStateChanged: (kind) => onGitGutterStateChangedRef.current?.(kind),
            }),
          ),
        });
      } catch {
        if (cancelled || editorRef.current !== view) return;
        view.dispatch({
          effects: gitIntegrationCompartment.reconfigure([]),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gitIntegration,
    gitDiffSource?.repoPath,
    gitDiffSource?.fileRelativePath,
    gitDiffRefreshNonce,
    gitIntegrationCompartment,
  ]);

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

  useEffect(() => {
    const view = editorRef.current;
    if (!view || !navigationTarget) return;

    const safeLine = Math.min(
      Math.max(1, navigationTarget.line),
      view.state.doc.lines || 1
    );
    const line = view.state.doc.line(safeLine);
    const requestedColumn = Math.max(1, navigationTarget.column ?? 1);
    const anchor = Math.min(line.from + requestedColumn - 1, line.to);

    view.dispatch({
      selection: EditorSelection.single(anchor),
      effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
    });
    view.focus();
    onNavigationTargetAppliedRef.current?.();
  }, [navigationTarget]);

  return (
    <div ref={rootRef} className={cn('h-full w-full overflow-hidden', className)} />
  );
};
