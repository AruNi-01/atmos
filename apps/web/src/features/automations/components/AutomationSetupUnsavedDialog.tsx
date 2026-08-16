"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui";
import { LoaderCircle } from "lucide-react";

export function AutomationSetupUnsavedDialog({
  open,
  mode,
  saving,
  onStay,
  onDiscard,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  saving: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("automation.setup.unsavedChanges");

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) onStay();
      }}
    >
      <DialogContent className="w-[min(92vw,420px)]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? t("descriptionCreate") : t("descriptionEdit")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={onDiscard}>
            {t("discard")}
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {t("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
