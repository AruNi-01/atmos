"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Editor,
  commandsCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
} from "@milkdown/kit/core";
import type { Ctx, MilkdownPlugin } from "@milkdown/kit/ctx";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { diff } from "@milkdown/kit/plugin/diff";
import {
  history,
  historyProviderConfig,
  redoCommand,
  undoCommand,
} from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { slashFactory, SlashProvider } from "@milkdown/kit/plugin/slash";
import {
  abortStreamingCmd,
  streaming,
  streamingConfig,
} from "@milkdown/kit/plugin/streaming";
import { tooltipFactory, TooltipProvider } from "@milkdown/kit/plugin/tooltip";
import {
  codeBlockAttr,
  headingIdGenerator,
  inlineCodeAttr,
} from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import {
  abortStream,
  acceptAllDiffs,
  clearDiffReview,
  endStream,
  getEditorMarkdown,
  getSelectionMarkdown,
  insertMarkdown,
  insertText,
  pushStreamChunk,
  deleteSlashQuery,
  focusEditorCaret,
  runBlockAction,
  startStream,
} from "./actions";
import { cn } from "./cn";
import { createMdLiveOnChangeGate } from "./onchange-gate";
import { isMdLiveComposing, mdLiveCompositionDomHandlers, mdLiveComposingPlugin } from "./composing";
import { mdLiveCommonmark, mdLiveHeadingIdPlugin, slugMdLiveHeading } from "./heading-id";
import {
  isMdLiveOverlayEventTarget,
  mdLiveSelectionBlockKindId,
  shouldShowMdLiveSelectionToolbar,
} from "./selection";
import { mdLiveVisibleConvertIds } from "./convert-block";
import {
  applyMdLiveRemarkConfig,
  formatMdLiveSerializedMarkdown,
} from "./markdown-stringify";
import { mdLiveBlockBackspacePlugin } from "./block-backspace";
import { mdLivePlaceholderPlugin } from "./placeholder";
import { mdLiveInlineCodeDelete, mdLiveInlineCodePlugin } from "./inline-code";
import { mdLiveDeleteTableSelection, mdLiveTableDeletePlugin, mdLiveTableViewPlugin } from "./table";
import { mdLiveTaskListPlugins } from "./task-list";
import {
  applyMdLiveToggleDefaultOpen,
  mdLiveToggleDefaultOpenCtx,
  mdLiveTogglePlugins,
} from "./toggle";
import type {
  MdLiveAiActionKind,
  MdLiveCopyFn,
  MdLiveEditorHandle,
  MdLiveMediaOpenKind,
  MdLiveSelectionToolbarProps,
  MdLiveSlashMenuProps,
  MdLiveSlashPick,
} from "./types";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import "./live-editor.css";

const mdLiveSlash = slashFactory("mdLive");
const mdLiveTooltip = tooltipFactory("mdLive");

function pluginsOf(plugin: MilkdownPlugin | MilkdownPlugin[]): MilkdownPlugin[] {
  return Array.isArray(plugin) ? plugin : [plugin];
}

export type MdLiveEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  onSave?: () => void;
  extraPlugins?: Array<MilkdownPlugin | MilkdownPlugin[]>;
  copy?: MdLiveCopyFn;
  slashMenu: ComponentType<MdLiveSlashMenuProps>;
  selectionToolbar: ComponentType<MdLiveSelectionToolbarProps>;
  onReady?: (handle: MdLiveEditorHandle) => void;
  onDispose?: (handle: MdLiveEditorHandle) => void;
  onAiAction?: (kind: MdLiveAiActionKind, selection: string) => void;
  onCopyPrompt?: () => void;
  onOpenMedia?: (kind: MdLiveMediaOpenKind) => void;
  onStreamEnded?: () => void;
  onStreamAborted?: () => void;
  defaultToggleOpen?: boolean;
  className?: string;
};

function mountOverlayHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.zIndex = "50";
  host.style.display = "none";
  host.dataset.show = "false";
  return host;
}

