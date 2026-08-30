"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { highlight, DualThemes } from "@/shared/utils/shiki";

function CommandHighlight({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    highlight()
      .then((highlighter) => {
        if (cancelled) return;
        setHtml(
          highlighter.codeToHtml(code, {
            lang: "bash",
            themes: DualThemes,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (html) {
    return (
      <div
        className={cn(
          // globals.css `pre.shiki span.line` padding is unlayered; ! is required to sit flush with `$`.
          "[&_pre.shiki]:!m-0 [&_pre.shiki]:!bg-transparent [&_pre.shiki]:!p-0 [&_pre.shiki]:whitespace-pre",
          "[&_pre.shiki_code]:block [&_pre.shiki_code]:text-[13px] [&_pre.shiki_code]:leading-5",
          "[&_pre.shiki_span.line]:!block [&_pre.shiki_span.line]:!p-0",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <code className="whitespace-pre text-[13px] leading-5 text-foreground">
      {code}
    </code>
  );
}

export function AgentCommandLine({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-x-auto overscroll-x-contain font-mono text-[13px] leading-5",
        className,
      )}
    >
      <div className="flex w-max min-w-full items-start">
        <span className="shrink-0 select-none pr-[1ch] text-muted-foreground">$</span>
        <CommandHighlight code={command} />
      </div>
    </div>
  );
}
