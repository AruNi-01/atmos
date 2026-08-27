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

export function MdLiveSelectionToolbar({
  onBlock,
  onAi,
  onCopy,
  onCopyPrompt,
  copy,
}: MdLiveSelectionToolbarProps) {
  const [copied, setCopied] = useState<"copy" | "prompt" | null>(null);
  const label = (key: string) => mdLiveLabel(key, copy);

  const markCopied = (kind: "copy" | "prompt") => {
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1200);
  };

  const preventFocusSteal = (event: { preventDefault(): void }) => event.preventDefault();

  const blockItems: MenuItem[] = [
    { id: "paragraph", label: "toolbarParagraph", icon: <Type className="size-4" />, action: { type: "paragraph" } },
    ...MD_LIVE_HEADING_LEVELS.map((level) => ({
      id: `h${level}`,
      label: `slashHeading${level}`,
      icon: <HeadingMark level={level} />,
      action: { type: "heading" as const, level },
    })),
    { id: "quote", label: "toolbarQuote", icon: <TextQuote className="size-4" />, action: { type: "quote" } },
    { id: "code", label: "toolbarCode", icon: <Code className="size-4" />, action: { type: "code" } },
  ];

  const listItems: MenuItem[] = [
    { id: "ul", label: "toolbarBulletList", icon: <List className="size-4" />, action: { type: "bullet-list" } },
    { id: "ol", label: "toolbarOrderedList", icon: <ListOrdered className="size-4" />, action: { type: "ordered-list" } },
    { id: "todo", label: "toolbarTaskList", icon: <ListChecks className="size-4" />, action: { type: "task-list" } },
  ];

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

  return (
    <TooltipProvider delayDuration={400}>
    <div data-md-live-toolbar="true" className="flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md">
      <OverlayMenu
        label={label("toolbarParagraph")}
        trigger={
          <>
            <Type className="size-3.5" />
            <span className="max-w-24 truncate">{label("toolbarParagraph")}</span>
            <ChevronDown className="size-3 opacity-70" />
          </>
        }
        items={blockItems}
        onSelect={runItem}
        resolveLabel={label}
        preventFocusSteal={preventFocusSteal}
      />
      <span className="mx-0.5 h-5 w-px bg-border" />
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
      <span className="mx-0.5 h-5 w-px bg-border" />
      <OverlayMenu
        label={label("toolbarList")}
        iconTrigger={<List className="size-3.5" />}
        items={listItems}
        onSelect={runItem}
        resolveLabel={label}
        preventFocusSteal={preventFocusSteal}
      />
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
}: {
  label: string;
  trigger?: ReactNode;
  iconTrigger?: ReactNode;
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  resolveLabel: (key: string) => string;
  preventFocusSteal: (event: { preventDefault(): void }) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            {iconTrigger ? (
              <button
                type="button"
                aria-label={label}
                className="flex size-8 items-center justify-center rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                onMouseDown={preventFocusSteal}
              >
                {iconTrigger}
              </button>
            ) : (
              <button
                type="button"
                aria-label={label}
                className="flex h-8 items-center gap-1 rounded-sm px-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
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
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onMouseDown={preventFocusSteal}
            onSelect={() => onSelect(item)}
          >
            {item.icon}
            <span className="min-w-0 truncate">{resolveLabel(item.label)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IconButton({
  label,
  onClick,
  onMouseDown,
  children,
}: {
  label: string;
  onClick: () => void;
  onMouseDown: (event: { preventDefault(): void }) => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex size-8 items-center justify-center rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground"
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
