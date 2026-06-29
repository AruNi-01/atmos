"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui";

type TerminalGridCloseConfirmDialogProps = {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TerminalGridCloseConfirmDialog({
  open,
  title,
  onCancel,
  onConfirm,
}: TerminalGridCloseConfirmDialogProps) {
  const t = useTranslations("Terminal.chrome");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onConfirm();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle>{t("closeConfirm.title")}</DialogTitle>
          <DialogDescription className="max-w-none text-left leading-relaxed">
            {t("closeConfirm.description", { title })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} className="cursor-pointer">
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="cursor-pointer" autoFocus>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
