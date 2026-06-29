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
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
}) {
  const t = useTranslations("AppShell.chrome");

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
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
