"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Code, Eye, Images, Loader2, Type } from "lucide-react";
import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import {
  estimateMermaidPlaceholderHeight,
  readMermaidDiagramCache,
  renderMermaidDiagram,
  waitForMermaidSlotReady,
  type MermaidDiagramRecord,
  type MermaidDiagramTheme,
} from "@workspace/ui/lib/mermaid-diagram";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockGroup,
  CodeBlockHeader,
} from "@/shared/components/code-block/code-block";
import { CopyButton } from "@/shared/components/code-block/copy-button";
import { DualThemes, highlight } from "@/shared/utils/shiki";
import { MermaidViewerModal } from "./MermaidViewerModal";
import {
  MERMAID_VIEW_MODES,
  mermaidCopyContent,
  type MermaidViewMode,
} from "./mermaid-view";

function themeFromDark(isDark: boolean): MermaidDiagramTheme {
  return isDark ? "dark" : "light";
}

function useMermaidDark(explicit?: boolean): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (explicit != null) return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const next = root.classList.contains("dark");
      setIsDark((prev) => (prev === next ? prev : next));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [explicit]);

  return explicit ?? isDark;
}

export function MermaidModeSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: MermaidViewMode;
  onChange: (mode: MermaidViewMode) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("shared.markdownRenderer.mermaid");
  const labels: Record<MermaidViewMode, string> = {
    ascii: t("modeAscii"),
    source: t("modeSource"),
    preview: t("modePreview"),
  };
  const icons: Record<MermaidViewMode, typeof Type> = {
    ascii: Type,
    source: Code,
    preview: Eye,
  };

  const Icon = icons[value];

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === "ascii" || next === "source" || next === "preview") onChange(next);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("modeGroup")}
        title={t("modeGroup")}
        data-mermaid-chrome=""
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        className={cn(
          "h-auto min-h-0 min-w-0 gap-1 rounded-none border-0 bg-transparent px-0 py-0 text-[11px] leading-none shadow-none",
          "mr-3",
          "text-neutral-600 hover:bg-transparent hover:text-neutral-950",
          "dark:border-0 dark:bg-transparent dark:text-neutral-400 dark:hover:bg-transparent dark:hover:text-neutral-50",
          "focus-visible:border-0 focus-visible:ring-0",
          "[&_svg]:size-3.5 [&_svg]:opacity-70",
          "[&>svg:last-child]:hidden",
        )}
      >
        <Icon className="size-3.5" />
        <SelectValue>{labels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent
        align="end"
        className="min-w-[7.5rem]"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
      >
        {MERMAID_VIEW_MODES.map((mode) => {
          const Icon = icons[mode];
          return (
            <SelectItem key={mode} value={mode} className="text-xs">
              <Icon className="size-3.5" />
              {labels[mode]}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function MermaidSourceFallback({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    highlight()
      .then((highlighter) => {
        if (cancelled) return;
        setHtml(
          highlighter.codeToHtml(code, {
            lang: "mermaid",
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
        data-mermaid-chrome=""
        className="overflow-x-auto bg-background [overflow-anchor:none]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre
      data-mermaid-chrome=""
      className="m-0 overflow-x-auto bg-background p-4 font-mono text-[13px] leading-relaxed whitespace-pre text-muted-foreground [overflow-anchor:none]"
    >
      {code}
    </pre>
  );
}

export function MermaidPreviewPane({
  code,
  mode,
  isDark,
  fenceIncomplete = false,
  showSourceFallback = true,
  onAsciiText,
  onPreviewReady,
}: {
  code: string;
  mode: Exclude<MermaidViewMode, "source">;
  isDark?: boolean;
  fenceIncomplete?: boolean;
  showSourceFallback?: boolean;
  onAsciiText?: (text: string | null) => void;
  onPreviewReady?: (ready: boolean) => void;
}) {
  const t = useTranslations("shared.markdownRenderer");
  const dark = useMermaidDark(isDark);
  const theme = themeFromDark(dark);
  const trimmed = code.trim();
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<MermaidDiagramRecord | null>(() =>
    fenceIncomplete || !trimmed ? null : readMermaidDiagramCache(trimmed, theme),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [asciiText, setAsciiText] = useState<string | null>(null);
  const [asciiError, setAsciiError] = useState<string | null>(null);
  const [asciiLoading, setAsciiLoading] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const placeholderHeight = estimateMermaidPlaceholderHeight(trimmed);

  useEffect(() => {
    onAsciiText?.(asciiText);
  }, [asciiText, onAsciiText]);

  useLayoutEffect(() => {
    onPreviewReady?.(Boolean(record) && !error && !fenceIncomplete);
  }, [record, error, fenceIncomplete, onPreviewReady]);

  useEffect(() => {
    if (fenceIncomplete || !trimmed) {
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
        setError(err instanceof Error ? err.message : t("mermaid.errors.renderFailed"));
        setRecord(null);
      }
    })();
    return () => controller.abort();
  }, [fenceIncomplete, t, theme, trimmed]);

  useEffect(() => {
    setAsciiText(null);
    setAsciiError(null);
    if (mode !== "ascii" || fenceIncomplete || !trimmed) {
      setAsciiLoading(false);
      return;
    }

    let cancelled = false;
    setAsciiLoading(true);
    import("beautiful-mermaid").then(({ renderMermaidAscii }) => {
      if (cancelled) return;
      try {
        setAsciiText(renderMermaidAscii(code));
        setAsciiError(null);
      } catch (err) {
        setAsciiError(err instanceof Error ? err.message : t("mermaid.errors.asciiRenderFailed"));
        setAsciiText(null);
      } finally {
        setAsciiLoading(false);
      }
    }).catch(() => {
      if (cancelled) return;
      setAsciiError(t("mermaid.errors.loadAsciiRendererFailed"));
      setAsciiLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [mode, code, trimmed, fenceIncomplete, t]);

  if (error && !fenceIncomplete && mode === "preview") {
    return (
      <div
        data-mermaid-chrome=""
        className="p-4 text-sm text-destructive [overflow-anchor:none]"
      >
        {error}
      </div>
    );
  }

  const canEnlarge = Boolean(record) && mode === "preview" && !fenceIncomplete;
  const imageStyle: CSSProperties | undefined = record
    ? {
        aspectRatio: `${record.width} / ${record.height}`,
      }
    : undefined;

  return (
    <div ref={hostRef} data-mermaid-chrome="" className="[overflow-anchor:none]">
      {mode === "preview" ? (
        record && !fenceIncomplete ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => canEnlarge && setModalOpen(true)}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && canEnlarge) {
                event.preventDefault();
                setModalOpen(true);
              }
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className={cn(
              "mermaid-container flex justify-center overflow-hidden rounded-lg bg-background p-4",
              "cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            aria-label={t("mermaid.clickToEnlarge")}
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
                setError(t("mermaid.errors.renderFailed"));
              }}
            />
          </div>
        ) : showSourceFallback ? (
          <div
            className="flex items-center justify-center gap-2 px-4 py-8 text-muted-foreground text-sm"
            style={{ minHeight: placeholderHeight }}
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>{t("mermaid.rendering")}</span>
          </div>
        ) : null
      ) : asciiLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          {t("mermaid.renderingAscii")}
        </div>
      ) : asciiError ? (
        <div className="p-4 text-destructive text-sm">{asciiError}</div>
      ) : asciiText ? (
        <CodeBlockContent className="max-h-none bg-background">
          <pre className="p-4 text-[13px] leading-relaxed overflow-x-auto font-mono whitespace-pre">
            {asciiText}
          </pre>
        </CodeBlockContent>
      ) : (
        <MermaidSourceFallback code={code} />
      )}

      {record && (
        <MermaidViewerModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          svgContent={record.svg}
          isDark={dark}
        />
      )}
    </div>
  );
}

export function MermaidBlock({
  code,
  isDark,
  fenceIncomplete = false,
}: {
  code: string;
  isDark?: boolean;
  fenceIncomplete?: boolean;
}) {
  const t = useTranslations("shared.markdownRenderer");
  const [mode, setMode] = useState<MermaidViewMode>("preview");
  const [asciiText, setAsciiText] = useState<string | null>(null);
  const onAsciiText = useCallback((text: string | null) => {
    setAsciiText(text);
  }, []);
  const viewMode = fenceIncomplete ? "source" : mode;

  return (
    <CodeBlock className="my-4 [overflow-anchor:none]">
      <CodeBlockHeader>
        <CodeBlockGroup>
          <Images className="size-4" />
          <span className="text-xs tracking-tight">{t("mermaid.title")}</span>
        </CodeBlockGroup>
        <CodeBlockGroup>
          {!fenceIncomplete && (
            <MermaidModeSwitch value={mode} onChange={setMode} />
          )}
          <CopyButton content={mermaidCopyContent(viewMode, code, asciiText)} />
        </CodeBlockGroup>
      </CodeBlockHeader>

      {viewMode === "source" ? (
        <MermaidSourceFallback code={code} />
      ) : (
        <MermaidPreviewPane
          code={code}
          mode={viewMode}
          isDark={isDark}
          fenceIncomplete={fenceIncomplete}
          onAsciiText={onAsciiText}
        />
      )}
    </CodeBlock>
  );
}
