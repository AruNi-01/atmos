'use client';

import React, { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  highlightSelectionMatches,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  searchKeymap,
  setSearchQuery,
} from '@codemirror/search';
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
  Panel,
  rectangularSelection,
} from '@codemirror/view';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { ArrowLeftRight, CaseSensitive, ChevronLeft, ChevronRight, Regex, Replace, ReplaceAll, WholeWord, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@workspace/ui';
import { loadCodeLanguageSupport } from '@/lib/code-language';
import { isTauriRuntime } from '@/lib/desktop-runtime';

export interface BaseCodeMirrorEditorProps {
  className?: string;
  language?: string;
  value: string;
  isReadOnly?: boolean;
  autoFocus?: boolean;
  lineWrap?: boolean;
  navigationTarget?: { line: number; column?: number } | null;
  onChange?: (value: string) => void;
  onCreateEditor?: (view: EditorView) => void;
  onSave?: () => void;
  onNavigationTargetApplied?: () => void;
}

function createSearchCount(view: EditorView, query: SearchQuery): string {
  if (!query.valid || !query.search) return '';

  const cursor = query.getCursor(view.state);
  let total = 0;
  let activeIndex = 0;
  const selection = view.state.selection.main;

  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total += 1;

    if (next.value.from === selection.from && next.value.to === selection.to) {
      activeIndex = total;
    }
  }

  if (!total) return '';
  if (!activeIndex) return `0/${total}`;

  return `${activeIndex}/${total}`;
}

function createLucideIcon(icon: React.ComponentType<{ className?: string }>) {
  const markup = renderToStaticMarkup(React.createElement(icon, { className: 'cm-atmos-search__icon' }));
  const wrapper = document.createElement('span');
  wrapper.className = 'cm-atmos-search__icon-wrap';
  wrapper.innerHTML = markup;
  return wrapper;
}

class AtmosSearchPanel implements Panel {
  dom: HTMLElement;

  private readonly view: EditorView;
  private query: SearchQuery;
  private replaceExpanded: boolean;
  private readonly searchField: HTMLInputElement;
  private readonly replaceField: HTMLInputElement;
  private readonly caseField: HTMLInputElement;
  private readonly regexpField: HTMLInputElement;
  private readonly wordField: HTMLInputElement;
  private readonly counter: HTMLSpanElement;
  private readonly replaceSection: HTMLDivElement;
  private readonly replaceToggle: HTMLButtonElement;
  private readonly queryRow: HTMLDivElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private replaceRow: HTMLDivElement | null = null;

