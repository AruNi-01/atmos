"use client";

import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Editor,
  commandsCtx,
  defaultValueCtx,
  rootCtx,
} from "@milkdown/kit/core";
import type { Ctx, MilkdownPlugin } from "@milkdown/kit/ctx";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { diff } from "@milkdown/kit/plugin/diff";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { slashFactory, SlashProvider } from "@milkdown/kit/plugin/slash";
import {
  abortStreamingCmd,
  streaming,
  streamingConfig,
} from "@milkdown/kit/plugin/streaming";
import { tooltipFactory, TooltipProvider } from "@milkdown/kit/plugin/tooltip";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { cn } from "@workspace/ui";
import {
  mdLiveEmbedBlock,
  mdLiveEmbedBlockView,
  mdLiveEmbedInline,
  mdLiveEmbedInlineView,
  mdLiveRemarkDirective,
} from "../lib/md-live-embed-plugin";
import {
  emitMdLiveEditorEvent,
  registerMdLiveEditor,
  unregisterMdLiveEditor,
  type MdLiveEditorApi,
} from "../lib/md-live-editor-registry";
import { createMdLiveOnChangeGate } from "../lib/md-live-onchange-gate";
import {
  abortStream,
  acceptAllDiffs,
  clearDiffReview,
  endStream,
  getEditorMarkdown,
  getSelectionMarkdown,
  insertMarkdown,
  pushStreamChunk,
  runBlockAction,
  startStream,
} from "../lib/md-live-milkdown-actions";
import { MdLiveSelectionToolbar } from "./MdLiveSelectionToolbar";
import { MdLiveSlashMenu, type MdLiveSlashPick } from "./MdLiveSlashMenu";

const mdLiveSlash = slashFactory("mdLive");
const mdLiveTooltip = tooltipFactory("mdLive");

type MarkdownLiveEditorProps = {
  filePath: string;
  value: string;
  onChange: (markdown: string) => void;
  onSave?: () => void;
  className?: string;
};

function pluginsOf(plugin: MilkdownPlugin | MilkdownPlugin[]): MilkdownPlugin[] {
  return Array.isArray(plugin) ? plugin : [plugin];
}

