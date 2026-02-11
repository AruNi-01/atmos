'use client';

import React, { useState, useCallback, useEffect } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { useTheme } from 'next-themes';
import { cn } from '@workspace/ui';
import { Copy, Check } from 'lucide-react';
import { MermaidViewerModal } from './MermaidViewerModal';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors cursor-pointer text-zinc-400 hover:bg-black/5 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
    >
      {copied ? (
        <>
          <Check className="size-3.5" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function MermaidBlock({ code, isDark }: { code: string; isDark: boolean }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!code?.trim() || !containerRef.current) return;
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
          if (cancelled || !containerRef.current) return;
          containerRef.current.innerHTML = svg;
          setRenderedSvg(svg);
        }).catch((err: Error) => {
          if (!cancelled) setError(err.message || 'Mermaid render failed');
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mermaid failed');
      }
    }).catch(() => setError('Mermaid not loaded'));

    return () => { cancelled = true; };
  }, [code, isDark]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive text-sm">
        {error}
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        onClick={() => renderedSvg && setModalOpen(true)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && renderedSvg) {
            e.preventDefault();
            setModalOpen(true);
          }
        }}
        className="mermaid-container my-4 flex justify-center cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg overflow-hidden"
        aria-label="Click to enlarge diagram"
      />
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

function CodeBlock({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeText = String(children).replace(/\n$/, '');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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

  return (
    <div className="not-prose relative group rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700/50 my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700/50">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <CopyButton text={codeText} />
      </div>
      <pre className="!m-0 !rounded-none !bg-zinc-50 dark:!bg-zinc-900 p-4 overflow-x-auto">
        <code className={cn(className, "text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200")} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
  code: CodeBlock,
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
}

export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div className={cn(
      "prose prose-[14px] max-w-none prose-code:before:content-none prose-code:after:content-none",
      resolvedTheme === 'dark' && "prose-invert",
      className,
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
