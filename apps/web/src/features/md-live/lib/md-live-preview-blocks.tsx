"use client";

import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Check, ChevronDown, Code } from "lucide-react";
import { $view } from "@milkdown/kit/utils";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import {
  tableCellSchema,
  tableHeaderRowSchema,
  tableHeaderSchema,
  tableRowSchema,
  tableSchema,
} from "@milkdown/kit/preset/gfm";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockGroup,
  CodeBlockHeader,
  CodeBlockIcon,
} from "@/shared/components/code-block/code-block";
import { CopyButton } from "@/shared/components/code-block/copy-button";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import { DualThemes, highlight, type Languages } from "@/shared/utils/shiki";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";
import {
  MARKDOWN_TABLE_CLASS,
  MARKDOWN_TABLE_HEAD_CLASS,
  MARKDOWN_TABLE_ROW_CLASS,
  MARKDOWN_TABLE_TD_CLASS,
  MARKDOWN_TABLE_TH_CLASS,
  MARKDOWN_TABLE_WRAP_CLASS,
} from "@/shared/components/markdown/markdown-table";
import {
  MD_LIVE_CODE_LANG_TO_EXT,
  formatMdLiveCodeLangLabel,
  mdLiveCodeLanguageChoices,
  normalizeMdLiveCodeLang,
} from "./md-live-code-languages";

const SHIKI_LANGS = new Set([
  "html",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "css",
  "json",
  "bash",
  "shellscript",
  "markdown",
  "python",
  "rust",
  "go",
  "java",
  "yaml",
  "toml",
  "sql",
  "dockerfile",
  "c",
  "cpp",
]);

function languageOf(node: Node): string {
  return String(node.attrs.language ?? "").trim();
}

function localeMessages() {
  const locale = currentAppLocale("en") === "zh" ? "zh" : "en";
  return { locale, messages: locale === "zh" ? zhMessages : enMessages };
}

function preventEditorBlur(event: { preventDefault(): void }) {
  event.preventDefault();
}

function LanguageTriggerIcon({ language }: { language: string }) {
  const normalized = language ? normalizeMdLiveCodeLang(language) : "";
  if (!language) return <Code className="size-4 shrink-0" />;
  return <CodeBlockIcon language={MD_LIVE_CODE_LANG_TO_EXT[normalized] || language} />;
}

