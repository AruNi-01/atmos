"use client";

import React, { useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toastManager,
} from "@workspace/ui";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ReviewMessageDto } from "@/api/ws-api";

type MenuMode = "menu" | "delete";

interface ReviewMessageActionsMenuProps {
  message: ReviewMessageDto;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: (message: ReviewMessageDto) => void | Promise<void>;
}

export const ReviewMessageActionsMenu: React.FC<ReviewMessageActionsMenuProps> = ({
  message,
  disabled,
  onEdit,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MenuMode>("menu");
  const [isBusy, setIsBusy] = useState(false);
  const isDisabled = disabled || isBusy;

  const stopPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const close = () => {
    setOpen(false);
    setMode("menu");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.body_full);
      close();
    } catch (error) {
      toastManager.add({
        title: "Failed to copy comment",
        description: error instanceof Error ? error.message : "Clipboard access failed.",
        type: "error",
      });
    }
  };

  const handleDelete = async () => {
    setIsBusy(true);
    try {
      await onDelete(message);
      close();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setMode("menu");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stopPropagation}
          onKeyDown={stopPropagation}
          disabled={isDisabled}
          className="flex size-6 items-center justify-center rounded bg-background/80 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/70 backdrop-blur transition-colors hover:bg-muted hover:text-foreground group-hover/message:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 disabled:opacity-50"
          title="Comment actions"
          aria-label="Comment actions"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className={mode === "delete" ? "w-56 p-3" : "w-36 p-1.5"}
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
      >
        {mode === "menu" && (
          <div className="space-y-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
              onClick={() => {
                close();
                onEdit();
              }}
            >
              <Pencil className="size-4 text-muted-foreground" />
              Edit
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
              onClick={() => void handleCopy()}
            >
              <Copy className="size-4 text-muted-foreground" />
              Copy
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
              onClick={() => setMode("delete")}
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        )}

        {mode === "delete" && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Delete this comment?</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              This message will be removed from the review thread.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={() => setMode("menu")}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isBusy}
                onClick={() => void handleDelete()}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