  constructor(view: EditorView) {
    this.view = view;
    this.query = getSearchQuery(view.state);
    this.replaceExpanded = !!this.query.replace;
    this.commit = this.commit.bind(this);
    this.keydown = this.keydown.bind(this);

    this.searchField = this.createInput({
      value: this.query.search,
      placeholder: 'Find in file',
      ariaLabel: 'Find in file',
      name: 'search',
      mainField: true,
    });
    this.replaceField = this.createInput({
      value: this.query.replace,
      placeholder: 'Replace with',
      ariaLabel: 'Replace with',
      name: 'replace',
    });
    this.caseField = this.createCheckbox(this.query.caseSensitive);
    this.regexpField = this.createCheckbox(this.query.regexp);
    this.wordField = this.createCheckbox(this.query.wholeWord);
    this.counter = document.createElement('span');
    this.counter.className = 'cm-atmos-search__counter';

    const header = document.createElement('div');
    header.className = 'cm-atmos-search__header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'cm-atmos-search__title-group';

    this.replaceToggle = this.createIconButton(
      this.replaceExpanded ? 'Hide replace' : 'Show replace',
      '',
      () => {
        this.replaceExpanded = !this.replaceExpanded;
        this.syncReplaceState();
      }
    );
    this.replaceToggle.classList.add('cm-atmos-search__disclosure');
    this.replaceToggle.append(createLucideIcon(ArrowLeftRight));

    const title = document.createElement('span');
    title.className = 'cm-atmos-search__title';
    title.textContent = 'Find';
    this.prevButton = this.createIconButton('Previous match', createLucideIcon(ChevronLeft), () => {
      findPrevious(this.view);
      this.refreshCounter();
    }, 'cm-atmos-search__nav-button');
    this.nextButton = this.createIconButton('Next match', createLucideIcon(ChevronRight), () => {
      findNext(this.view);
      this.refreshCounter();
    }, 'cm-atmos-search__nav-button');

    titleGroup.append(title, this.counter, this.prevButton, this.nextButton);

    const headerActions = document.createElement('div');
    headerActions.className = 'cm-atmos-search__header-actions';
    headerActions.append(
      this.createIconButton('Close search', createLucideIcon(X), () => closeSearchPanel(this.view), 'cm-atmos-search__close-button')
    );

    header.append(titleGroup, headerActions);

    const fields = document.createElement('div');
    fields.className = 'cm-atmos-search__fields';
    this.queryRow = document.createElement('div');
    this.queryRow.className = 'cm-atmos-search__row';
    this.queryRow.append(
      this.wrapField(
        this.searchField,
        this.createInlineOptions(
          this.createToggle(createLucideIcon(CaseSensitive), 'Match case', this.caseField),
          this.createToggle(createLucideIcon(WholeWord), 'Whole word', this.wordField),
          this.createToggle(createLucideIcon(Regex), 'Regexp', this.regexpField)
        )
      )
    );
    this.queryRow.append(this.replaceToggle);
    fields.append(this.queryRow);

    this.replaceSection = document.createElement('div');
    this.replaceSection.className = 'cm-atmos-search__replace-section';
    if (!this.view.state.readOnly) {
      this.replaceRow = document.createElement('div');
      this.replaceRow.className = 'cm-atmos-search__row';
      this.replaceRow.append(
        this.wrapField(this.replaceField),
        this.wrapReplaceActions(
          this.createButton(createLucideIcon(Replace), 'Replace', () => {
            replaceNext(this.view);
            this.refreshCounter();
          }, 'outline', true),
          this.createButton(createLucideIcon(ReplaceAll), 'Replace all', () => {
            replaceAll(this.view);
            this.refreshCounter();
          }, 'outline', true)
        )
      );
      this.replaceSection.append(this.replaceRow);
      fields.append(this.replaceSection);
    }

    this.dom = document.createElement('div');
    this.dom.className = 'cm-atmos-search';
    this.dom.setAttribute('data-selection-popover-ignore', 'true');
    this.dom.addEventListener('keydown', this.keydown);
    this.dom.append(header, fields);

    this.refreshCounter();
    this.syncReplaceState();
  }

  private createInput({
    value,
    placeholder,
    ariaLabel,
    name,
    mainField = false,
  }: {
    value: string;
    placeholder: string;
    ariaLabel: string;
    name: string;
    mainField?: boolean;
  }) {
    const input = document.createElement('input');
    input.className = 'cm-atmos-search__input';
    input.value = value;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', ariaLabel);
    input.name = name;
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (mainField) input.setAttribute('main-field', 'true');
    input.addEventListener('input', this.commit);
    input.addEventListener('change', this.commit);
    return input;
  }

