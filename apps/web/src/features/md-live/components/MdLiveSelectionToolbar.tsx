"use client";

import { useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  Copy,
  CopyPlus,
  Italic,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  RefreshCw,
  Sparkles,
  Strikethrough,
  TextQuote,
  Type,
} from "lucide-react";
import {
  MD_LIVE_HEADING_LEVELS,
  MD_LIVE_TOOLBAR_CONVERT_IDS,
  mdLiveLabel,
  type MdLiveBlockAction,
  type MdLiveHeadingLevel,
  type MdLiveSelectionToolbarProps,
} from "@atmos/md-live/ui";

type MenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  action: MdLiveBlockAction | { type: "ai"; kind: "ask" | "rewrite" | "summarize" };
};

function menuItem(
  id: string,
  label: string,
  icon: ReactNode,
  action: MenuItem["action"],
): MenuItem {
  return { id, label, icon, action };
}

export function MdLiveSelectionToolbar({
  onBlock,
  onAi,
  onCopy,
  onCopyPrompt,
  copy,
  activeBlockId = null,
  convertIds,
}: MdLiveSelectionToolbarProps) {
  const [copied, setCopied] = useState<"copy" | "prompt" | null>(null);
  const label = (key: string) => mdLiveLabel(key, copy);

  const markCopied = (kind: "copy" | "prompt") => {
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1200);
  };

  const preventFocusSteal = (event: { preventDefault(): void }) => event.preventDefault();

  const allowed = new Set(convertIds ?? MD_LIVE_TOOLBAR_CONVERT_IDS);

  const blockItems: MenuItem[] = [
    menuItem("paragraph", "toolbarParagraph", <Type className="size-4" />, { type: "paragraph" }),
    ...MD_LIVE_HEADING_LEVELS.map((level) =>
      menuItem(`h${level}`, `slashHeading${level}`, <HeadingMark level={level} />, { type: "heading", level }),
    ),
    menuItem("quote", "toolbarQuote", <TextQuote className="size-4" />, { type: "quote" }),
    menuItem("ul", "toolbarBulletList", <List className="size-4" />, { type: "bullet-list" }),
    menuItem("ol", "toolbarOrderedList", <ListOrdered className="size-4" />, { type: "ordered-list" }),
    menuItem("todo", "toolbarTaskList", <ListChecks className="size-4" />, { type: "task-list" }),
    menuItem("toggle", "slashToggle", <ListCollapse className="size-4" />, { type: "toggle" }),
    menuItem("code", "toolbarCode", <Code className="size-4" />, { type: "code" }),
  ].filter((item) => allowed.has(item.id));

  const listItems: MenuItem[] = [
    menuItem("ul", "toolbarBulletList", <List className="size-4" />, { type: "bullet-list" }),
    menuItem("ol", "toolbarOrderedList", <ListOrdered className="size-4" />, { type: "ordered-list" }),
    menuItem("todo", "toolbarTaskList", <ListChecks className="size-4" />, { type: "task-list" }),
  ].filter((item) => allowed.has(item.id));

  const aiItems: MenuItem[] = onAi
    ? [
        { id: "ask", label: "toolbarAsk", icon: <Sparkles className="size-4" />, action: { type: "ai", kind: "ask" } },
        { id: "rewrite", label: "toolbarRewrite", icon: <RefreshCw className="size-4" />, action: { type: "ai", kind: "rewrite" } },
        { id: "summarize", label: "toolbarSummarize", icon: <ListCollapse className="size-4" />, action: { type: "ai", kind: "summarize" } },
      ]
    : [];

  const runItem = (item: MenuItem) => {
    if (item.action.type === "ai") {
      onAi?.(item.action.kind);
      return;
    }
    onBlock(item.action);
  };

  const activeBlock = blockItems.find((item) => item.id === activeBlockId) ?? null;
  const headingLevel = activeBlockId && /^h([1-4])$/.exec(activeBlockId);
  const blockTrigger = (
    <>
      {headingLevel ? (
        <HeadingMark level={Number(headingLevel[1]) as MdLiveHeadingLevel} />
      ) : activeBlockId === "quote" ? (
        <TextQuote className="size-3.5" />
      ) : activeBlockId === "code" ? (
        <Code className="size-3.5" />
      ) : activeBlockId === "ul" ? (
        <List className="size-3.5" />
      ) : activeBlockId === "ol" ? (
        <ListOrdered className="size-3.5" />
      ) : activeBlockId === "todo" ? (
        <ListChecks className="size-3.5" />
      ) : activeBlockId === "toggle" ? (
        <ListCollapse className="size-3.5" />
      ) : (
        <Type className="size-3.5" />
      )}
      <span className="max-w-24 truncate">
        {label(activeBlock?.label ?? "toolbarParagraph")}
      </span>
      <ChevronDown className="size-3 opacity-70" />
    </>
  );

  return (
    <TooltipProvider delayDuration={400}>
    <div data-md-live-toolbar="true" className="flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md">
      {blockItems.length > 0 ? (
        <OverlayMenu
          label={activeBlock ? label(activeBlock.label) : label("toolbarParagraph")}
          trigger={blockTrigger}
          activeId={activeBlock ? activeBlockId : null}
          items={blockItems}
          onSelect={runItem}
          resolveLabel={label}
          preventFocusSteal={preventFocusSteal}
        />
      ) : null}
      {blockItems.length > 0 ? <span className="mx-0.5 h-5 w-px bg-border" /> : null}
      <IconButton label={label("toolbarBold")} onMouseDown={preventFocusSteal} onClick={() => onBlock({ type: "bold" })}>
        <Bold className="size-3.5" />
      </IconButton>
      <IconButton label={label("toolbarItalic")} onMouseDown={preventFocusSteal} onClick={() => onBlock({ type: "italic" })}>
        <Italic className="size-3.5" />
      </IconButton>
      <IconButton label={label("toolbarStrikethrough")} onMouseDown={preventFocusSteal} onClick={() => onBlock({ type: "strikethrough" })}>
        <Strikethrough className="size-3.5" />
      </IconButton>
      <IconButton label={label("toolbarInlineCode")} onMouseDown={preventFocusSteal} onClick={() => onBlock({ type: "inline-code" })}>
        <span className="flex size-3.5 items-center justify-center font-mono text-[12px] font-semibold">`</span>
      </IconButton>
      {listItems.length > 0 ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-border" />
          {listItems.map((item) => (
            <IconButton
              key={item.id}
              label={label(item.label)}
              active={item.id === activeBlockId}
              onMouseDown={preventFocusSteal}
              onClick={() => runItem(item)}
            >
              {item.id === "ol" ? (
                <ListOrdered className="size-3.5" />
              ) : item.id === "todo" ? (
                <ListChecks className="size-3.5" />
              ) : (
                <List className="size-3.5" />
              )}
            </IconButton>
          ))}
        </>
      ) : null}
      <span className="mx-0.5 h-5 w-px bg-border" />
      <IconButton
        label={copied === "copy" ? label("copied") : label("toolbarCopy")}
        onMouseDown={preventFocusSteal}
        onClick={() => {
          onCopy();
          markCopied("copy");
        }}
      >
        {copied === "copy" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </IconButton>
      {onCopyPrompt ? (
        <IconButton
          label={copied === "prompt" ? label("copied") : label("toolbarCopyPrompt")}
          onMouseDown={preventFocusSteal}
          onClick={() => {
            onCopyPrompt();
            markCopied("prompt");
          }}
        >
          {copied === "prompt" ? <Check className="size-3.5" /> : <CopyPlus className="size-3.5" />}
        </IconButton>
      ) : null}
      {aiItems.length > 0 ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-border" />
          <OverlayMenu
            label={label("toolbarAi")}
            iconTrigger={<Sparkles className="size-3.5" />}
            items={aiItems}
            onSelect={runItem}
            resolveLabel={label}
            preventFocusSteal={preventFocusSteal}
          />
        </>
      ) : null}
    </div>
    </TooltipProvider>
  );
}

function OverlayMenu({
  label,
  trigger,
  iconTrigger,
  items,
  onSelect,
  resolveLabel,
  preventFocusSteal,
  activeId = null,
}: {
  label: string;
  trigger?: ReactNode;
  iconTrigger?: ReactNode;
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  resolveLabel: (key: string) => string;
  preventFocusSteal: (event: { preventDefault(): void }) => void;
  activeId?: string | null;
}) {
  const triggerActive = activeId != null && items.some((item) => item.id === activeId);
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            {iconTrigger ? (
              <button
                type="button"
                aria-label={label}
                aria-current={triggerActive ? "true" : undefined}
                className={
                  triggerActive
                    ? "flex size-8 items-center justify-center rounded-sm bg-accent text-accent-foreground"
                    : "flex size-8 items-center justify-center rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                }
                onMouseDown={preventFocusSteal}
              >
                {iconTrigger}
              </button>
            ) : (
              <button
                type="button"
                aria-label={label}
                aria-current={triggerActive ? "true" : undefined}
                className={
                  triggerActive
                    ? "flex h-8 items-center gap-1 rounded-sm bg-accent px-2 text-sm text-accent-foreground"
                    : "flex h-8 items-center gap-1 rounded-sm px-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                }
                onMouseDown={preventFocusSteal}
              >
                {trigger}
              </button>
            )}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[80]">
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-56"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <DropdownMenuItem
              key={item.id}
              data-selected={selected ? "true" : undefined}
              className={selected ? "bg-accent text-accent-foreground" : undefined}
              onMouseDown={preventFocusSteal}
              onSelect={() => onSelect(item)}
            >
              {item.icon}
              <span className="min-w-0 flex-1 truncate">{resolveLabel(item.label)}</span>
              <Check className={selected ? "size-3.5 opacity-100" : "size-3.5 opacity-0"} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconButton({
  label,
  onClick,
  onMouseDown,
  children,
  active = false,
}: {
  label: string;
  onClick: () => void;
  onMouseDown: (event: { preventDefault(): void }) => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-current={active ? "true" : undefined}
          className={
            active
              ? "flex size-8 items-center justify-center rounded-sm bg-accent text-accent-foreground"
              : "flex size-8 items-center justify-center rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          }
          onMouseDown={onMouseDown}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="z-[80]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function HeadingMark({ level }: { level: MdLiveHeadingLevel }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-[11px] font-semibold text-muted-foreground">
      H{level}
    </span>
  );
}
