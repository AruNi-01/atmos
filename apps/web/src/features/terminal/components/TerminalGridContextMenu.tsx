"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  cn,
} from "@workspace/ui";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ClipboardPaste,
  Columns,
  FolderTree,
  Maximize,
  Minimize,
  Pencil,
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
  /** Whether the focused pane supports custom naming (main workspace grid only). */
  canRenamePane: boolean;
  paneCustomLabel: string;
  paneKeepAgentName: boolean;
  paneKeepCwd: boolean;
  onRenamePaneTitle: (value: string) => void;
  onToggleKeepAgentName: (next: boolean) => void;
  onToggleKeepCwd: (next: boolean) => void;
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
  canRenamePane,
  paneCustomLabel,
  paneKeepAgentName,
  paneKeepCwd,
  onRenamePaneTitle,
  onToggleKeepAgentName,
  onToggleKeepCwd,
  onOpenChange,
  onAction,
  onContextSplitSubmenuEnter,
  onContextSplitSubmenuLeave,
  onContextSplitWithAgent,
}: TerminalGridContextMenuProps) {
  const t = useTranslations("Terminal.chrome");

  // Local draft for the rename input; reset whenever the menu (re)opens.
  const [renameDraft, setRenameDraft] = React.useState(paneCustomLabel);
  const hasCustomName = paneCustomLabel.trim().length > 0;

  const skipBlurCommitRef = React.useRef(false);

  React.useEffect(() => {
    if (contextMenu) {
      setRenameDraft(paneCustomLabel);
      skipBlurCommitRef.current = false;
    }
  }, [contextMenu, paneCustomLabel]);

  const commitRename = () => {
    // Prevent the unmount-blur (fired when the menu closes) from committing twice.
    skipBlurCommitRef.current = true;
    onRenamePaneTitle(renameDraft);
  };

  const cancelRename = () => {
    // Escape / dismiss: discard the draft and close without committing.
    skipBlurCommitRef.current = true;
    setRenameDraft(paneCustomLabel);
    onOpenChange(false);
  };

  const handleRenameBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    onRenamePaneTitle(renameDraft);
  };

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
          <span>{t("contextMenu.newTerminalTab")}</span>
          <DropdownMenuShortcut>⌘T</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("paste")} className="cursor-pointer">
          <ClipboardPaste className="size-4 mr-2 text-muted-foreground" />
          <span>{t("contextMenu.paste")}</span>
          <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
        </DropdownMenuItem>
        {canRenamePane && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer">
                <Pencil className="size-4 mr-2 text-muted-foreground" />
                <span>{t("contextMenu.renameTitle")}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64 p-2">
                <Input
                  autoFocus
                  value={renameDraft}
                  placeholder={t("contextMenu.renamePlaceholder")}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Keep keystrokes inside the input (avoid menu typeahead / navigation).
                    event.stopPropagation();
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                  onBlur={handleRenameBlur}
                  className="h-8 text-sm"
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuCheckboxItem
              checked={paneKeepAgentName}
              disabled={!hasCustomName}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => onToggleKeepAgentName(checked === true)}
              className="cursor-pointer"
            >
              <Bot className="size-4 mr-2 text-muted-foreground" />
              <span>{t("contextMenu.keepAgentName")}</span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={paneKeepCwd}
              disabled={!hasCustomName}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => onToggleKeepCwd(checked === true)}
              className="cursor-pointer"
            >
              <FolderTree className="size-4 mr-2 text-muted-foreground" />
              <span>{t("contextMenu.keepCwd")}</span>
            </DropdownMenuCheckboxItem>
          </>
        )}
        <DropdownMenuItem
          onClick={() => onAction("pin-to-canvas")}
          className={cn("cursor-pointer", isFocusedPanePinned && "bg-accent text-primary")}
          disabled={isFocusedPanePinned}
        >
          <Pin className="size-4 mr-2 text-muted-foreground" />
          <span>
            {isFocusedPanePinned
              ? t("contextMenu.pinnedToCanvas")
              : t("contextMenu.pinToCanvas")}
          </span>
          <DropdownMenuShortcut>⌘⇧P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("previous-panel")} className="cursor-pointer">
          <ArrowLeft className="size-4 mr-2 text-muted-foreground" />
          <span>{t("contextMenu.previousPanel")}</span>
          <DropdownMenuShortcut>⌘[</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("next-panel")} className="cursor-pointer">
          <ArrowRight className="size-4 mr-2 text-muted-foreground" />
          <span>{t("contextMenu.nextPanel")}</span>
          <DropdownMenuShortcut>⌘]</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {renderSplitMenuItem(
          "row",
          t("paneToolbar.splitHorizontal"),
          <Columns className="size-4 mr-2 text-muted-foreground" />,
          "⌘D",
          "split-horizontal",
        )}
        {renderSplitMenuItem(
          "column",
          t("paneToolbar.splitVertical"),
          <Rows className="size-4 mr-2 text-muted-foreground" />,
          "⌘⇧D",
          "split-vertical",
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("maximize")} className="cursor-pointer">
          {isAnyPaneMaximized ? (
            <>
              <Minimize className="size-4 mr-2 text-muted-foreground" />
              <span>{t("contextMenu.restoreTerminal")}</span>
              <DropdownMenuShortcut>⌘⇧F</DropdownMenuShortcut>
            </>
          ) : (
            <>
              <Maximize className="size-4 mr-2 text-muted-foreground" />
              <span>{t("contextMenu.maximizeTerminal")}</span>
              <DropdownMenuShortcut>⌘⇧F</DropdownMenuShortcut>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("close")} className="cursor-pointer text-destructive focus:text-destructive">
          <X className="size-4 mr-2" />
          <span>{t("contextMenu.closeTerminal")}</span>
          <DropdownMenuShortcut>⌘W</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
