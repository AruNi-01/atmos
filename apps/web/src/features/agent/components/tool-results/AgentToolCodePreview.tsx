"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@workspace/ui";
import { ExpandButton } from "@/shared/components/code-block/expand-button";
import { highlight, DualThemes, type Languages } from "@/shared/utils/shiki";

const LANG_ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  js: "javascript",
  ts: "typescript",
  py: "python",
  rs: "rust",
  yml: "yaml",
  "c++": "cpp",
  md: "markdown",
};

const SUPPORTED_LANGS = new Set([
  "html", "javascript", "typescript", "tsx", "jsx", "css", "json",
  "bash", "shellscript", "markdown", "python", "rust", "go", "java",
  "yaml", "toml", "sql", "dockerfile", "c", "cpp", "plaintext", "text", "txt",
]);

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] ?? lower;
}

function HighlightedCode({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const normalized = normalizeLang(language);
  const canHighlight = SUPPORTED_LANGS.has(normalized) && normalized !== "plaintext" && normalized !== "text" && normalized !== "txt";

  useEffect(() => {
    if (!canHighlight) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHtml(null);
      return;
    }
    let cancelled = false;
    highlight()
      .then((highlighter) => {
        if (cancelled) return;
        const result = highlighter.codeToHtml(code, {
          lang: normalized as Languages,
          themes: DualThemes,
          transformers: [{
            name: "add-line-numbers",
            pre(node) {
              node.properties.class = `${node.properties.class ?? ""} shiki-line-numbers`;
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
  }, [canHighlight, code, normalized]);

  if (html) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  const lines = code.split("\n");
  return (
    <pre className="shiki-line-numbers py-3">
      <code>
        {lines.map((line, idx) => (
          <span key={idx} className="line block px-3 py-0.5 text-[13px] leading-relaxed">
            {line || " "}
          </span>
        ))}
      </code>
    </pre>
  );
}

export function AgentToolCodePreview({
  code,
  language,
  className,
}: {
  code: string;
  language: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const checkOverflow = useCallback(() => {
    const el = contentRef.current;
    if (el) setHasOverflow(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkOverflow, code]);

  return (
    <div className={cn("relative bg-background", className)}>
      {(hasOverflow || expanded) ? (
        <div className="absolute right-2 top-1.5 z-10">
          <ExpandButton
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          />
        </div>
      ) : null}
      <div
        ref={contentRef}
        className={cn(
          "overflow-auto font-mono text-sm leading-5 whitespace-pre",
          expanded ? "max-h-[min(80vh,48rem)]" : "max-h-96",
        )}
      >
        <HighlightedCode code={code} language={language} />
      </div>
    </div>
  );
}
