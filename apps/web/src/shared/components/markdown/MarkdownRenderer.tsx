'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import { useTheme } from 'next-themes';
import { cn } from '@workspace/ui';
import { FileDiff, Code } from 'lucide-react';
import { isMarkdownPatchCode, MarkdownPatchDiff } from './MarkdownPatchDiff';
import { MermaidBlock } from './MermaidBlock';
import { isMermaidFenceLanguage } from './mermaid-view';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockGroup,
  CodeBlockContent,
  CodeBlockIcon,
} from '@/shared/components/code-block/code-block';
import { resolveRelativeMarkdownPath } from "@/shared/lib/markdown-links";
import { CopyButton } from '@/shared/components/code-block/copy-button';
import { ExpandButton } from '@/shared/components/code-block/expand-button';
import { highlight, DualThemes, type Languages } from '@/shared/utils/shiki';
import {
  MARKDOWN_TABLE_CLASS,
  MARKDOWN_TABLE_HEAD_CLASS,
  MARKDOWN_TABLE_ROW_CLASS,
  MARKDOWN_TABLE_TD_CLASS,
  MARKDOWN_TABLE_TH_CLASS,
  MARKDOWN_TABLE_WRAP_CLASS,
} from '@/shared/components/markdown/markdown-table';
import { useIsCodeFenceIncomplete } from 'streamdown';

const LANG_ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rs: 'rust',
  yml: 'yaml',
  'c++': 'cpp',
  md: 'markdown',
};

const LANG_TO_EXT: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  python: 'py',
  rust: 'rs',
  bash: 'sh',
  shellscript: 'sh',
  markdown: 'md',
  yaml: 'yml',
  toml: 'toml',
  json: 'json',
  html: 'html',
  css: 'css',
  go: 'go',
  java: 'java',
  sql: 'sql',
  dockerfile: 'dockerfile',
  c: 'c',
  cpp: 'cpp',
};

const SUPPORTED_LANGS = new Set([
  'html', 'javascript', 'typescript', 'tsx', 'jsx', 'css', 'json',
  'bash', 'shellscript', 'markdown', 'python', 'rust', 'go', 'java',
  'yaml', 'toml', 'sql', 'dockerfile', 'c', 'cpp', 'diff', 'plaintext', 'text', 'txt',
]);

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] ?? lower;
}

