"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Checkbox,
  DropdownMenu,
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
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Local draft for the rename input; reset whenever the menu (re)opens.
  const [renameDraft, setRenameDraft] = React.useState(paneCustomLabel);
  // The Keep toggles are meaningful as soon as there is a name to keep — either a
  // committed label or a non-empty draft — so they light up while typing.
  const hasCustomName =
    renameDraft.trim().length > 0 || paneCustomLabel.trim().length > 0;

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
    // Enter confirms and closes the whole menu.
    onOpenChange(false);
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
    // Blur (e.g. clicking a Keep toggle) persists the draft but keeps the menu
    // open so the user can keep adjusting toggles in the same panel.
    onRenamePaneTitle(renameDraft);
  };

  // Focus the rename input only AFTER the submenu has mounted its focus scope
  // (which pauses the parent menu's focus trap) and registered as a dismissable
  // branch. Focusing synchronously via `autoFocus` during mount makes the root
  // menu treat the focus as an outside interaction and collapse the whole menu.
  const focusRenameInput = React.useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => el.focus());
  }, []);

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
          onPointerLeave={onContextSplitSubmenuLeave}
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

  // Portal the whole menu (trigger + content root) to body so app-shell
  // transforms / zoom cannot turn position:fixed into a mis-offset containing
  // block (same pattern as FileTreeContextMenu).
  const menu = (
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
      <DropdownMenuContent align="start" sideOffset={4} className="z-[90] w-56">
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
              <DropdownMenuSubContent className="w-64 space-y-1 p-2">
                <Input
                  ref={focusRenameInput}
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
                <div
                  role="button"
                  tabIndex={-1}
                  aria-disabled={!hasCustomName}
                  onClick={() => {
                    if (!hasCustomName) return;
                    onToggleKeepAgentName(!paneKeepAgentName);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                    hasCustomName
                      ? "cursor-pointer hover:bg-accent"
                      : "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Bot className="size-4 text-muted-foreground" />
                    <span>{t("contextMenu.keepAgentName")}</span>
                  </span>
                  <Checkbox
                    checked={paneKeepAgentName}
                    disabled={!hasCustomName}
                    tabIndex={-1}
                    className="pointer-events-none"
                  />
                </div>
                <div
                  role="button"
                  tabIndex={-1}
                  aria-disabled={!hasCustomName}
                  onClick={() => {
                    if (!hasCustomName) return;
                    onToggleKeepCwd(!paneKeepCwd);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                    hasCustomName
                      ? "cursor-pointer hover:bg-accent"
                      : "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <FolderTree className="size-4 text-muted-foreground" />
                    <span>{t("contextMenu.keepCwd")}</span>
                  </span>
                  <Checkbox
                    checked={paneKeepCwd}
                    disabled={!hasCustomName}
                    tabIndex={-1}
                    className="pointer-events-none"
                  />
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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

  if (!mounted) return null;
  return createPortal(menu, document.body);
}
