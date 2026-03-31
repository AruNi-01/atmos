'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
import remarkBreaks from 'remark-breaks';
import { useTheme } from 'next-themes';
import { cn } from '@workspace/ui';
import { Images, ArrowRightLeft, FileDiff, Code } from 'lucide-react';
import { parsePatchFiles } from '@pierre/diffs';
import { PatchDiff } from '@pierre/diffs/react';
import { MermaidViewerModal } from './MermaidViewerModal';
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockGroup,
  CodeBlockContent,
  CodeBlockIcon,
} from '@/components/code-block/code-block';
import { resolveWikiPath } from "@/components/wiki/wiki-utils";
import { CopyButton } from '@/components/code-block/copy-button';
import { ExpandButton } from '@/components/code-block/expand-button';
import { highlight, DualThemes, type Languages } from '@/utils/shiki';

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
    <pre className="py-3">
      <code>
        {lines.map((line, idx) => (
          <span key={idx} className="line block px-5 py-0.5 text-[13px] leading-relaxed">
            {line || ' '}
          </span>
        ))}
      </code>
    </pre>
  );
}

type MermaidOutputMode = 'svg' | 'ascii';

function MermaidBlock({ code, isDark }: { code: string; isDark: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [outputMode, setOutputMode] = useState<MermaidOutputMode>('svg');
  const [asciiText, setAsciiText] = useState<string | null>(null);
  const [asciiError, setAsciiError] = useState<string | null>(null);
  const [asciiLoading, setAsciiLoading] = useState(false);

  useEffect(() => {
    if (!code?.trim()) return;
    setError(null);
    setRenderedSvg(null);
    let cancelled = false;

    import('mermaid').then((mermaid) => {
      if (cancelled) return;
      try {
        mermaid.default.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        mermaid.default.render(id, code).then(({ svg }) => {
          if (cancelled) return;
          setRenderedSvg(svg);
        }).catch((err: Error) => {
          if (!cancelled) setError(err.message || 'Mermaid render failed');
        }).finally(() => {
          document.querySelectorAll(`body > #${CSS.escape(id)}, body > #d${CSS.escape(id)}`).forEach(el => el.remove());
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mermaid failed');
      }
    }).catch(() => setError('Mermaid not loaded'));

    return () => { cancelled = true; };
  }, [code, isDark]);

  const handleToggleMode = useCallback(() => {
    if (outputMode === 'ascii') {
      setOutputMode('svg');
      return;
    }
    setOutputMode('ascii');
    if (asciiText !== null) return;

    setAsciiLoading(true);
    setAsciiError(null);
    import('beautiful-mermaid').then(({ renderMermaidAscii }) => {
      try {
        const result = renderMermaidAscii(code);
        setAsciiText(result);
      } catch (err) {
        setAsciiError(err instanceof Error ? err.message : 'ASCII render failed');
      } finally {
        setAsciiLoading(false);
      }
    }).catch(() => {
      setAsciiError('Failed to load beautiful-mermaid');
      setAsciiLoading(false);
    });
  }, [outputMode, asciiText, code]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm">
        {error}
      </div>
    );
  }

  return (
    <>
      <CodeBlock className="my-4">
        <CodeBlockHeader>
          <CodeBlockGroup>
            <Images className="size-4" />
            <span className="text-xs uppercase tracking-wider">Mermaid</span>
          </CodeBlockGroup>
          <CodeBlockGroup>
            <button
              onClick={handleToggleMode}
              title={outputMode === 'svg' ? 'Switch to ASCII' : 'Switch to SVG'}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border cursor-pointer",
                "transition-all duration-200 ease-in-out",
                "border-neutral-300 dark:border-neutral-600",
                "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100",
                "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                "active:scale-95"
              )}
            >
              <ArrowRightLeft key={`icon-${outputMode}`} className="size-3 animate-in fade-in-0 duration-200" />
              <span key={outputMode} className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                {outputMode === 'svg' ? 'ASCII' : 'SVG'}
              </span>
            </button>
            <CopyButton content={outputMode === 'ascii' && asciiText ? asciiText : code} />
          </CodeBlockGroup>
        </CodeBlockHeader>

        <div
          role="button"
          tabIndex={0}
          onClick={() => renderedSvg && outputMode === 'svg' && setModalOpen(true)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && renderedSvg && outputMode === 'svg') {
              e.preventDefault();
              setModalOpen(true);
            }
          }}
          className={cn(
            "mermaid-container flex justify-center overflow-hidden rounded-lg bg-background p-4",
            outputMode === 'svg'
              ? "cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              : "hidden"
          )}
          aria-label="Click to enlarge diagram"
          dangerouslySetInnerHTML={renderedSvg ? { __html: renderedSvg } : undefined}
        />

        {outputMode === 'ascii' && (
          <CodeBlockContent className="bg-background">
            {asciiLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                Rendering ASCII...
              </div>
            ) : asciiError ? (
              <div className="p-4 text-destructive text-sm">{asciiError}</div>
            ) : asciiText ? (
              <pre className="p-4 text-[13px] leading-relaxed overflow-x-auto font-mono whitespace-pre">
                {asciiText}
              </pre>
            ) : null}
          </CodeBlockContent>
        )}
      </CodeBlock>

      {renderedSvg && (
        <MermaidViewerModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          svgContent={renderedSvg}
          isDark={isDark}
        />
      )}
    </>
  );
}