function ShikiCode({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const normalized = normalizeLang(language);

    if (!SUPPORTED_LANGS.has(normalized)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHtml(null);
      return;
    }

    highlight()
      .then((highlighter) => {
        if (cancelled) return;
        const result = highlighter.codeToHtml(code, {
          lang: normalized as Languages,
          themes: DualThemes,
          transformers: [{
            name: 'add-line-numbers',
            pre(node) {
              node.properties.class = `${node.properties.class ?? ''} shiki-line-numbers`;
            },
          }],
        });
        setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <pre className={cn("py-1", !language && "px-1")}>
      <code className="text-[13px] leading-relaxed">{code}</code>
    </pre>
  );
}

function PlainTextWithLineNumbers({ code }: { code: string }) {
  const lines = code.split('\n');

  return (
    <pre className="shiki-line-numbers py-3">
      <code>
        {lines.map((line, idx) => (
          <span key={idx} className="line block px-3 py-0.5 text-[13px] leading-relaxed">
            {line || ' '}
          </span>
        ))}
      </code>
    </pre>
  );
}

export function MarkdownCodeBlock({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
  const t = useTranslations("shared.markdownRenderer");
  const fenceIncomplete = useIsCodeFenceIncomplete();
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeText = String(children).replace(/\n$/, '');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const checkOverflow = useCallback(() => {
    const el = contentRef.current;
    if (el) {
      setHasOverflow(el.scrollHeight > el.clientHeight);
    }
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkOverflow]);

  const normalizedLang = language ? normalizeLang(language) : '';
  const isDiffLang = normalizedLang === 'diff';

  const isInline = !className && !String(children).includes('\n');

  if (isInline) {
    return (
      <code className={cn(className, "px-1.5 py-0.5 rounded text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200")} {...props}>
        {children}
      </code>
    );
  }

  if (isMermaidFenceLanguage(language)) {
    return <MermaidBlock code={codeText} isDark={!!isDark} fenceIncomplete={fenceIncomplete} />;
  }

  if (isMarkdownPatchCode(codeText)) {
    return <MarkdownPatchDiff code={codeText} />;
  }

  const hasLang = !!language;
  const usePlainTextWithLineNumbers = !hasLang || !SUPPORTED_LANGS.has(normalizedLang);
  const shikiLanguage = hasLang ? (normalizedLang || language) : 'plaintext';

  return (
    <CodeBlock className="my-4">
      <CodeBlockHeader>
        <CodeBlockGroup>
          {isDiffLang ? (
            <FileDiff className="size-4 shrink-0" />
          ) : hasLang ? (
            <CodeBlockIcon language={LANG_TO_EXT[normalizedLang] || language || 'txt'} />
          ) : (
            <Code className="size-4 shrink-0" />
          )}
          <span className="text-xs uppercase tracking-wider">
            {isDiffLang ? t("common.diff") : (language || t("common.codeBlock"))}
          </span>
        </CodeBlockGroup>
        <CodeBlockGroup>
          {(hasOverflow || expanded) && (
            <ExpandButton
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
            />
          )}
          <CopyButton content={codeText} />
        </CodeBlockGroup>
      </CodeBlockHeader>
      <CodeBlockContent
        ref={contentRef}
        expanded={expanded}
      >
        {usePlainTextWithLineNumbers ? (
          <PlainTextWithLineNumbers code={codeText} />
        ) : (
          <ShikiCode code={codeText} language={shikiLanguage} />
        )}
      </CodeBlockContent>
    </CodeBlock>
  );
}

/**
 * Element styles live on the nodes themselves (like tables) so headings / hr
 * still look right when MarkdownRenderer sits under a parent `.not-prose`
 * (Tailwind Typography skips all `.prose` rules for those descendants).
 */
const DEFAULT_MARKDOWN_COMPONENTS: Components = {
  code: MarkdownCodeBlock,
  pre: ({ children }) => <>{children}</>,
  h1: ({ node: _node, className, children, ...props }) => (
    <h1
      className={cn(
        "mt-6 mb-3 text-2xl font-semibold tracking-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ node: _node, className, children, ...props }) => (
    <h2
      className={cn(
        "mt-5 mb-2.5 text-xl font-semibold tracking-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ node: _node, className, children, ...props }) => (
    <h3
      className={cn(
        "mt-4 mb-2 text-lg font-semibold text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ node: _node, className, children, ...props }) => (
    <h4
      className={cn(
        "mt-3 mb-1.5 text-base font-semibold text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h4>
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr className={cn("my-6 border-border", className)} {...props} />
  ),
  table: ({ children }) => (
    <div className={MARKDOWN_TABLE_WRAP_CLASS}>
      <table className={MARKDOWN_TABLE_CLASS}>{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className={MARKDOWN_TABLE_HEAD_CLASS}>{children}</thead>
  ),
  th: ({ children, style }) => (
    <th className={MARKDOWN_TABLE_TH_CLASS} style={style}>{children}</th>
  ),
  td: ({ children, style }) => (
    <td className={MARKDOWN_TABLE_TD_CLASS} style={style}>{children}</td>
  ),
  tr: ({ children }) => (
    <tr className={MARKDOWN_TABLE_ROW_CLASS}>{children}</tr>
  ),
};

interface MarkdownRendererProps {
  children: string;
  className?: string;
  /** When set, intercepts relative .md links and calls this instead of navigating */
  wikiBasePath?: string;
  onWikiLinkNavigate?: (slug: string, hash?: string) => void;
  /** Expand `<details>` blocks on first render unless the file already set `open`. */
  detailsOpenByDefault?: boolean;
}

function detailsFileOpen(open: unknown): boolean {
  return open === true || open === "" || open === "open";
}

function MarkdownDetails({
  children,
  open,
  startOpen = false,
  ...props
}: React.ComponentProps<"details"> & { startOpen?: boolean }) {
  const ref = React.useRef<HTMLDetailsElement>(null);
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (node) node.open = startOpen;
  }, [startOpen]);
  return (
    <details {...props} ref={ref}>
      {children}
    </details>
  );
}

export function MarkdownRenderer({
  children,
  className,
  wikiBasePath,
  onWikiLinkNavigate,
  detailsOpenByDefault = false,
}: MarkdownRendererProps) {
  const { resolvedTheme } = useTheme();

  const components = React.useMemo(() => {
    const details: Components["details"] = ({ children, open, ...props }) => (
      <MarkdownDetails
        {...props}
        startOpen={detailsFileOpen(open) || detailsOpenByDefault}
      >
        {children}
      </MarkdownDetails>
    );
    const base: Components = { ...DEFAULT_MARKDOWN_COMPONENTS, details };
    if (!wikiBasePath || !onWikiLinkNavigate) return base;
    return {
      ...base,
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (!href) return <a {...props}>{children}</a>;
        const resolved = resolveRelativeMarkdownPath(wikiBasePath, href);
        if (resolved) {
          return (
            <a
              {...props}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                onWikiLinkNavigate(resolved.slug, resolved.hash);
                if (resolved.hash) {
                  setTimeout(() => {
                    window.location.hash = resolved.hash!;
                  }, 50);
                }
              }}
              className={cn("cursor-pointer", props.className)}
            >
              {children}
            </a>
          );
        }
        return <a href={href} {...props}>{children}</a>;
      },
    };
  }, [wikiBasePath, onWikiLinkNavigate, detailsOpenByDefault]);

  return (
    <div className={cn(
      "prose prose-[14px] max-w-none prose-code:before:content-none prose-code:after:content-none",
      "prose-img:inline-block prose-img:m-0 prose-p:my-2 prose-a:break-all",
      "[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0",
      "[&_li.task-list-item]:list-none [&_li.task-list-item]:pl-0",
      "[&_li.task-list-item]:flex [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2",
      "[&_li.task-list-item>input]:mt-1 [&_li.task-list-item>input]:shrink-0",
      "[&_picture]:inline-block [&_img]:inline-block [&_img]:m-0 [&_svg]:inline-block [&_svg]:align-middle [&_svg]:m-0",
      resolvedTheme === 'dark' && "prose-invert",
      className,
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        // rehype-raw enables limited HTML in GFM (e.g. <details>); rehype-sanitize
        // drops unknown agent/XML tags like <file>/<violation> so they are not
        // emitted as React DOM nodes (React 19 console errors on unrecognized tags).
        rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeSlug]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