export function MarkdownLiveEditor({
  filePath,
  value,
  onChange,
  onSave,
  className,
}: MarkdownLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const filePathRef = useRef(filePath);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  filePathRef.current = filePath;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const commitMarkdown = createMdLiveOnChangeGate(value);

    const slashHost = document.createElement("div");
    slashHost.style.position = "fixed";
    slashHost.style.zIndex = "40";
    slashHost.dataset.show = "false";
    const tooltipHost = document.createElement("div");
    tooltipHost.style.position = "fixed";
    tooltipHost.style.zIndex = "40";
    tooltipHost.dataset.show = "false";
    let slashRoot: Root | null = createRoot(slashHost);
    let tooltipRoot: Root | null = createRoot(tooltipHost);

    let editorRef: Editor | null = null;
    const run = <T,>(fn: (ctx: Ctx) => T): T | undefined => {
      if (!editorRef) return undefined;
      return editorRef.action(fn);
    };

    const handleSlashPick = (pick: MdLiveSlashPick) => {
      run((ctx) => {
        if (pick.kind === "block") runBlockAction(ctx, pick.action, true);
        else insertMarkdown(ctx, pick.markdown, true);
      });
    };

    const renderSlash = (query: string) => {
      slashRoot?.render(<MdLiveSlashMenu query={query} onPick={handleSlashPick} />);
    };
    renderSlash("");

    const slashProviderRef: { current: SlashProvider | undefined } = {
      current: undefined,
    };
    const slashProvider = new SlashProvider({
      content: slashHost,
      debounce: 20,
      trigger: "/",
      shouldShow: (view) => {
        const content = slashProviderRef.current?.getContent(view) ?? "";
        const match = content.match(/(?:^|\s)\/([^\s]*)$/);
        if (!match) return false;
        renderSlash(match[1] ?? "");
        return true;
      },
      floatingUIOptions: { strategy: "fixed" },
    });
    slashProviderRef.current = slashProvider;

    tooltipRoot.render(
      <MdLiveSelectionToolbar
        onBlock={(action) => run((ctx) => runBlockAction(ctx, action))}
        onAi={(kind) => {
          const selection = run((ctx) => getSelectionMarkdown(ctx)) ?? "";
          if (!selection.trim()) return;
          emitMdLiveEditorEvent(filePathRef.current, {
            type: "ai-action",
            kind,
            selection,
          });
        }}
      />,
    );

    const tooltipProvider = new TooltipProvider({
      content: tooltipHost,
      debounce: 20,
      floatingUIOptions: { strategy: "fixed" },
    });

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, el);
        ctx.set(defaultValueCtx, value);
        ctx.set(streamingConfig.key, {
          throttleMs: 100,
          scrollFollow: true,
          diffReviewOnEnd: true,
          ignoreAttrs: { heading: ["id"] },
        });
        ctx.set(mdLiveSlash.key, {
          view: () => ({
            update: (view, prev) => slashProvider?.update(view as never, prev as never),
            destroy: () => slashProvider?.destroy(),
          }),
        });
        ctx.set(mdLiveTooltip.key, {
          view: () => ({
            update: (view, prev) => tooltipProvider.update(view as never, prev as never),
            destroy: () => tooltipProvider.destroy(),
          }),
        });
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          const next = commitMarkdown(markdown);
          if (next == null) return;
          onChangeRef.current(next);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(clipboard)
      .use(pluginsOf(streaming))
      .use(pluginsOf(diff))
      .use(pluginsOf(mdLiveSlash))
      .use(pluginsOf(mdLiveTooltip))
      .use(mdLiveRemarkDirective)
      .use(mdLiveEmbedBlock)
      .use(mdLiveEmbedInline)
      .use(mdLiveEmbedBlockView)
      .use(mdLiveEmbedInlineView);

    editorRef = editor;
    let cancelled = false;

    const api: MdLiveEditorApi = {
      getMarkdown: () => run((ctx) => getEditorMarkdown(ctx)) ?? "",
      getSelectionMarkdown: () => run((ctx) => getSelectionMarkdown(ctx)) ?? "",
      insertMarkdown: (markdown, options) => {
        run((ctx) => insertMarkdown(ctx, markdown, options?.replaceSlash));
      },
      runBlockAction: (action) => {
        run((ctx) => runBlockAction(ctx, action));
      },
      startStream: (insertAt) => run((ctx) => startStream(ctx, insertAt)) ?? false,
      pushChunk: (token) => {
        run((ctx) => pushStreamChunk(ctx, token));
      },
      endStream: (diffReview) => {
        run((ctx) => endStream(ctx, diffReview));
        emitMdLiveEditorEvent(filePathRef.current, { type: "stream-ended" });
      },
      abortStream: (keep) => {
        run((ctx) => abortStream(ctx, keep));
      },
      acceptAllDiffs: () => {
        run((ctx) => acceptAllDiffs(ctx));
      },
      clearDiffReview: () => {
        run((ctx) => clearDiffReview(ctx));
      },
    };

    void editor.create().then(() => {
      if (cancelled) {
        void editor.destroy();
        return;
      }
      registerMdLiveEditor(filePath, api);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSaveRef.current?.();
        return;
      }
      if (event.key === "Escape") {
        const aborted = run((ctx) => ctx.get(commandsCtx).call(abortStreamingCmd.key, { keep: false }));
        if (aborted) {
          event.preventDefault();
          emitMdLiveEditorEvent(filePathRef.current, { type: "stream-aborted" });
        }
      }
    };
    el.addEventListener("keydown", onKeyDown);

    return () => {
      cancelled = true;
      unregisterMdLiveEditor(filePath, api);
      el.removeEventListener("keydown", onKeyDown);
      void editor.destroy();
      slashRoot?.unmount();
      tooltipRoot?.unmount();
      slashRoot = null;
      tooltipRoot = null;
      slashHost.remove();
      tooltipHost.remove();
    };
    // Recreate when the file identity changes via parent key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "md-live milkdown prose prose-[14px] dark:prose-invert max-w-none h-full min-h-0 overflow-y-auto bg-background px-8 py-12",
        "[&_[data-show='false']]:hidden [&_.milkdown]:min-h-full [&_.milkdown]:outline-none",
        className,
      )}
    />
  );
}
