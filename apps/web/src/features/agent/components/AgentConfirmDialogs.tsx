"use client";

import React from "react";
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
import { Trash2, AlertCircle } from "lucide-react";

export interface AgentConfirmDialogsProps {
  overwriteDialog: { registryId: string; message: string } | null;
  onConfirmOverwrite: () => void;
  onCancelOverwrite: () => void;
  removeConfirmDialog: { registryId: string; name: string } | null;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  removeCustomConfirmDialog: { name: string } | null;
  onConfirmRemoveCustom: () => void;
  onCancelRemoveCustom: () => void;
}

export const AgentConfirmDialogs: React.FC<AgentConfirmDialogsProps> = ({
  overwriteDialog,
  onConfirmOverwrite,
  onCancelOverwrite,
  removeConfirmDialog,
  onConfirmRemove,
  onCancelRemove,
  removeCustomConfirmDialog,
  onConfirmRemoveCustom,
  onCancelRemoveCustom,
}) => {
  const t = useTranslations("Agent.components");

  return (
    <>
    <Dialog
      open={!!overwriteDialog}
      onOpenChange={(open) => {
        if (!open) onCancelOverwrite();
      }}
    >
      <DialogContent showCloseButton={true}>
        <DialogHeader>
          <div className="size-10 rounded-full bg-yellow-500/10 flex items-center justify-center mb-2">
            <AlertCircle className="size-5 text-yellow-600" />
          </div>
          <DialogTitle>{t("confirmDialogs.overwrite.title")}</DialogTitle>
          <DialogDescription className="text-pretty">{overwriteDialog?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancelOverwrite}
            className="cursor-pointer"
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={onConfirmOverwrite} className="cursor-pointer">{t("common.continue")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={!!removeConfirmDialog}
      onOpenChange={(open) => {
        if (!open) onCancelRemove();
      }}
    >
      <DialogContent showCloseButton={true}>
        <DialogHeader>
          <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <Trash2 className="size-5 text-destructive" />
          </div>
          <DialogTitle>{t("confirmDialogs.uninstall.title")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t.rich("confirmDialogs.uninstall.description", {
              name: removeConfirmDialog?.name ?? "",
              strong: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancelRemove}
            className="cursor-pointer"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmRemove}
            className="cursor-pointer"
          >
            {t("confirmDialogs.uninstall.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={!!removeCustomConfirmDialog}
      onOpenChange={(open) => {
        if (!open) onCancelRemoveCustom();
      }}
    >
      <DialogContent showCloseButton={true}>
        <DialogHeader>
          <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <Trash2 className="size-5 text-destructive" />
          </div>
          <DialogTitle>{t("confirmDialogs.removeCustom.title")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t.rich("confirmDialogs.removeCustom.description", {
              name: removeCustomConfirmDialog?.name ?? "",
              strong: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancelRemoveCustom}
            className="cursor-pointer"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmRemoveCustom}
            className="cursor-pointer"
          >
            {t("common.remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};
