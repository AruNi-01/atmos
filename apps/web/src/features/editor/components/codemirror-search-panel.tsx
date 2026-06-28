"use client";

import React from "react";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { EditorView, type Panel } from "@codemirror/view";
import { ArrowLeftRight, CaseSensitive, ChevronLeft, ChevronRight, Regex, Replace, ReplaceAll, WholeWord, X } from "lucide-react";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type SearchPanelMessages = {
  findInFile: string;
  replaceWith: string;
  hideReplace: string;
  showReplace: string;
  find: string;
  previousMatch: string;
  nextMatch: string;
  closeSearch: string;
  matchCase: string;
  wholeWord: string;
  regexp: string;
  replace: string;
  replaceAll: string;
};

type SearchPanelTranslationValues = Record<string, string | number | boolean | null | undefined>;

let cachedCodeMirrorSearchLocale: 'en' | 'zh' | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedCodeMirrorSearchTranslator: any = null;
let customSearchPanelMessages: SearchPanelMessages | null = null;

function formatSearchPanelFallbackMessage(template: string, values?: SearchPanelTranslationValues): string {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

function codeMirrorSearchPanelT(key: string, fallback: string, values?: SearchPanelTranslationValues): string {
  const locale = currentAppLocale('en') === 'zh' ? 'zh' : 'en';
  if (!cachedCodeMirrorSearchTranslator || cachedCodeMirrorSearchLocale !== locale) {
    cachedCodeMirrorSearchLocale = locale;
    cachedCodeMirrorSearchTranslator = createTranslator({
      locale,
      messages: locale === 'zh' ? zhMessages : enMessages,
      namespace: 'editor.codeMirrorSearchPanel',
    });
  }

  try {
    return cachedCodeMirrorSearchTranslator(key as never, values as never);
  } catch {
    return formatSearchPanelFallbackMessage(fallback, values);
  }
}

function getDefaultSearchPanelMessages(): SearchPanelMessages {
  return {
    findInFile: codeMirrorSearchPanelT("findInFile", "Find in file"),
    replaceWith: codeMirrorSearchPanelT("replaceWith", "Replace with"),
    hideReplace: codeMirrorSearchPanelT("hideReplace", "Hide replace"),
    showReplace: codeMirrorSearchPanelT("showReplace", "Show replace"),
    find: codeMirrorSearchPanelT("find", "Find"),
    previousMatch: codeMirrorSearchPanelT("previousMatch", "Previous match"),
    nextMatch: codeMirrorSearchPanelT("nextMatch", "Next match"),
    closeSearch: codeMirrorSearchPanelT("closeSearch", "Close search"),
    matchCase: codeMirrorSearchPanelT("matchCase", "Match case"),
    wholeWord: codeMirrorSearchPanelT("wholeWord", "Whole word"),
    regexp: codeMirrorSearchPanelT("regexp", "Regexp"),
    replace: codeMirrorSearchPanelT("replace", "Replace"),
    replaceAll: codeMirrorSearchPanelT("replaceAll", "Replace all"),
  };
}

export function setCodeMirrorSearchPanelMessages(next: SearchPanelMessages) {
  customSearchPanelMessages = next;
}

function createSearchCount(view: EditorView, query: SearchQuery): string {
  if (!query.valid || !query.search) return "";

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

  if (!total) return "";
  if (!activeIndex) return `0/${total}`;

  return `${activeIndex}/${total}`;
}

function createLucideIcon(icon: React.ComponentType<{ className?: string }>) {
  const markup = renderToStaticMarkup(React.createElement(icon, { className: "cm-atmos-search__icon" }));
  const wrapper = document.createElement("span");
  wrapper.className = "cm-atmos-search__icon-wrap";
  wrapper.innerHTML = markup;
  return wrapper;
}

class AtmosSearchPanel implements Panel {
  dom: HTMLElement;

  private readonly view: EditorView;
  private readonly messages: SearchPanelMessages;
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
    this.messages = customSearchPanelMessages ?? getDefaultSearchPanelMessages();
    this.query = getSearchQuery(view.state);
    this.replaceExpanded = !!this.query.replace;
    this.commit = this.commit.bind(this);
    this.keydown = this.keydown.bind(this);

    this.searchField = this.createInput({
      value: this.query.search,
      placeholder: this.messages.findInFile,
      ariaLabel: this.messages.findInFile,
      name: "search",
      mainField: true,
    });
    this.replaceField = this.createInput({
      value: this.query.replace,
      placeholder: this.messages.replaceWith,
      ariaLabel: this.messages.replaceWith,
      name: "replace",
    });
    this.caseField = this.createCheckbox(this.query.caseSensitive);
    this.regexpField = this.createCheckbox(this.query.regexp);
    this.wordField = this.createCheckbox(this.query.wholeWord);
    this.counter = document.createElement("span");
    this.counter.className = "cm-atmos-search__counter";

    const header = document.createElement("div");
    header.className = "cm-atmos-search__header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "cm-atmos-search__title-group";

    this.replaceToggle = this.createIconButton(
      this.replaceExpanded ? this.messages.hideReplace : this.messages.showReplace,
      "",
      () => {
        this.replaceExpanded = !this.replaceExpanded;
        this.syncReplaceState();
      },
    );
    this.replaceToggle.classList.add("cm-atmos-search__disclosure");
    this.replaceToggle.append(createLucideIcon(ArrowLeftRight));

    const title = document.createElement("span");
    title.className = "cm-atmos-search__title";
    title.textContent = this.messages.find;
    this.prevButton = this.createIconButton(this.messages.previousMatch, createLucideIcon(ChevronLeft), () => {
      findPrevious(this.view);
      this.refreshCounter();
    }, "cm-atmos-search__nav-button");
    this.nextButton = this.createIconButton(this.messages.nextMatch, createLucideIcon(ChevronRight), () => {
      findNext(this.view);
      this.refreshCounter();
    }, "cm-atmos-search__nav-button");

    titleGroup.append(title, this.counter, this.prevButton, this.nextButton);

    const headerActions = document.createElement("div");
    headerActions.className = "cm-atmos-search__header-actions";
    headerActions.append(
      this.createIconButton(this.messages.closeSearch, createLucideIcon(X), () => closeSearchPanel(this.view), "cm-atmos-search__close-button"),
    );

    header.append(titleGroup, headerActions);

    const fields = document.createElement("div");
    fields.className = "cm-atmos-search__fields";
    this.queryRow = document.createElement("div");
    this.queryRow.className = "cm-atmos-search__row";
    this.queryRow.append(
      this.wrapField(
        this.searchField,
        this.createInlineOptions(
          this.createToggle(createLucideIcon(CaseSensitive), this.messages.matchCase, this.caseField),
          this.createToggle(createLucideIcon(WholeWord), this.messages.wholeWord, this.wordField),
          this.createToggle(createLucideIcon(Regex), this.messages.regexp, this.regexpField),
        ),
      ),
    );
    this.queryRow.append(this.replaceToggle);
    fields.append(this.queryRow);

    this.replaceSection = document.createElement("div");
    this.replaceSection.className = "cm-atmos-search__replace-section";
    if (!this.view.state.readOnly) {
      this.replaceRow = document.createElement("div");
      this.replaceRow.className = "cm-atmos-search__row";
      this.replaceRow.append(
        this.wrapField(this.replaceField),
        this.wrapReplaceActions(
          this.createButton(createLucideIcon(Replace), this.messages.replace, () => {
            replaceNext(this.view);
            this.refreshCounter();
          }, "outline", true),
          this.createButton(createLucideIcon(ReplaceAll), this.messages.replaceAll, () => {
            replaceAll(this.view);
            this.refreshCounter();
          }, "outline", true),
        ),
      );
      this.replaceSection.append(this.replaceRow);
      fields.append(this.replaceSection);
    }

    this.dom = document.createElement("div");
    this.dom.className = "cm-atmos-search";
    this.dom.setAttribute("data-selection-popover-ignore", "true");
    this.dom.addEventListener("keydown", this.keydown);
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
    const input = document.createElement("input");
    input.className = "cm-atmos-search__input";
    input.value = value;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", ariaLabel);
    input.name = name;
    input.autocomplete = "off";
    input.spellcheck = false;
    if (mainField) input.setAttribute("main-field", "true");
    input.addEventListener("input", this.commit);
    input.addEventListener("change", this.commit);
    return input;
  }

  private createCheckbox(checked: boolean) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-atmos-search__toggle-input";
    input.checked = checked;
    input.addEventListener("change", this.commit);
    return input;
  }

  private createButton(
    content: string | HTMLElement,
    title: string,
    onClick: () => void,
    variant: "primary" | "secondary" | "ghost" | "outline",
    iconOnly = false,
  ) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cm-atmos-search__button cm-atmos-search__button--${variant}`;
    button.title = title;
    button.setAttribute("aria-label", title);
    if (iconOnly) button.classList.add("cm-atmos-search__button--icon");
    if (typeof content === "string") {
      button.textContent = content;
    } else {
      button.append(content);
    }
    button.addEventListener("click", onClick);
    return button;
  }

  private createIconButton(
    ariaLabel: string,
    content: string | HTMLElement,
    onClick: () => void,
    extraClassName?: string,
  ) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-atmos-search__icon-button";
    button.setAttribute("aria-label", ariaLabel);
    button.title = ariaLabel;
    if (extraClassName) button.classList.add(extraClassName);
    if (typeof content === "string") {
      button.textContent = content;
    } else {
      button.append(content);
    }
    button.addEventListener("click", onClick);
    return button;
  }

  private createToggle(content: string | HTMLElement, title: string, input: HTMLInputElement) {
    const toggle = document.createElement("label");
    toggle.className = "cm-atmos-search__toggle";
    toggle.title = title;
    toggle.setAttribute("aria-label", title);

    const text = document.createElement("span");
    text.className = "cm-atmos-search__toggle-label";
    if (typeof content === "string") {
      text.textContent = content;
    } else {
      text.append(content);
    }

    toggle.append(input, text);
    return toggle;
  }

  private createInlineOptions(...children: HTMLElement[]) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-atmos-search__inline-options";
    wrapper.append(...children);
    return wrapper;
  }

  private wrapReplaceActions(...children: HTMLElement[]) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-atmos-search__replace-actions";
    wrapper.append(...children);
    return wrapper;
  }

  private wrapField(input: HTMLInputElement, trailing?: HTMLElement) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-atmos-search__field";
    wrapper.append(input);
    if (trailing) wrapper.append(trailing);
    return wrapper;
  }

  private syncToggleState() {
    for (const input of [this.caseField, this.regexpField, this.wordField]) {
      input.parentElement?.classList.toggle("is-active", input.checked);
    }
  }

  private syncReplaceState() {
    this.replaceSection.classList.toggle("is-collapsed", !this.replaceExpanded);
    this.replaceToggle.setAttribute("aria-label", this.replaceExpanded ? this.messages.hideReplace : this.messages.showReplace);
    this.replaceToggle.setAttribute("title", this.replaceExpanded ? this.messages.hideReplace : this.messages.showReplace);
    this.replaceToggle.classList.toggle("is-active", this.replaceExpanded);
  }

  private refreshCounter() {
    const countText = createSearchCount(this.view, this.query);
    const hasMatches = !!countText && countText !== "No matches";

    this.counter.textContent = countText;
    this.prevButton.classList.toggle("is-hidden", !hasMatches);
    this.nextButton.classList.toggle("is-hidden", !hasMatches);
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
    if (event.key === "Enter" && event.target === this.searchField) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(this.view);
      this.refreshCounter();
      return;
    }

    if (event.key === "Enter" && event.target === this.replaceField) {
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

export function createSearchExtension(): Extension {
  return search({
    top: true,
    createPanel: (view) => new AtmosSearchPanel(view),
  });
}