  private createCheckbox(checked: boolean) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cm-atmos-search__toggle-input';
    input.checked = checked;
    input.addEventListener('change', this.commit);
    return input;
  }

  private createButton(
    content: string | HTMLElement,
    title: string,
    onClick: () => void,
    variant: 'primary' | 'secondary' | 'ghost' | 'outline',
    iconOnly = false
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cm-atmos-search__button cm-atmos-search__button--${variant}`;
    button.title = title;
    button.setAttribute('aria-label', title);
    if (iconOnly) button.classList.add('cm-atmos-search__button--icon');
    if (typeof content === 'string') {
      button.textContent = content;
    } else {
      button.append(content);
    }
    button.addEventListener('click', onClick);
    return button;
  }

  private createIconButton(
    ariaLabel: string,
    content: string | HTMLElement,
    onClick: () => void,
    extraClassName?: string
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-atmos-search__icon-button';
    button.setAttribute('aria-label', ariaLabel);
    button.title = ariaLabel;
    if (extraClassName) button.classList.add(extraClassName);
    if (typeof content === 'string') {
      button.textContent = content;
    } else {
      button.append(content);
    }
    button.addEventListener('click', onClick);
    return button;
  }

  private createToggle(content: string | HTMLElement, title: string, input: HTMLInputElement) {
    const toggle = document.createElement('label');
    toggle.className = 'cm-atmos-search__toggle';
    toggle.title = title;
    toggle.setAttribute('aria-label', title);

    const text = document.createElement('span');
    text.className = 'cm-atmos-search__toggle-label';
    if (typeof content === 'string') {
      text.textContent = content;
    } else {
      text.append(content);
    }

    toggle.append(input, text);
    return toggle;
  }

  private createInlineOptions(...children: HTMLElement[]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-atmos-search__inline-options';
    wrapper.append(...children);
    return wrapper;
  }

  private wrapReplaceActions(...children: HTMLElement[]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-atmos-search__replace-actions';
    wrapper.append(...children);
    return wrapper;
  }

  private wrapField(input: HTMLInputElement, trailing?: HTMLElement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-atmos-search__field';
    wrapper.append(input);
    if (trailing) wrapper.append(trailing);
    return wrapper;
  }

  private syncToggleState() {
    for (const input of [this.caseField, this.regexpField, this.wordField]) {
      input.parentElement?.classList.toggle('is-active', input.checked);
    }
  }

  private syncReplaceState() {
    this.replaceSection.classList.toggle('is-collapsed', !this.replaceExpanded);
    this.replaceToggle.setAttribute('aria-label', this.replaceExpanded ? 'Hide replace' : 'Show replace');
    this.replaceToggle.setAttribute('title', this.replaceExpanded ? 'Hide replace' : 'Show replace');
    this.replaceToggle.classList.toggle('is-active', this.replaceExpanded);
  }

  private refreshCounter() {
    const countText = createSearchCount(this.view, this.query);
    const hasMatches = !!countText && countText !== 'No matches';

    this.counter.textContent = countText;
    this.prevButton.classList.toggle('is-hidden', !hasMatches);
    this.nextButton.classList.toggle('is-hidden', !hasMatches);
    this.syncToggleState();
  }

  commit() {
    const query = new SearchQuery({
      search: this.searchField.value,
      caseSensitive: this.caseField.checked,
      regexp: this.regexpField.checked,
      wholeWord: this.wordField.checked,
      replace: this.replaceField.value,
    });

    if (!query.eq(this.query)) {
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
    }

    this.refreshCounter();
  }

  keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && event.target === this.searchField) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(this.view);
      this.refreshCounter();
      return;
    }

    if (event.key === 'Enter' && event.target === this.replaceField) {
      event.preventDefault();
      replaceNext(this.view);
      this.refreshCounter();
    }
  }

  update() {
    const query = getSearchQuery(this.view.state);
    if (!query.eq(this.query)) {
      this.query = query;
      this.searchField.value = query.search;
      this.replaceField.value = query.replace;
      this.caseField.checked = query.caseSensitive;
      this.regexpField.checked = query.regexp;
      this.wordField.checked = query.wholeWord;
      if (query.replace && !this.replaceExpanded) {
        this.replaceExpanded = true;
      }
    }

    this.refreshCounter();
    this.syncReplaceState();
  }

  mount() {
    this.searchField.select();
    this.refreshCounter();
    this.syncReplaceState();
  }

  get pos() {
    return 120;
  }

  get top() {
    return true;
  }
}

function createSearchExtension(): Extension {
  return search({
    top: true,
    createPanel: (view) => new AtmosSearchPanel(view),
  });
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

export const BaseCodeMirrorEditor: React.FC<BaseCodeMirrorEditorProps> = ({
  className,
  value,
  language,
  isReadOnly,
  autoFocus,
  lineWrap = false,
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
    useDrawSelection: !isTauriRuntime(),
  });
  const [languageCompartment] = useState(() => new Compartment());
  const [readOnlyCompartment] = useState(() => new Compartment());
  const [themeCompartment] = useState(() => new Compartment());
  const [lineWrapCompartment] = useState(() => new Compartment());
  const [searchCompartment] = useState(() => new Compartment());
  const onChangeRef = useRef(onChange);
  const onCreateEditorRef = useRef(onCreateEditor);
  const onSaveRef = useRef(onSave);
  const onNavigationTargetAppliedRef = useRef(onNavigationTargetApplied);

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
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          ...(initialState.useDrawSelection ? [drawSelection()] : []),
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
          searchCompartment.of(createSearchExtension()),
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
  }, [languageCompartment, lineWrapCompartment, readOnlyCompartment, searchCompartment, themeCompartment]);

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
