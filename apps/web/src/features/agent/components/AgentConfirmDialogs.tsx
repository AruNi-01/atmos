"use client";

import React from "react";
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
}) => (
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
          <DialogTitle>Overwrite Confirmation</DialogTitle>
          <DialogDescription className="text-pretty">{overwriteDialog?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancelOverwrite}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button onClick={onConfirmOverwrite} className="cursor-pointer">Continue</Button>
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
          <DialogTitle>Uninstall Agent</DialogTitle>
          <DialogDescription className="text-pretty">
            Are you sure you want to uninstall <span className="font-semibold text-foreground">{removeConfirmDialog?.name}</span>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancelRemove}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmRemove}
            className="cursor-pointer"
          >
            Uninstall
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
          <DialogTitle>Remove Custom Agent</DialogTitle>
          <DialogDescription className="text-pretty">
            Are you sure you want to remove <span className="font-semibold text-foreground">{removeCustomConfirmDialog?.name}</span>? You can add it back later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancelRemoveCustom}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmRemoveCustom}
            className="cursor-pointer"
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);
