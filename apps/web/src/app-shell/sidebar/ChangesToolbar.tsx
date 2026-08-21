"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Check,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Loader2,
  toastManager,
} from "@workspace/ui";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { useSidebarUiPrefs } from "@/shared/stores/use-ui-pref-hooks";
import { cn } from "@/shared/lib/utils";

export type ChangesDiffScope = "branch" | "unstaged" | "staged" | "commit";

interface ChangesScopeMenuProps {
  scope: ChangesDiffScope;
  selectedCommitHash: string | null;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectScope: (scope: Exclude<ChangesDiffScope, "commit">) => void;
  onOpenHistory?: () => void;
}

interface ChangesToolbarProps extends ChangesScopeMenuProps {
  className?: string;
  isBusy?: boolean;
  onStageAll?: () => Promise<void> | void;
  onUnstageAll?: () => Promise<void> | void;
  onDiscardTracked?: () => Promise<void> | void;
  onTrashUntracked?: () => Promise<void> | void;
}

function formatCommitScopeLabel(fallbackHash: string | null) {
  return fallbackHash ? fallbackHash.slice(0, 7) : null;
}

function ChangesScopeMenu({
  scope,
  selectedCommitHash,
  stagedCount,
  unstagedCount,
  untrackedCount,
  open,
  onOpenChange,
  onSelectScope,
  onOpenHistory,
}: ChangesScopeMenuProps) {
  const t = useTranslations("AppShell.chrome");
  const label =
    scope === "commit"
      ? formatCommitScopeLabel(selectedCommitHash) ??
        t("changes.scope.commit")
      : scope === "branch"
        ? t("changes.scope.branch")
        : scope === "staged"
          ? t("changes.scope.staged")
          : t("changes.scope.unstaged");

  const renderTrailingCheck = (checked: boolean) =>
    checked ? <Check className="size-3.5 shrink-0" /> : null;
  const renderCountBadge = (count: number) =>
    count > 0 ? (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    ) : null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          title={t("changes.selectScope")}
          aria-label={t("changes.selectScope")}
          className="min-w-0 max-w-[45%] justify-start gap-1 rounded-md px-2 text-xs text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onSelectScope("unstaged")}
        >
          <span>{t("changes.scope.unstaged")}</span>
          {renderCountBadge(unstagedCount + untrackedCount)}
          <span className="flex-1" />
          {renderTrailingCheck(scope === "unstaged")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onSelectScope("staged")}
        >
          <span>{t("changes.scope.staged")}</span>
          {renderCountBadge(stagedCount)}
          <span className="flex-1" />
          {renderTrailingCheck(scope === "staged")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onSelectScope("branch")}
        >
          <span className="flex-1">{t("changes.scope.branch")}</span>
          {renderTrailingCheck(scope === "branch")}
        </DropdownMenuItem>
        {onOpenHistory ? (
          <DropdownMenuItem className="cursor-pointer" onSelect={onOpenHistory}>
            <span className="flex-1">{t("changes.history")}</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ChangesToolbar({
  className,
  isBusy = false,
  onOpenChange,
  onOpenHistory,
  onSelectScope,
  onStageAll,
  onUnstageAll,
  onDiscardTracked,
  onTrashUntracked,
  open,
  scope,
  selectedCommitHash,
  stagedCount,
  unstagedCount,
  untrackedCount,
}: ChangesToolbarProps) {
  const t = useTranslations("AppShell.chrome");
  const [sidebarUi, setSidebarUi] = useSidebarUiPrefs();
  const viewMode = sidebarUi.changesFileViewMode;
  const [isRunningAction, setIsRunningAction] = React.useState(false);
  const [confirmingActionKey, setConfirmingActionKey] = React.useState<string | null>(
    null,
  );
  const actionsBusy = isBusy || isRunningAction;
  const confirmingTrash = confirmingActionKey === "toolbar-bulk-trash";
  const canStageAll =
    scope === "unstaged" &&
    unstagedCount + untrackedCount > 0 &&
    Boolean(onStageAll);
  const canUnstageAll =
    scope === "staged" && stagedCount > 0 && Boolean(onUnstageAll);
  const canDiscardTracked =
    scope === "unstaged" && unstagedCount > 0 && Boolean(onDiscardTracked);
  const canTrashUntracked =
    scope === "unstaged" && untrackedCount > 0 && Boolean(onTrashUntracked);
  const primaryAction = scope === "staged" ? onUnstageAll : onStageAll;
  const primaryEnabled = scope === "staged" ? canUnstageAll : canStageAll;
  const primaryLabel =
    scope === "staged"
      ? t("changes.actions.unstageAll")
      : t("changes.actions.stageAll");

  const runAction = React.useCallback(
    async (action: (() => Promise<void> | void) | undefined) => {
      if (!action || actionsBusy) return;

      setIsRunningAction(true);
      try {
        await action();
      } catch (error) {
        toastManager.add({
          title: t("changes.actions.failedTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("changes.actions.failedDescription"),
          type: "error",
        });
      } finally {
        setIsRunningAction(false);
      }
    },
    [actionsBusy, t],
  );

  return (
    <div
      className={cn(
        "flex h-full w-full min-w-0 items-center justify-between gap-2 px-3",
        className,
      )}
    >
      <ChangesScopeMenu
        scope={scope}
        selectedCommitHash={selectedCommitHash}
        stagedCount={stagedCount}
        unstagedCount={unstagedCount}
        untrackedCount={untrackedCount}
        open={open}
        onOpenChange={onOpenChange}
        onSelectScope={onSelectScope}
        onOpenHistory={onOpenHistory}
      />

      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("changes.view.settings")}
              title={t("changes.view.settings")}
              className="text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
            >
              <SlidersHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {t("changes.view.section")}
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setSidebarUi({ changesFileViewMode: "list" })}
            >
              <span className="flex-1">{t("changes.view.list")}</span>
              {viewMode === "list" ? <Check className="size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setSidebarUi({ changesFileViewMode: "tree" })}
            >
              <span className="flex-1">{t("changes.view.tree")}</span>
              {viewMode === "tree" ? <Check className="size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-stretch">
          <Button
            type="button"
            size="xs"
            disabled={!primaryEnabled || actionsBusy}
            onClick={() => void runAction(primaryAction)}
            className="rounded-r-none border-r-primary-foreground/20 px-2.5"
          >
            {primaryLabel}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                disabled={actionsBusy}
                aria-label={t("changes.actions.moreActions")}
                title={t("changes.actions.moreActions")}
                className="rounded-l-none border-l-0"
              >
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={!canStageAll || actionsBusy}
                onSelect={() => void runAction(onStageAll)}
              >
                {t("changes.actions.stageAll")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canUnstageAll || actionsBusy}
                onSelect={() => void runAction(onUnstageAll)}
              >
                {t("changes.actions.unstageAll")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!canDiscardTracked || actionsBusy}
                onSelect={() => setConfirmingActionKey("toolbar-bulk-discard")}
              >
                {t("changes.actions.discardTracked")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!canTrashUntracked || actionsBusy}
                onSelect={() => setConfirmingActionKey("toolbar-bulk-trash")}
              >
                {t("changes.actions.trashUntracked")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Dialog
        open={confirmingActionKey !== null}
        onOpenChange={(open) => {
          if (actionsBusy) return;
          if (!open) setConfirmingActionKey(null);
        }}
      >
        <DialogContent className="w-[min(92vw,420px)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {confirmingTrash
                ? t("changeSection.deleteAllUntrackedTitle")
                : t("changeSection.discardAllUnstagedTitle")}
            </DialogTitle>
            <DialogDescription>
              {confirmingTrash
                ? t("changeSection.deleteAllUntrackedDescription")
                : t("changeSection.discardAllUnstagedDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={actionsBusy}
              onClick={() => setConfirmingActionKey(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={actionsBusy}
              onClick={() => {
                const action = confirmingTrash ? onTrashUntracked : onDiscardTracked;
                void runAction(action).then(() => setConfirmingActionKey(null));
              }}
            >
              {actionsBusy && confirmingActionKey ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
