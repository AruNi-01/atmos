"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "../../lib/utils";
import {
  estimateMermaidPlaceholderHeight,
  MERMAID_RENDERING_LABEL,
  readMermaidDiagramCache,
  renderMermaidDiagram,
  waitForMermaidSlotReady,
  type MermaidDiagramRecord,
  type MermaidDiagramTheme,
} from "../../lib/mermaid-diagram";

function themeFromResolved(resolvedTheme: string | undefined): MermaidDiagramTheme {
  return resolvedTheme === "dark" ? "dark" : "light";
}

export function MermaidDiagram({
  code,
  isIncomplete = false,
  className,
}: {
  code: string;
  isIncomplete?: boolean;
  language?: string;
  meta?: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const theme = themeFromResolved(resolvedTheme);
  const trimmed = code.trim();
  const [record, setRecord] = useState<MermaidDiagramRecord | null>(() =>
    trimmed && !isIncomplete ? readMermaidDiagramCache(trimmed, theme) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const placeholderHeight = estimateMermaidPlaceholderHeight(trimmed);

  useEffect(() => {
    if (isIncomplete || !trimmed) {
      setRecord(null);
      setError(null);
      return;
    }
    const cached = readMermaidDiagramCache(trimmed, theme);
    if (cached) {
      setRecord(cached);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setRecord(null);
    setError(null);
    void (async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (controller.signal.aborted) return;
      const ready = await waitForMermaidSlotReady(hostRef.current, controller.signal);
      if (!ready || controller.signal.aborted) return;
      try {
        const next = await renderMermaidDiagram(trimmed, theme);
        if (controller.signal.aborted) return;
        setRecord(next);
        setError(null);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to render mermaid diagram");
        setRecord(null);
      }
    })();
    return () => controller.abort();
  }, [isIncomplete, theme, trimmed]);

  if (error) {
    return (
      <div
        className={cn(
          "my-4 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive [overflow-anchor:none]",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  if (record) {
    const imageStyle: CSSProperties = {
      aspectRatio: `${record.width} / ${record.height}`,
    };
    return (
      <div
        ref={hostRef}
        data-streamdown="mermaid-block"
        className={cn(
          "my-4 overflow-hidden rounded-xl border border-border bg-background p-3 [overflow-anchor:none]",
          className,
        )}
      >
        <img
          src={record.imageUrl}
          alt=""
          width={record.width}
          height={record.height}
          decoding="async"
          draggable={false}
          className="mx-auto block h-auto max-w-full"
          style={imageStyle}
          onError={() => {
            setRecord(null);
            setError("Failed to render mermaid diagram");
          }}
        />
      </div>
    );
  }

  if (isIncomplete || !trimmed) {
    return (
      <div
        ref={hostRef}
        data-streamdown="mermaid-block"
        className={cn(
          "my-4 overflow-hidden rounded-xl border border-border bg-background [overflow-anchor:none]",
          className,
        )}
        style={{ minHeight: placeholderHeight }}
      >
        <pre className="m-0 max-h-64 overflow-hidden p-4 font-mono text-[13px] leading-relaxed whitespace-pre text-muted-foreground">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      data-streamdown="mermaid-block"
      className={cn(
        "my-4 flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-background px-4 py-8 text-sm text-muted-foreground [overflow-anchor:none]",
        className,
      )}
      style={{ minHeight: placeholderHeight }}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{MERMAID_RENDERING_LABEL}</span>
    </div>
  );
}