function CodeLanguagePicker({
  language,
  onLanguageChange,
}: {
  language: string;
  onLanguageChange: (language: string) => void;
}) {
  const t = useTranslations("mdLive");
  const normalized = normalizeMdLiveCodeLang(language);
  const choices = mdLiveCodeLanguageChoices(language);

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs text-neutral-600 hover:bg-black/5 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-50"
          aria-label={t("codeLanguageSelect")}
          title={t("codeLanguageSelect")}
          onMouseDown={preventEditorBlur}
        >
          <LanguageTriggerIcon language={language} />
          <span className="min-w-0 max-w-[9rem] truncate text-xs tracking-tight">
            {formatMdLiveCodeLangLabel(language, t("codeLanguagePlain"))}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-56 p-0"
        onOpenAutoFocus={preventEditorBlur}
        onCloseAutoFocus={preventEditorBlur}
        onMouseDown={preventEditorBlur}
      >
        <Command>
          <CommandList className="max-h-72">
            <CommandEmpty>{t("slashNoResults")}</CommandEmpty>
            <CommandGroup>
              {choices.map((id) => {
                const selected = (id ? normalizeMdLiveCodeLang(id) : "") === normalized;
                return (
                  <CommandItem
                    key={id || "plain"}
                    value={id || "plain text"}
                    onMouseDown={preventEditorBlur}
                    onSelect={() => onLanguageChange(id)}
                  >
                    <LanguageTriggerIcon language={id} />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {formatMdLiveCodeLangLabel(id, t("codeLanguagePlain"))}
                    </span>
                    <Check className={cn("size-3.5", selected ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

async function paintHighlight(overlay: HTMLElement, code: string, language: string): Promise<boolean> {
  const normalized = normalizeMdLiveCodeLang(language);
  if (!normalized || !SHIKI_LANGS.has(normalized)) {
    overlay.replaceChildren();
    return false;
  }
  try {
    const highlighter = await highlight();
    overlay.innerHTML = highlighter.codeToHtml(code, {
      lang: normalized as Languages,
      themes: DualThemes,
    });
    return true;
  } catch {
    overlay.replaceChildren();
    return false;
  }
}

export const mdLiveCodeBlockView = $view(codeBlockSchema.node, () => (node, view: EditorView, getPos) => {
  const root = document.createElement("div");
  root.className = "md-live-preview-code";
  const surface = document.createElement("div");
  surface.className = "md-live-code-surface relative";
  const overlay = document.createElement("div");
  overlay.className = "md-live-preview-code-overlay";
  overlay.contentEditable = "false";
  const editor = document.createElement("pre");
  editor.className = "md-live-preview-code-editor";
  editor.spellcheck = false;
  const content = document.createElement("code");
  content.spellcheck = false;
  editor.append(content);
  surface.append(overlay, editor);

  let headerRoot: Root | null = createRoot(root);
  let highlightSeq = 0;
  const applyLanguage = (language: string) => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos == null) return;
    const current = view.state.doc.nodeAt(pos);
    if (!current || current.type.name !== "code_block") return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
      ...current.attrs,
      language,
    }));
  };
  const refresh = (next: Node) => {
    const language = languageOf(next);
    const text = next.textContent ?? "";
    headerRoot?.render(
      <NextIntlClientProvider {...localeMessages()}>
        <CodeBlock className="my-4">
          <CodeBlockHeader>
            <CodeBlockGroup>
              <CodeLanguagePicker language={language} onLanguageChange={applyLanguage} />
            </CodeBlockGroup>
            <CodeBlockGroup>
              <CopyButton content={text} />
            </CodeBlockGroup>
          </CodeBlockHeader>
          <CodeBlockContent className="max-h-none overflow-x-auto text-[13px] leading-5">
            <div
              ref={(el) => {
                if (el && surface.parentNode !== el) el.append(surface);
              }}
            />
          </CodeBlockContent>
        </CodeBlock>
      </NextIntlClientProvider>,
    );
    const seq = ++highlightSeq;
    void paintHighlight(overlay, text, language).then((ok) => {
      if (seq !== highlightSeq) return;
      root.classList.toggle("is-highlighted", ok);
    });
  };

  refresh(node);

  return {
    dom: root,
    contentDOM: content,
    update: (updated: Node) => {
      if (updated.type.name !== "code_block") return false;
      refresh(updated);
      return true;
    },
    destroy: () => {
      headerRoot?.unmount();
      headerRoot = null;
    },
    ignoreMutation: (mutation: { type: string; target: globalThis.Node }) =>
      mutation.type === "selection" ? false : !content.contains(mutation.target),
    stopEvent: (event: Event) => {
      const target = event.target as HTMLElement | null;
      return Boolean(target?.closest("[data-slot], button"));
    },
  };
});

function tablePartView(tag: string, className: string) {
  return () => {
    const dom = document.createElement(tag);
    dom.className = className;
    return {
      dom,
      contentDOM: dom,
      ignoreMutation: (mutation: { type: string; target: globalThis.Node }) =>
        mutation.type === "selection" ? false : !dom.contains(mutation.target),
    };
  };
}

export const mdLiveTableView = $view(tableSchema.node, () => () => {
  const wrap = document.createElement("div");
  wrap.className = MARKDOWN_TABLE_WRAP_CLASS;
  const table = document.createElement("table");
  table.className = MARKDOWN_TABLE_CLASS;
  wrap.append(table);
  return {
    dom: wrap,
    contentDOM: table,
    ignoreMutation: (mutation: { type: string; target: globalThis.Node }) =>
      mutation.type === "selection" ? false : !table.contains(mutation.target),
  };
});

export const mdLiveTableHeadView = $view(tableHeaderRowSchema.node, () => () => {
  const head = document.createElement("thead");
  head.className = MARKDOWN_TABLE_HEAD_CLASS;
  const row = document.createElement("tr");
  head.append(row);
  return { dom: head, contentDOM: row };
});

export const mdLiveTableRowView = $view(tableRowSchema.node, () => tablePartView("tr", MARKDOWN_TABLE_ROW_CLASS));
export const mdLiveTableHeaderCellView = $view(tableHeaderSchema.node, () => tablePartView("th", MARKDOWN_TABLE_TH_CLASS));
export const mdLiveTableCellView = $view(tableCellSchema.node, () => tablePartView("td", MARKDOWN_TABLE_TD_CLASS));

export function mdLivePreviewBlockPlugins() {
  return [
    mdLiveCodeBlockView,
    mdLiveTableView,
    mdLiveTableHeadView,
    mdLiveTableRowView,
    mdLiveTableHeaderCellView,
    mdLiveTableCellView,
  ];
}
