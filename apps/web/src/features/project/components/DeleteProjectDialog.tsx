import React, { useState } from 'react';
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
} from '@workspace/ui';

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
  const [confirmName, setConfirmName] = useState('');

  const handleClose = () => {
    setConfirmName('');
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
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
          </div>
          <DialogTitle className="text-center">Delete {projectName}</DialogTitle>
          {canDelete ? (
            <DialogDescription className="text-center">
              This action cannot be undone. This will permanently delete the project and remove it from your workspace.
            </DialogDescription>
          ) : (
            <DialogDescription className="text-center text-amber-500">
              This project has active (non-archived) workspaces. Please archive all workspaces before deleting the project.
            </DialogDescription>
          )}
        </DialogHeader>

        {canDelete && (
          <div className="py-4">
            <Label htmlFor="confirm-name" className="text-sm text-muted-foreground">
              To confirm, type &apos;<span className="font-semibold text-foreground">{projectName}</span>&apos; in the box below
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
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={!isNameMatch}
                className="cursor-pointer"
              >
                Delete this project
              </Button>
            </>
          ) : (
              <Button variant="outline" onClick={handleClose} className="w-full cursor-pointer">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
