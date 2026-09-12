"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import {
  Loader2,
  Maximize2,
  Minimize2,
  Save,
} from "lucide-react";

import { MarkdownToc } from "@/shared/components/markdown/MarkdownToc";
import { automationMdLivePath } from "@/features/automations/lib/automation-md-live-path";
import {
  AUTOMATION_EDITOR_ZOOM_MS,
} from "@/features/automations/lib/automation-editor-zoom";
import {
  useAutomationEditorExpand,
} from "@/features/automations/components/automation-editor-expand";
import {
  getMdLiveEditor,
  waitForMdLiveEditor,
} from "@/features/md-live/lib/md-live-editor-registry";

const MarkdownLiveEditor = dynamic(
  () =>
    import("@/features/md-live/components/MarkdownLiveEditor").then(
      (mod) => mod.MarkdownLiveEditor,
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
  filePath,
  compact = false,
  chrome = true,
  expandable,
  expandId,
  placeholder,
  disabled = false,
  saving = false,
  saved = false,
  onSave,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  path?: string | null;
  filePath?: string;
  compact?: boolean;
  chrome?: boolean;
  expandable?: boolean;
  expandId?: string;
  placeholder?: string;
  disabled?: boolean;
  saving?: boolean;
  saved?: boolean;
  onSave?: () => void;
  className?: string;
}) {
  const t = useTranslations("automation.memory");
  const editorPath = filePath ?? automationMdLivePath("memory", { diskPath: path });
  const previewRootId = `automation-md-live-${editorPath.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const canExpand = expandable ?? compact;
  const zoomId = expandId ?? editorPath;
  const zoom = useAutomationEditorExpand(zoomId, canExpand);
  const filling = zoom.expanded && !zoom.collapsing;
  const showSaveChrome = Boolean(chrome && onSave && (saving || !saved));
  const hadPresentedRef = React.useRef(false);

  React.useLayoutEffect(() => {
    if (!zoom.clip) return;
    if (!zoom.expanded && !hadPresentedRef.current) return;
    if (zoom.expanded) hadPresentedRef.current = true;
    let cancelled = false;
    const focus = () => {
      if (cancelled) return;
      const api = getMdLiveEditor(editorPath);
      if (api) {
        api.focus({ caret: "preserve" });
        return;
      }
      void waitForMdLiveEditor(editorPath).then((next) => {
        if (cancelled || !next) return;
        next.focus({ caret: "preserve" });
      });
    };
    const raf = window.requestAnimationFrame(focus);
    const rest = window.setTimeout(focus, AUTOMATION_EDITOR_ZOOM_MS + 32);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(rest);
    };
  }, [editorPath, zoom.clip, zoom.collapsing, zoom.expanded]);

  return (
    <div
      ref={zoom.placeholderRef}
      className={cn(
        "relative",
        compact ? "h-[280px]" : "h-full",
        className,
      )}
    >
      {(!canExpand || zoom.clip)
        ? zoom.render(
      <div
        ref={zoom.boxRef}
        data-automation-editor-expanded={zoom.expanded ? "" : undefined}
        className={cn(
          "flex min-h-0 flex-col overflow-hidden bg-background border",
          canExpand
            ? cn(
                "absolute",
                zoom.expanded ? "z-50" : "z-30",
                zoom.covered && "pointer-events-none invisible",
              )
            : "relative h-full",
          filling
            ? "rounded-[inherit] border-transparent shadow-none"
            : "rounded-lg border-border",
        )}
        aria-hidden={zoom.covered || undefined}
      >
        {canExpand ? (
          <div className="absolute right-1.5 top-1.5 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={zoom.expanded ? t("collapse") : t("expand")}
                  aria-expanded={zoom.expanded}
                  onMouseDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                  }}
                  onClick={zoom.toggle}
                  disabled={disabled}
                >
                  {zoom.expanded ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {zoom.expanded ? t("collapse") : t("expand")}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}
        {showSaveChrome ? (
          <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-border bg-muted/30 px-3">
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
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            id={previewRootId}
            className={cn(
              "h-full overflow-y-auto overscroll-contain",
              canExpand && !zoom.expanded && "pr-8",
            )}
          >
            <MarkdownLiveEditor
              key={editorPath}
              filePath={editorPath}
              value={value}
              onChange={(next) => {
                if (!disabled) onChange(next);
              }}
              onSave={onSave}
              placeholder={placeholder}
              readOnly={disabled}
              autoFocus={false}
              embedded
              className={zoom.expanded ? "md-live--page-column" : undefined}
              enableAi={false}
              enableMedia={false}
            />
          </div>
          {!compact ? (
            <MarkdownToc markdown={value} scrollContainerId={previewRootId} />
          ) : null}
        </div>
      </div>,
        )
        : null}
    </div>
  );
}
