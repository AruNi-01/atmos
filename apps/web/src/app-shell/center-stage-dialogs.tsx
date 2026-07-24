"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui";
import type { OpenFile } from "@/features/editor/store/use-editor-store";

export function TerminalCloseConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Optional running pane labels (prefer agent names) shown as a list. */
  items?: string[];
  onConfirm: () => void | Promise<void>;
}) {
  const t = useTranslations("AppShell.chrome");
  const visibleItems = items?.filter((item) => item.trim().length > 0) ?? [];

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {visibleItems.length > 0 ? (
          <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-muted-foreground">
            {visibleItems.map((item, index) => (
              <li key={`${item}-${index}`} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter className="gap-4">
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="cursor-pointer"
            onClick={() => {
              void onConfirm();
            }}
          >
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnsavedChangesDialog({
  fileToClose,
  onCancel,
  onConfirm,
}: {
  fileToClose: OpenFile | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("AppShell.chrome");

  return (
    <Dialog
      open={!!fileToClose}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("centerStageDialogs.unsavedChanges.title")}</DialogTitle>
          <DialogDescription>
            {t("centerStageDialogs.unsavedChanges.description", {
              name: fileToClose?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t("centerStageDialogs.unsavedChanges.discard")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
