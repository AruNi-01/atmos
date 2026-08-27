"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui";
import { scrollActiveListItemIntoView } from "@/features/welcome/lib/popover-list-scroll";
import {
  Code,
  File,
  Film,
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
  type MdLiveHeadingLevel,
  type MdLiveSlashItem,
  type MdLiveSlashMenuProps,
} from "@atmos/md-live/ui";

function HeadingMark({ level }: { level: MdLiveHeadingLevel }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-[11px] font-semibold tracking-tight text-muted-foreground">
      H{level}
    </span>
  );
}

function headingLevelOf(id: string): MdLiveHeadingLevel | null {
  const match = /^h([1-6])$/.exec(id);
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
  if (id === "emoji") return <Smile className="size-4 text-muted-foreground" />;
  return null;
}

function slashOverlayIsOpen(node: HTMLElement | null): boolean {
  const host = node?.parentElement;
  return host?.dataset.show === "true" && host.style.display !== "none";
}

export function MdLiveSlashMenu({ query, onPick, copy }: MdLiveSlashMenuProps) {
  const label = useCallback((key: string) => mdLiveLabel(key, copy), [copy]);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [mode, setMode] = useState<"list" | "emoji">("list");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MD_LIVE_SLASH_ITEMS;
    return MD_LIVE_SLASH_ITEMS.filter((item) => {
      const itemLabel = label(item.label).toLowerCase();
      return item.keywords.includes(q) || itemLabel.includes(q) || item.id.includes(q);
    });
  }, [label, query]);

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

  const activateItem = useCallback(async (item: MdLiveSlashItem) => {
    if (item.open === "emoji") {
      setMode("emoji");
      return;
    }
    if (item.open) {
      onPick({ kind: "open", open: item.open });
      return;
    }
    if (item.pick) onPick(item.pick);
  }, [onPick]);

  const selectedId = filtered[Math.min(selectedIndex, Math.max(filtered.length - 1, 0))]?.id ?? "";

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

  if (mode === "emoji") {
    return (
      <div
        ref={rootRef}
        data-md-live-slash="emoji"
        data-state="open"
        data-side="bottom"
        className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 z-50 w-80 origin-(--radix-popover-content-transform-origin) rounded-md border p-1 shadow-md outline-none"
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="back"
                onMouseDown={(event) => event.preventDefault()}
                onSelect={() => setMode("list")}
              >
                ← {label("slashEmoji")}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="p-1">
          <MdLiveEmojiPicker
            loadingLabel={label("slashEmojiLoading")}
            errorLabel={label("slashNoResults")}
            onSelect={(native) => onPick({ kind: "text", text: native })}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-md-live-slash="menu"
      data-state="open"
      data-side="bottom"
      className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 z-50 w-56 origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-md border shadow-md outline-none"
    >
      <Command
        shouldFilter={false}
        value={selectedId}
        disablePointerSelection
        onValueChange={() => {}}
      >
        <CommandList ref={listRef} className="max-h-80">
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
      </Command>
    </div>
  );
}
