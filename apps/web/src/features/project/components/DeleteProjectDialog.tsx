"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Button,
  Input,
  Label,
  AlertTriangle,
} from "@workspace/ui";

interface DeleteProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  onConfirm: () => void;
  canDelete?: boolean;
}

export const DeleteProjectDialog: React.FC<DeleteProjectDialogProps> = ({
  isOpen,
  onClose,
  projectName,
  onConfirm,
  canDelete = true,
}) => {
  const t = useTranslations("project.deleteProjectDialog");
  const [confirmName, setConfirmName] = useState("");

  const handleClose = () => {
    setConfirmName("");
    onClose();
  };

  const isNameMatch = confirmName === projectName;

  const handleConfirm = () => {
    if (isNameMatch && canDelete) {
      onConfirm();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
          </div>
          <DialogTitle className="text-center">{t("title", { projectName })}</DialogTitle>
          {canDelete ? (
            <DialogDescription className="text-center">{t("description")}</DialogDescription>
          ) : (
            <DialogDescription className="text-center text-amber-500">
              {t("activeWorkspaces")}
            </DialogDescription>
          )}
        </DialogHeader>

        {canDelete && (
          <div className="py-4">
            <Label htmlFor="confirm-name" className="text-sm text-muted-foreground">
              {t("confirmLabel", { projectName })}
            </Label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="mt-2 border-destructive/50 focus:border-destructive"
              placeholder={projectName}
              autoComplete="off"
              autoFocus
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          {canDelete ? (
            <>
              <Button variant="outline" onClick={handleClose} className="cursor-pointer">
                {t("actions.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={!isNameMatch}
                className="cursor-pointer"
              >
                {t("actions.delete")}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose} className="w-full cursor-pointer">
              {t("actions.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
