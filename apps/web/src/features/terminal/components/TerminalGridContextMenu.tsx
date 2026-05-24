"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ClipboardPaste,
  Columns,
  Maximize,
  Minimize,
  Pin,
  Rows,
  SquareTerminal,
  X,
} from "lucide-react";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { TerminalPaneAgent } from "../types/index";

export type TerminalGridContextMenuAction =
  | "new-tab"
  | "paste"
  | "split-horizontal"
  | "split-vertical"
  | "maximize"
  | "pin-to-canvas"
  | "close"
  | "previous-panel"
  | "next-panel";

type TerminalGridContextMenuProps = {
  contextMenu: { x: number; y: number } | null;
  contextSplitSubmenu: "row" | "column" | null;
  quickOpenAgents: Array<{
    agent: TerminalPaneAgent;
    command: string;
  }>;
  isFocusedPanePinned: boolean;
  isAnyPaneMaximized: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: TerminalGridContextMenuAction) => void;
  onContextSplitSubmenuEnter: (key: "row" | "column") => void;
  onContextSplitSubmenuLeave: () => void;
  onContextSplitWithAgent: (
    direction: "row" | "column",
    command: string,
    agent: TerminalPaneAgent,
  ) => void;
};

export function TerminalGridContextMenu({
  contextMenu,
  contextSplitSubmenu,
  quickOpenAgents,
  isFocusedPanePinned,
  isAnyPaneMaximized,
  onOpenChange,
  onAction,
  onContextSplitSubmenuEnter,
  onContextSplitSubmenuLeave,
  onContextSplitWithAgent,
}: TerminalGridContextMenuProps) {
  const renderSplitMenuItem = (
    direction: "row" | "column",
    label: string,
    icon: React.ReactNode,
    shortcut: string,
    action: "split-horizontal" | "split-vertical",
  ) => {
    if (quickOpenAgents.length === 0) {
      return (
        <DropdownMenuItem
          key={action}
          onClick={() => onAction(action)}
          className="cursor-pointer"
        >
          {icon}
          <span>{label}</span>
          <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
        </DropdownMenuItem>
      );
    }

    return (
      <DropdownMenuSub key={action} open={contextSplitSubmenu === direction}>
        <DropdownMenuSubTrigger
          className="cursor-pointer"
          onPointerEnter={() => onContextSplitSubmenuEnter(direction)}
        >
          {icon}
          <span>{label}</span>
          <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="w-56"
          onPointerEnter={() => onContextSplitSubmenuEnter(direction)}
          onPointerLeave={onContextSplitSubmenuLeave}
        >
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => onAction(action)}
          >
            {icon}
            <span>{label}</span>
            <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {quickOpenAgents.map(({ agent, command }) => (
            <DropdownMenuItem
              key={`${action}-${agent.id}`}
              className="cursor-pointer"
              onSelect={() => onContextSplitWithAgent(direction, command, agent)}
            >
              {agent.iconType === "built-in" ? (
                <AgentIcon registryId={agent.id} name={agent.label} size={16} />
              ) : (
                <Bot className="size-4 text-muted-foreground" />
              )}
              <span>{agent.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  return (
    <DropdownMenu
      open={!!contextMenu}
      onOpenChange={onOpenChange}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden
          className="fixed size-0 pointer-events-none"
          style={{
            left: contextMenu?.x ?? -9999,
            top: contextMenu?.y ?? -9999,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-56">
        <DropdownMenuItem onClick={() => onAction("new-tab")} className="cursor-pointer">
          <SquareTerminal className="size-4 mr-2 text-muted-foreground" />
          <span>New Terminal Tab</span>
          <DropdownMenuShortcut>⌘T</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("paste")} className="cursor-pointer">
          <ClipboardPaste className="size-4 mr-2 text-muted-foreground" />
          <span>Paste</span>
          <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onAction("pin-to-canvas")}
          className={cn("cursor-pointer", isFocusedPanePinned && "bg-accent text-primary")}
          disabled={isFocusedPanePinned}
        >
          <Pin className="size-4 mr-2 text-muted-foreground" />
          <span>{isFocusedPanePinned ? "Pinned to Canvas" : "Pin to Canvas"}</span>
          <DropdownMenuShortcut>⌘⇧P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("previous-panel")} className="cursor-pointer">
          <ArrowLeft className="size-4 mr-2 text-muted-foreground" />
          <span>Previous Panel</span>
          <DropdownMenuShortcut>⌘[</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("next-panel")} className="cursor-pointer">
          <ArrowRight className="size-4 mr-2 text-muted-foreground" />
          <span>Next Panel</span>
          <DropdownMenuShortcut>⌘]</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {renderSplitMenuItem(
          "row",
          "Split Horizontal",
          <Columns className="size-4 mr-2 text-muted-foreground" />,
          "⌘D",
          "split-horizontal",
        )}
        {renderSplitMenuItem(
          "column",
          "Split Vertical",
          <Rows className="size-4 mr-2 text-muted-foreground" />,
          "⌘⇧D",
          "split-vertical",
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("maximize")} className="cursor-pointer">
          {isAnyPaneMaximized ? (
            <>
              <Minimize className="size-4 mr-2 text-muted-foreground" />
              <span>Restore Terminal</span>
              <DropdownMenuShortcut>⌘⇧F</DropdownMenuShortcut>
            </>
          ) : (
            <>
              <Maximize className="size-4 mr-2 text-muted-foreground" />
              <span>Maximize Terminal</span>
              <DropdownMenuShortcut>⌘⇧F</DropdownMenuShortcut>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("close")} className="cursor-pointer text-destructive focus:text-destructive">
          <X className="size-4 mr-2" />
          <span>Close Terminal</span>
          <DropdownMenuShortcut>⌘W</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
