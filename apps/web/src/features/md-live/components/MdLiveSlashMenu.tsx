"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  ScrollArea,
} from "@workspace/ui";
import { scrollActiveListItemIntoView } from "@/features/welcome/lib/popover-list-scroll";
import {
  CircleDot,
  Code,
  File,
  Film,
  Folder,
  GitPullRequestArrow,
  Image as ImageIcon,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  Minus,
  Smile,
  Table,
  Volume2,
  TextQuote,
} from "lucide-react";
import {
  MD_LIVE_SLASH_GROUPS,
  MD_LIVE_SLASH_ITEMS,
  MdLiveEmojiPicker,
  mdLiveLabel,
  type MdLiveEmbedInsertKind,
  type MdLiveHeadingLevel,
  type MdLiveSlashItem,
  type MdLiveSlashMenuProps,
} from "@atmos/md-live/ui";
import { MdLiveEmbedPicker } from "../embeds/picker";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const LIST_WIDTH = 224;
const NESTED_WIDTH = 360;

function HeadingMark({ level }: { level: MdLiveHeadingLevel }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-[11px] font-semibold tracking-tight text-muted-foreground">
      H{level}
    </span>
  );
}

function headingLevelOf(id: string): MdLiveHeadingLevel | null {
  const match = /^h([1-4])$/.exec(id);
  if (!match) return null;
  return Number(match[1]) as MdLiveHeadingLevel;
}

