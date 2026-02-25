"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
  cn,
  toastManager,
} from "@workspace/ui";
import { AlertTriangle, ChevronRight, Clock, Eye, Frown, Loader2, Meh, Pencil, Save, Smile } from "lucide-react";
import { formatLocalDateTime } from "@atmos/shared";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { useWikiContext, useWikiStore } from "@/hooks/use-wiki-store";
import { parseFrontmatter, type WikiLevel } from "./wiki-utils";
import { fsApi } from "@/api/ws-api";

const MonacoEditor = dynamic(
  () =>
    import("@/components/editor/BaseMonacoEditor").then((mod) => mod.BaseMonacoEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

/** Level badge config */
function getLevelConfig(level?: WikiLevel | string): { label: string; icon: React.ComponentType<{ className?: string }> } | null {
  switch (level) {
    case "beginner":
      return { label: "Beginner", icon: Smile };
    case "intermediate":
      return { label: "Intermediate", icon: Meh };
    case "advanced":
      return { label: "Advanced", icon: Frown };
    default:
      return null;
  }
}

interface WikiContentProps {
  contextId: string;
  effectivePath: string;
  /** Called when a relative .md link is clicked (slug without .md) */
  onWikiLinkNavigate?: (slug: string, hash?: string) => void;
}

export const WikiContent: React.FC<WikiContentProps> = ({
  contextId,
  effectivePath,
  onWikiLinkNavigate,
}) => {
  const { activeContent, activePage, contentLoading, contentError } =
    useWikiContext(contextId);
  const topRef = useRef<HTMLDivElement>(null);

  const [isPreview, setIsPreview] = useState(true);
  const [localContent, setLocalContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sync local content when active content changes (e.g. page switch)
  useEffect(() => {
    if (activeContent) {
      setLocalContent(activeContent);
    }
  }, [activeContent, activePage]);

  // On page/content change: scroll to hash anchor if present (e.g. from TOC link or refresh), else scroll to top
  useEffect(() => {
    const rawHash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const hash = rawHash ? decodeURIComponent(rawHash) : "";
    if (!hash) {
      topRef.current?.scrollIntoView({ behavior: "instant" });
      return;
    }

    const scrollToHash = () => {
      const root = document.getElementById("wiki-content-root");
      const el = root?.querySelector(`#${CSS.escape(hash)}`);
      if (!el) return false;

      // Find the scrollable viewport (ScrollArea); scrollIntoView can be unreliable with nested scroll
      const viewport = el.closest("[data-slot='scroll-area-viewport']") as HTMLElement | null;
      if (viewport) {
        const elRect = el.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();
        viewport.scrollTop += elRect.top - viewportRect.top - 16; // 16px offset from top
      } else {
        el.scrollIntoView({ behavior: "instant", block: "start" });
      }
      return true;
    };

    // Retry: content may render async; try at 0, 150ms, 400ms, 800ms
    const timers: ReturnType<typeof setTimeout>[] = [];
    [0, 150, 400, 800].forEach((delay) => {
      timers.push(setTimeout(() => scrollToHash(), delay));
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [activePage, activeContent]);

  const hasUnsavedChanges =
    !!activeContent && !!localContent && localContent !== activeContent;

  const fullFilePath = activePage
    ? `${effectivePath}/.atmos/wiki/${activePage}.md`
    : "";

  const handleSave = useCallback(async () => {
    if (!fullFilePath || !localContent || !hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      const res = await fsApi.writeFile(fullFilePath, localContent);
      if (res.success) {
        toastManager.add({
          title: "Saved",
          description: "Wiki page saved successfully",
          type: "success",
        });
        useWikiStore.getState().loadPage(contextId, effectivePath, `${activePage}.md`);
      } else {
        throw new Error("Failed to write file");
      }
    } catch {
      toastManager.add({
        title: "Save Failed",
        description: "Failed to save wiki page",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [contextId, fullFilePath, localContent, hasUnsavedChanges, effectivePath, activePage]);

  if (contentLoading && !activeContent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading page...
      </div>
    );
  }

  if (contentError && !activeContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <AlertTriangle className="size-4 text-destructive" />
        <p className="text-sm">{contentError}</p>
      </div>
    );
  }

  if (!activeContent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a page from the sidebar
      </div>
    );
  }

  const contentToRender = localContent || activeContent || "";
  const { frontmatter, body } = parseFrontmatter(contentToRender);
  const title = (frontmatter.title as string) ?? activePage ?? "Untitled";
  const sources = (frontmatter.sources as string[]) ?? [];
  const levelConfig = getLevelConfig(frontmatter.level);
  const readingTime = frontmatter.reading_time
    ? Number(frontmatter.reading_time)
    : undefined;
  const updatedAt = frontmatter.updated_at as string | undefined;
  const formattedUpdatedAt = (() => {
    if (!updatedAt) return null;
    try {
      return formatLocalDateTime(updatedAt, "yyyy-MM-dd HH:mm:ss");
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header with Edit/Preview toggle */}
      <div className="h-10 shrink-0 px-4 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
          {levelConfig && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-[2px] leading-none shrink-0 bg-muted text-muted-foreground">
              <levelConfig.icon className="size-2.5" />
              {levelConfig.label}
            </span>
          )}
          {readingTime && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
              <Clock className="size-3" />
              {readingTime} min
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasUnsavedChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded transition-colors bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
              title="Save (Cmd+S)"
            >
              {isSaving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              <span>Save</span>
            </button>
          )}
          <button
            onClick={() => setIsPreview(!isPreview)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={isPreview ? "Switch to Edit mode" : "Switch to Preview mode"}
          >
            {isPreview ? (
              <>
                <Pencil className="size-3" />
                <span>Edit</span>
              </>
            ) : (
              <>
                <Eye className="size-3" />
                <span>Preview</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content: Preview or Editor */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isPreview ? (
          <ScrollArea className="h-full">
            <div ref={topRef} />
            <div id="wiki-content-root" className="px-6 py-6 space-y-4">
              {sources.length > 0 && (
                <Collapsible defaultOpen={false} className="rounded-lg border border-border">
                  <CollapsibleTrigger className="group flex items-center gap-2 w-full px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent/30 cursor-pointer transition-colors">
                    <ChevronRight className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                    <span>Relevant source files</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-3 border-t border-border">
                      {sources.map((src) => (
                        <span
                          key={src}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
              <MarkdownRenderer
                wikiBasePath={activePage ?? undefined}
                onWikiLinkNavigate={onWikiLinkNavigate}
              >
                {body}
              </MarkdownRenderer>
              {formattedUpdatedAt && (
                <div className="flex justify-end pt-6">
                  <span className="text-[11px] text-muted-foreground">
                    updated_at: {formattedUpdatedAt}
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <MonacoEditor
            language="markdown"
            value={localContent}
            onChange={(value) => setLocalContent(value ?? "")}
            isReadOnly={false}
            onMount={(editor, monaco) => {
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                () => handleSave()
              );
            }}
          />
        )}
      </div>
    </div>
  );
};