function setOverlayVisible(host: HTMLElement, visible: boolean): void {
  host.dataset.show = visible ? "true" : "false";
  host.style.display = visible ? "block" : "none";
}

export function MdLiveEditor({
  value,
  onChange,
  onSave,
  extraPlugins = [],
  copy,
  slashMenu: SlashMenu,
  selectionToolbar: SelectionToolbar,
  onReady,
  onDispose,
  onAiAction,
  onCopyPrompt,
  onOpenMedia,
  onStreamEnded,
  onStreamAborted,
  defaultToggleOpen = true,
  className,
}: MdLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const copyRef = useRef(copy);
  const onReadyRef = useRef(onReady);
  const onDisposeRef = useRef(onDispose);
  const onAiActionRef = useRef(onAiAction);
  const onCopyPromptRef = useRef(onCopyPrompt);
  const onOpenMediaRef = useRef(onOpenMedia);
  const onStreamEndedRef = useRef(onStreamEnded);
  const onStreamAbortedRef = useRef(onStreamAborted);
  const slashMenuRef = useRef(SlashMenu);
  const selectionToolbarRef = useRef(SelectionToolbar);
  const defaultToggleOpenRef = useRef(defaultToggleOpen);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  copyRef.current = copy;
  onReadyRef.current = onReady;
  onDisposeRef.current = onDispose;
  onAiActionRef.current = onAiAction;
  onCopyPromptRef.current = onCopyPrompt;
  onOpenMediaRef.current = onOpenMedia;
  onStreamEndedRef.current = onStreamEnded;
  onStreamAbortedRef.current = onStreamAborted;
  slashMenuRef.current = SlashMenu;
  selectionToolbarRef.current = SelectionToolbar;
  defaultToggleOpenRef.current = defaultToggleOpen;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const commitMarkdown = createMdLiveOnChangeGate(value);

    const slashHost = mountOverlayHost();
    const tooltipHost = mountOverlayHost();
    let slashRoot: Root | null = createRoot(slashHost);
    let tooltipRoot: Root | null = createRoot(tooltipHost);

    let editorRef: Editor | null = null;
    const run = <T,>(fn: (ctx: Ctx) => T): T | undefined => {
      if (!editorRef) return undefined;
      return editorRef.action(fn);
    };

    const slashProviderRef: { current: SlashProvider | undefined } = {
      current: undefined,
    };

    const handleSlashPick = (pick: MdLiveSlashPick) => {
      if (pick.kind === "open") {
        run((ctx) => deleteSlashQuery(ctx));
        slashProviderRef.current?.hide();
        onOpenMediaRef.current?.(pick.open);
        return;
      }
      run((ctx) => {
        if (pick.kind === "block") runBlockAction(ctx, pick.action, true);
        else if (pick.kind === "text") insertText(ctx, pick.text, true);
        else insertMarkdown(ctx, pick.markdown, true);
      });
      slashProviderRef.current?.hide();
    };

    const renderSlash = (query: string) => {
      const Menu = slashMenuRef.current;
      slashRoot?.render(
        <Menu query={query} onPick={handleSlashPick} copy={copyRef.current} />,
      );
    };
    renderSlash("");

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
    slashProvider.onShow = () => setOverlayVisible(slashHost, true);
    slashProvider.onHide = () => setOverlayVisible(slashHost, false);
    slashProviderRef.current = slashProvider;

    const renderToolbar = (activeBlockId: string | null = null, convertIds: string[] = []) => {
      const Toolbar = selectionToolbarRef.current;
      tooltipRoot?.render(
        <Toolbar
          copy={copyRef.current}
          activeBlockId={activeBlockId}
          convertIds={convertIds}
          onBlock={(action) => run((ctx) => runBlockAction(ctx, action))}
          onCopy={() => {
            const selection = run((ctx) => getSelectionMarkdown(ctx)) ?? "";
            if (!selection.trim()) return;
            void navigator.clipboard.writeText(selection);
          }}
          onCopyPrompt={onCopyPromptRef.current}
          onAi={
            onAiActionRef.current
              ? (kind) => {
                  const selection = run((ctx) => getSelectionMarkdown(ctx)) ?? "";
                  if (!selection.trim()) return;
                  onAiActionRef.current?.(kind, selection);
                }
              : undefined
          }
        />,
      );
    };
    renderToolbar();

    const pointerSelecting = { current: false };
    const tooltipProvider = new TooltipProvider({
      content: tooltipHost,
      debounce: 20,
      floatingUIOptions: { strategy: "fixed" },
      shouldShow: (view) => {
        const show = shouldShowMdLiveSelectionToolbar({
          pointerSelecting: pointerSelecting.current,
          selectionEmpty: view.state.selection.empty,
          selectedText: view.state.doc.textBetween(
            view.state.selection.from,
            view.state.selection.to,
          ),
          editable: view.editable,
          editorFocused: view.hasFocus(),
          tooltipFocused: tooltipHost.contains(document.activeElement),
        });
        if (show) {
          renderToolbar(
            mdLiveSelectionBlockKindId(view.state.doc, view.state.selection.from, view.state.selection.to),
            mdLiveVisibleConvertIds(view.state),
          );
        }
        return show;
      },
    });
    tooltipProvider.onShow = () => setOverlayVisible(tooltipHost, true);
    tooltipProvider.onHide = () => setOverlayVisible(tooltipHost, false);

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const overlayClick = isMdLiveOverlayEventTarget(event.target, [slashHost, tooltipHost]);
      if (!overlayClick) {
        slashProvider.hide();
        if (!el.contains(event.target as Node)) tooltipProvider.hide();
      }
      if (overlayClick) return;
      if (!el.contains(event.target as Node)) return;
      pointerSelecting.current = true;
      tooltipProvider.hide();
    };
    const onPointerUp = () => {
      if (!pointerSelecting.current) return;
      pointerSelecting.current = false;
      const view = run((ctx) => ctx.get(editorViewCtx));
      if (view) tooltipProvider.update(view as never);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, el);
        ctx.set(defaultValueCtx, value);
        ctx.set(editorViewOptionsCtx, {
          attributes: {
            class: "editor",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
            translate: "no",
          },
          handleDOMEvents: mdLiveCompositionDomHandlers,
          handleKeyDown(view, event) {
            if (isMdLiveComposing(view)) return false;
            if (event.key !== "Backspace" && event.key !== "Delete") return false;
            const tableTr = mdLiveDeleteTableSelection(view.state);
            if (tableTr) {
              event.preventDefault();
              view.dispatch(tableTr.scrollIntoView());
              return true;
            }
            const codeTr = mdLiveInlineCodeDelete(view.state, event.key === "Backspace" ? -1 : 1);
            if (!codeTr) return false;
            event.preventDefault();
            view.dispatch(codeTr.scrollIntoView());
            return true;
          },
        });
        applyMdLiveRemarkConfig(ctx);
        ctx.set(mdLiveToggleDefaultOpenCtx.key, defaultToggleOpenRef.current);
        ctx.set(headingIdGenerator.key, (node) => slugMdLiveHeading(node.textContent));
        ctx.set(codeBlockAttr.key, () => ({
          pre: { class: "md-live-pre" },
          code: { class: "md-live-pre-code" },
        }));
        ctx.set(inlineCodeAttr.key, () => ({ class: "md-live-inline-code" }));
        ctx.set(historyProviderConfig.key, { newGroupDelay: 0, depth: 200 });
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
          const next = commitMarkdown(formatMdLiveSerializedMarkdown(markdown));
          if (next == null) return;
          onChangeRef.current(next);
        });
      })
      .use(pluginsOf(mdLiveComposingPlugin))
      .use(mdLiveCommonmark)
      .use(pluginsOf(mdLiveTableDeletePlugin))
      .use(pluginsOf(mdLiveInlineCodePlugin))
      .use(gfm)
      .use(pluginsOf(mdLiveTableViewPlugin(() => copyRef.current)))
      .use(pluginsOf(mdLiveBlockBackspacePlugin))
      .use(pluginsOf(mdLiveHeadingIdPlugin))
      .use(listener)
      .use(pluginsOf(history))
      .use(pluginsOf(mdLiveTaskListPlugins))
      .use(pluginsOf(mdLiveTogglePlugins))
      .use(pluginsOf(mdLivePlaceholderPlugin(() => copyRef.current)))
      .use(clipboard)
      .use(pluginsOf(streaming))
      .use(pluginsOf(diff))
      .use(pluginsOf(mdLiveSlash))
      .use(pluginsOf(mdLiveTooltip));

    for (const plugin of extraPlugins) {
      editor.use(pluginsOf(plugin));
    }

    editorRef = editor;
    let cancelled = false;

    const handle: MdLiveEditorHandle = {
      getMarkdown: () => run((ctx) => getEditorMarkdown(ctx)) ?? "",
      getSelectionMarkdown: () => run((ctx) => getSelectionMarkdown(ctx)) ?? "",
      insertMarkdown: (markdown, options) => {
        run((ctx) => insertMarkdown(ctx, markdown, options?.replaceSlash));
      },
      insertText: (text, options) => {
        run((ctx) => insertText(ctx, text, options?.replaceSlash));
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
        onStreamEndedRef.current?.();
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
      setToggleDefaultOpen: (open) => {
        run((ctx) => applyMdLiveToggleDefaultOpen(ctx, open));
      },
    };

    void editor.create().then(() => {
      if (cancelled) {
        void editor.destroy();
        return;
      }
      commitMarkdown(handle.getMarkdown());
      commitMarkdown.arm();
      run((ctx) => focusEditorCaret(ctx));
      onReadyRef.current?.(handle);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSaveRef.current?.();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) run((ctx) => ctx.get(commandsCtx).call(redoCommand.key));
        else run((ctx) => ctx.get(commandsCtx).call(undoCommand.key));
        return;
      }
      if (event.key === "Escape") {
        if (slashHost.dataset.show === "true" || tooltipHost.dataset.show === "true") {
          slashProvider.hide();
          tooltipProvider.hide();
          event.preventDefault();
          return;
        }
        const aborted = run((ctx) => ctx.get(commandsCtx).call(abortStreamingCmd.key, { keep: false }));
        if (aborted) {
          event.preventDefault();
          onStreamAbortedRef.current?.();
        }
      }
    };
    el.addEventListener("keydown", onKeyDown, true);
    const onBeforeInput = (event: Event) => {
      const inputType = (event as InputEvent).inputType;
      if (inputType === "historyUndo" || inputType === "historyRedo") {
        event.preventDefault();
      }
    };
    el.addEventListener("beforeinput", onBeforeInput);

    return () => {
      cancelled = true;
      onDisposeRef.current?.(handle);
      el.removeEventListener("keydown", onKeyDown, true);
      el.removeEventListener("beforeinput", onBeforeInput);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      void editor.destroy();
      slashRoot?.unmount();
      tooltipRoot?.unmount();
      slashRoot = null;
      tooltipRoot = null;
      slashHost.remove();
      tooltipHost.remove();
    };
    // Recreate when the host remounts (file identity via parent key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      spellCheck={false}
      className={cn(
        "md-live prose prose-[14px] dark:prose-invert max-w-none bg-background",
        "prose-code:before:content-none prose-code:after:content-none prose-blockquote:before:content-none prose-blockquote:after:content-none prose-p:my-2 prose-a:break-all",
        "[&_[data-show='false']]:hidden [&_.milkdown]:border-0 [&_.milkdown]:outline-none [&_.editor]:border-0 [&_.editor]:outline-none",
        className,
      )}
    />
  );
}
