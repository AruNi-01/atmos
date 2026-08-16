"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Button,
  ScrollArea,
  cn,
} from "@workspace/ui";
import {
  Eye,
  FileText,
  Loader2,
  Save,
} from "lucide-react";

import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { MarkdownToc } from "@/shared/components/markdown/MarkdownToc";

const CodeMirrorEditor = dynamic(
  () =>
    import("@/features/editor/components/BaseCodeMirrorEditor").then(
      (mod) => mod.BaseCodeMirrorEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    ),
  },
);

export function AutomationMemoryEditor({
  value,
  onChange,
  path,
  compact = false,
  defaultPreview = true,
  disabled = false,
  saving = false,
  saved = false,
  onSave,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  path?: string | null;
  compact?: boolean;
  defaultPreview?: boolean;
  disabled?: boolean;
  saving?: boolean;
  saved?: boolean;
  onSave?: () => void;
  className?: string;
}) {
  const t = useTranslations("automation.memory");
  const [isPreview, setIsPreview] = React.useState(defaultPreview);
  const previewRootId = compact
    ? "automation-memory-preview-compact"
    : "automation-memory-preview";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background",
        compact ? "h-[240px]" : "h-full",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3">
        <div className="min-w-0">
          {path ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={path}>
              {path}
            </p>
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">{t("fileHint")}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onSave && (saving || !saved) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onSave}
              disabled={disabled || saving || saved}
            >
              {saving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              {saving ? t("saving") : t("save")}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setIsPreview((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {isPreview ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
            {isPreview ? t("editor") : t("preview")}
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isPreview ? (
          value.trim() ? (
            <>
              <ScrollArea className="h-full">
                <div id={previewRootId} className={cn("px-6 py-5", compact && "px-4 py-3")}>
                  <MarkdownRenderer>{value}</MarkdownRenderer>
                </div>
              </ScrollArea>
              {!compact ? (
                <MarkdownToc markdown={value} scrollContainerId={previewRootId} />
              ) : null}
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {t("emptyPreview")}
            </div>
          )
        ) : (
          <CodeMirrorEditor
            language="markdown"
            value={value}
            onChange={(next) => {
              if (!disabled) onChange(next);
            }}
            isReadOnly={disabled}
            lineWrap
            onSave={onSave}
          />
        )}
      </div>
    </div>
  );
}
