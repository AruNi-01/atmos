"use client";

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import {
  Button,
  Checkbox,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Archive, ArchiveRestore, CheckCheck, Trash2, Undo2, X } from "lucide-react";
import { HoldToConfirmButton } from "@/features/agent-sessions/components/hold-to-confirm";
import type { HostSessionArchiveAction } from "@/features/agent-sessions/lib/host-session-selection";

export const HOST_SESSION_UNDO_MS = 5000;

export function HostSessionBulkToolbar({
  count,
  allSelected,
  archiveAction,
  busy,
  error,
  undoToken,
  onSelectAll,
  onArchive,
  onDeleteArmed,
  onUndo,
  onUndoCommit,
  onClose,
}: {
  count: number;
  allSelected: boolean;
  archiveAction: HostSessionArchiveAction;
  busy: boolean;
  error: string | null;
  undoToken: number | null;
  onSelectAll: () => void;
  onArchive: () => void;
  onDeleteArmed: (options: { includeChat: boolean; includeSource: boolean }) => void;
  onUndo: () => void;
  onUndoCommit: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("agentSessions.bulk");
  const reduceMotion = useReducedMotion();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [includeChat, setIncludeChat] = useState(true);
  const [includeSource, setIncludeSource] = useState(true);
  const undoing = undoToken != null;
  const archiveDisabled = busy || undoing || archiveAction === "mixed" || archiveAction === "empty";
  const unarchive = archiveAction === "unarchive";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex justify-center px-6">
      <motion.div
        role="toolbar"
        aria-label={t("label")}
        data-testid="host-session-bulk-toolbar"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-xl"
      >
        {undoing ? (
          <UndoStrip
            token={undoToken}
            count={count}
            onUndo={onUndo}
            onCommit={onUndoCommit}
            disabled={busy}
          />
        ) : null}
        {error ? (
          <p className="border-b border-border/60 px-4 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        <div className="flex items-center gap-1 px-2 py-2">
          <div className="flex items-center gap-1.5 pl-1.5">
            <span
              className="text-sm font-medium tabular-nums text-muted-foreground"
              data-testid="host-session-selected-count"
            >
              {count}
            </span>
            <ToolbarButton
              label={allSelected ? t("deselectAll") : t("selectAll")}
              disabled={busy || undoing || count === 0}
              onClick={onSelectAll}
              testId="host-session-select-all"
            >
              <CheckCheck className="size-4" />
            </ToolbarButton>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ToolbarButton
                  label={unarchive ? t("unarchive") : t("archive")}
                  disabled={archiveDisabled}
                  onClick={onArchive}
                  testId="host-session-archive"
                >
                  {unarchive ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                </ToolbarButton>
              </span>
            </TooltipTrigger>
            {archiveAction === "mixed" ? (
              <TooltipContent>{t("archiveMixed")}</TooltipContent>
            ) : null}
          </Tooltip>
          <Popover
            open={deleteOpen && !undoing}
            onOpenChange={(open) => {
              setDeleteOpen(open);
              if (open) {
                setIncludeChat(true);
                setIncludeSource(true);
              }
            }}
          >
            <PopoverTrigger asChild>
              <ToolbarButton
                label={t("delete")}
                disabled={busy || undoing || count === 0}
                testId="host-session-delete"
                tone="danger"
              >
                <Trash2 className="size-4" />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-72"
              data-testid="host-session-delete-popover"
            >
              <div className="flex flex-col gap-3">
                <DeleteOption
                  checked={includeChat}
                  label={t("includeChat")}
                  onCheckedChange={setIncludeChat}
                />
                <DeleteOption
                  checked={includeSource}
                  label={t("includeSource")}
                  onCheckedChange={setIncludeSource}
                />
                <HoldToConfirmButton
                  size="sm"
                  className="mt-1 w-full"
                  disabled={!includeChat && !includeSource}
                  label={t("holdToDelete")}
                  confirmedLabel={t("held")}
                  resetDelay={0}
                  onConfirm={() => {
                    setDeleteOpen(false);
                    onDeleteArmed({ includeChat, includeSource });
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
          <div className="ml-auto">
            <ToolbarButton label={t("close")} onClick={onClose} testId="host-session-bulk-close">
              <X className="size-4" />
            </ToolbarButton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function UndoStrip({
  token,
  count,
  onUndo,
  onCommit,
  disabled,
}: {
  token: number;
  count: number;
  onUndo: () => void;
  onCommit: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("agentSessions.bulk");
  const reduceMotion = useReducedMotion();
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    const timer = window.setTimeout(() => commitRef.current(), HOST_SESSION_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [token]);

  return (
    <div
      className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5"
      data-testid="host-session-undo"
    >
      <p className="min-w-0 flex-1 text-sm text-foreground">{t("undoTitle", { count })}</p>
      <div className="relative h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <motion.div
          className="absolute inset-y-0 left-0 bg-foreground"
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: HOST_SESSION_UNDO_MS / 1000, ease: "linear" }
          }
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 rounded-lg"
        disabled={disabled}
        onClick={onUndo}
      >
        <Undo2 className="size-3.5" />
        {t("undo")}
      </Button>
    </div>
  );
}

function DeleteOption({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span>{label}</span>
    </label>
  );
}

const ToolbarButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    testId: string;
    tone?: "default" | "danger";
  }
>(function ToolbarButton(
  { label, children, disabled, onClick, testId, tone = "default" },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "h-9 gap-1.5 rounded-xl px-2.5 text-sm",
        tone === "danger" && "text-destructive hover:text-destructive",
      )}
    >
      {children}
      <span>{label}</span>
    </Button>
  );
});