function ItemIcon({ id }: { id: string }): ReactNode {
  const headingLevel = headingLevelOf(id);
  if (headingLevel) return <HeadingMark level={headingLevel} />;
  if (id === "quote") return <TextQuote className="size-4 text-muted-foreground" />;
  if (id === "ul") return <List className="size-4 text-muted-foreground" />;
  if (id === "ol") return <ListOrdered className="size-4 text-muted-foreground" />;
  if (id === "todo") return <ListChecks className="size-4 text-muted-foreground" />;
  if (id === "toggle") return <ListCollapse className="size-4 text-muted-foreground" />;
  if (id === "code") return <Code className="size-4 text-muted-foreground" />;
  if (id === "inline-code") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center font-mono text-[12px] font-semibold text-muted-foreground">
        `
      </span>
    );
  }
  if (id === "hr") return <Minus className="size-4 text-muted-foreground" />;
  if (id === "table") return <Table className="size-4 text-muted-foreground" />;
  if (id === "image") return <ImageIcon className="size-4 text-muted-foreground" />;
  if (id === "video") return <Film className="size-4 text-muted-foreground" />;
  if (id === "audio") return <Volume2 className="size-4 text-muted-foreground" />;
  if (id === "file") return <File className="size-4 text-muted-foreground" />;
  if (id === "github-issue") return <CircleDot className="size-4 text-muted-foreground" />;
  if (id === "github-pr") return <GitPullRequestArrow className="size-4 text-muted-foreground" />;
  if (id === "path") return <Folder className="size-4 text-muted-foreground" />;
  if (id === "emoji") return <Smile className="size-4 text-muted-foreground" />;
  return null;
}

function slashOverlayIsOpen(node: HTMLElement | null): boolean {
  const host = node?.parentElement;
  return host?.dataset.show === "true" && host.style.display !== "none";
}

export function MdLiveSlashMenu({
  query,
  onPick,
  copy,
  hiddenGroups,
  workspaceRoot = null,
  onKeepSlash,
}: MdLiveSlashMenuProps & { workspaceRoot?: string | null }) {
  const label = useCallback((key: string) => mdLiveLabel(key, copy), [copy]);
  const reduce = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [mode, setMode] = useState<"list" | "emoji" | MdLiveEmbedInsertKind>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const hidden = new Set(hiddenGroups ?? []);
    const catalog = hidden.size
      ? MD_LIVE_SLASH_ITEMS.filter((item) => !hidden.has(item.group))
      : MD_LIVE_SLASH_ITEMS;
    if (mode !== "list") return catalog;
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((item) => {
      const itemLabel = label(item.label).toLowerCase();
      return item.keywords.includes(q) || itemLabel.includes(q) || item.id.includes(q);
    });
  }, [hiddenGroups, label, mode, query]);

  const selectedKey = `${mode}:${filtered.map((item) => item.id).join(",")}`;
  const [selectionKey, setSelectionKey] = useState(selectedKey);
  if (selectionKey !== selectedKey) {
    setSelectionKey(selectedKey);
    setSelectedIndex(0);
  }

  const grouped = useMemo(
    () =>
      MD_LIVE_SLASH_GROUPS.map((group) => ({
        ...group,
        items: filtered.filter((item) => item.group === group.id),
      })).filter((group) => group.items.length > 0),
    [filtered],
  );

  const enterNested = useCallback((next: "emoji" | MdLiveEmbedInsertKind) => {
    onKeepSlash?.();
    setMode(next);
  }, [onKeepSlash]);

  const activateItem = useCallback(async (item: MdLiveSlashItem) => {
    if (item.open === "emoji") {
      enterNested("emoji");
      return;
    }
    if (item.embed) {
      enterNested(item.embed);
      return;
    }
    if (item.open) {
      onPick({ kind: "open", open: item.open });
      return;
    }
    if (item.pick) onPick(item.pick);
  }, [enterNested, onPick]);

  const selectedId = filtered[Math.min(selectedIndex, Math.max(filtered.length - 1, 0))]?.id ?? "";

  useEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return;
    const sync = () => {
      if (host.dataset.show !== "true") setMode("list");
    };
    const observer = new MutationObserver(sync);
    observer.observe(host, { attributes: true, attributeFilter: ["data-show"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mode !== "list") return;
    if (!slashOverlayIsOpen(rootRef.current)) return;
    const container = listRef.current;
    if (!container) return;
    scrollActiveListItemIntoView(container, itemRefs.current, selectedIndex, 3);
  }, [filtered, mode, selectedIndex]);

  useEffect(() => {
    if (mode !== "list") return;
    const onKey = (event: KeyboardEvent) => {
      if (!slashOverlayIsOpen(rootRef.current)) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "ArrowDown") {
        setSelectedIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex((index) => Math.max(index - 1, 0));
        return;
      }
      const item = filtered[Math.min(selectedIndex, Math.max(filtered.length - 1, 0))];
      if (item) void activateItem(item);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activateItem, filtered, mode, selectedIndex]);

  const nested = mode !== "list";
  const slide = mode === "list" ? -16 : 16;
  const catalog = (
    <Command
      shouldFilter={false}
      value={selectedId}
      disablePointerSelection
      onValueChange={() => {}}
      className="h-auto overflow-visible rounded-none bg-transparent"
    >
      <div ref={listRef}>
        <ScrollArea
          scrollFade
          className="h-auto max-h-80 w-full"
          viewportClassName="h-auto max-h-80"
        >
          <CommandList className="max-h-none overflow-visible">
            {grouped.length === 0 ? (
              <CommandEmpty>{label("slashNoResults")}</CommandEmpty>
            ) : grouped.map((group) => (
              <CommandGroup key={group.id} heading={label(group.label)}>
                {group.items.map((item) => {
                  const index = filtered.findIndex((entry) => entry.id === item.id);
                  return (
                    <CommandItem
                      key={item.id}
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      value={item.id}
                      data-selected={item.id === selectedId}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => void activateItem(item)}
                    >
                      <ItemIcon id={item.id} />
                      <span className="min-w-0 truncate">{label(item.label)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </ScrollArea>
      </div>
    </Command>
  );

  const nestedPanel = mode === "emoji" ? (
    <div className="p-1">
      <div className="px-1.5 pt-1">
        <button
          type="button"
          className="inline-flex h-8 items-center rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMode("list")}
        >
          ← {label("slashEmoji")}
        </button>
      </div>
      <MdLiveEmojiPicker
        loadingLabel={label("slashEmojiLoading")}
        errorLabel={label("slashNoResults")}
        onSelect={(native) => onPick({ kind: "text", text: native })}
      />
    </div>
  ) : mode === "github-issue" || mode === "github-pr" || mode === "path" ? (
    <MdLiveEmbedPicker
      embed={mode}
      query={query}
      workspaceRoot={workspaceRoot}
      copy={copy}
      onBack={() => setMode("list")}
      onInsert={(markdown) => onPick({ kind: "markdown", markdown })}
    />
  ) : null;

  return (
    <motion.div
      ref={rootRef}
      data-md-live-slash={mode === "list" ? "menu" : mode}
      data-state="open"
      data-side="bottom"
      className="bg-popover text-popover-foreground z-50 origin-(--radix-popover-content-transform-origin) h-auto overflow-hidden rounded-2xl border border-border/70 text-sm shadow-md outline-none"
      animate={{ width: nested ? NESTED_WIDTH : LIST_WIDTH }}
      transition={reduce ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={reduce ? { opacity: 1 } : { opacity: 0, x: slide }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0, x: -slide }}
          transition={reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }}
        >
          {mode === "list" ? catalog : nestedPanel}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