function isValidSingleFilePatch(patch: string): boolean {
  try {
    const parsed = parsePatchFiles(patch);
    return parsed.length === 1 && parsed[0].files.length === 1;
  } catch {
    return false;
  }
}

function SafePatchDiff({ code, isDark }: { code: string; isDark: boolean }) {
  const isValid = React.useMemo(() => isValidSingleFilePatch(code), [code]);

  if (!isValid) {
    return <PlainTextWithLineNumbers code={code} />;
  }

  return (
    <PatchDiff
      patch={code}
      options={{
        theme: isDark ? 'pierre-dark' : 'pierre-light',
        diffStyle: 'unified',
        overflow: 'wrap',
        disableLineNumbers: false,
        disableFileHeader: true,
      }}
    />
  );
}

export function MarkdownCodeBlock({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
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
  const isValidPatch = /^@@\s[+-]/m.test(codeText) && (
    codeText.includes('--- ') || codeText.includes('diff --git ')
  );

  const isInline = !className && !String(children).includes('\n');

  if (isInline) {
    return (
      <code className={cn(className, "px-1.5 py-0.5 rounded text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200")} {...props}>
        {children}
      </code>
    );
  }

  if (language === 'mermaid') {
    return <MermaidBlock code={codeText} isDark={!!isDark} />;
  }

  if (isValidPatch) {
    return (
      <CodeBlock className="my-4">
        <CodeBlockHeader>
          <CodeBlockGroup>
            <FileDiff className="size-4 shrink-0" />
            <span className="text-xs uppercase tracking-wider">Diff</span>
          </CodeBlockGroup>
          <CodeBlockGroup>
            <CopyButton content={codeText} />
          </CodeBlockGroup>
        </CodeBlockHeader>
        <CodeBlockContent ref={contentRef} expanded={expanded} className="!px-0">
          <SafePatchDiff code={codeText} isDark={!!isDark} />
        </CodeBlockContent>
      </CodeBlock>
    );
  }

  const hasLang = !!language;
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
            {isDiffLang ? 'Diff' : (language || 'Code Block')}
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
        <ShikiCode code={codeText} language={shikiLanguage} />
      </CodeBlockContent>
    </CodeBlock>
  );
}

const DEFAULT_MARKDOWN_COMPONENTS: Components = {
  code: MarkdownCodeBlock,
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => (
    <div className="not-prose my-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700/50">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-zinc-100 dark:bg-zinc-800/80">{children}</thead>
  ),
  th: ({ children, style }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/50" style={style}>{children}</th>
  ),
  td: ({ children, style }) => (
    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50" style={style}>{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="even:bg-zinc-50 dark:even:bg-zinc-800/40">{children}</tr>
  ),
};

interface MarkdownRendererProps {
  children: string;
  className?: string;
  /** When set, intercepts relative .md links and calls this instead of navigating */
  wikiBasePath?: string;
  onWikiLinkNavigate?: (slug: string, hash?: string) => void;
}

export function MarkdownRenderer({ children, className, wikiBasePath, onWikiLinkNavigate }: MarkdownRendererProps) {
  const { resolvedTheme } = useTheme();

  const components = React.useMemo(() => {
    if (!wikiBasePath || !onWikiLinkNavigate) return DEFAULT_MARKDOWN_COMPONENTS;
    return {
      ...DEFAULT_MARKDOWN_COMPONENTS,
      a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (!href) return <a {...props}>{children}</a>;
        const resolved = resolveWikiPath(wikiBasePath, href);
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
  }, [wikiBasePath, onWikiLinkNavigate]);

  return (
    <div className={cn(
      "prose prose-[14px] max-w-none prose-code:before:content-none prose-code:after:content-none",
      "prose-img:inline-block prose-img:m-0 prose-p:my-2 prose-a:break-all",
      "[&_picture]:inline-block [&_img]:inline-block [&_img]:m-0 [&_svg]:inline-block [&_svg]:align-middle [&_svg]:m-0",
      resolvedTheme === 'dark' && "prose-invert",
      className,
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeSlug]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
