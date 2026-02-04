'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Label,
  Textarea,
  toastManager
} from '@workspace/ui';
import { wsScriptApi } from '@/api/ws-api';

interface WorkspaceScriptDialogProps {
  projectId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const WorkspaceScriptDialog: React.FC<WorkspaceScriptDialogProps> = ({
  projectId,
  isOpen,
  onClose
}) => {
  const [setupScript, setSetupScript] = useState('');
  const [runScript, setRunScript] = useState('');
  const [purgeScript, setPurgeScript] = useState('');
  const [initialScripts, setInitialScripts] = useState<{ setup: string, run: string, purge: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && projectId) {
      loadScripts();
    }
  }, [isOpen, projectId]);

  const loadScripts = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const scripts = await wsScriptApi.get(projectId);
      setSetupScript(scripts.setup || '');
      setRunScript(scripts.run || '');
      setPurgeScript(scripts.purge || '');
      setInitialScripts({
        setup: scripts.setup || '',
        run: scripts.run || '',
        purge: scripts.purge || ''
      });
    } catch (error) {
      console.error('Failed to load scripts:', error);
      toastManager.add({
        title: 'Error',
        description: 'Failed to load scripts',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      await wsScriptApi.save(projectId, {
        setup: setupScript,
        run: runScript,
        purge: purgeScript
      });
      toastManager.add({
        title: 'Success',
        description: 'Scripts saved successfully',
        type: 'success'
      });
      onClose();
    } catch (error) {
      console.error('Failed to save scripts:', error);
      toastManager.add({
        title: 'Error',
        description: 'Failed to save scripts',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasUnsavedChanges = () => {
    if (!initialScripts) return false;
    return setupScript !== initialScripts.setup ||
      runScript !== initialScripts.run ||
      purgeScript !== initialScripts.purge;
  };

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
        <DialogContent
          className="sm:max-w-4xl max-h-[85vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (hasUnsavedChanges()) {
              e.preventDefault();
              setShowExitConfirm(true);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Workspace Scripts</DialogTitle>
            <DialogDescription>
              Configure scripts for Setup, Run, and Purge.
              Scripts are executed in the current workspace directory.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="bg-muted p-3 rounded-md text-xs font-mono space-y-1">
              <p className="font-bold text-muted-foreground mb-2">Available Environment Variables:</p>
              <div className="grid grid-cols-[1fr_2fr] gap-x-4 gap-y-1">
                <span className="text-white font-bold">ATMOS_ROOT_PROJECT_PATH</span>
                <span className="text-muted-foreground">Path to root project</span>

                <span className="text-white font-bold">ATMOS_WORKSPACE_NAME</span>
                <span className="text-muted-foreground">Current workspace name</span>

                <span className="text-white font-bold">ATMOS_WORKSPACE_PATH</span>
                <span className="text-muted-foreground">Path to current workspace</span>
              </div>
              <div className="mt-2 text-muted-foreground/80 italic">
                Note: For complex scripts, create a .sh file in .atmos/scripts/ and reference it (e.g., &quot;./.atmos/scripts/myscript.sh&quot;).
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="setup">Setup Script</Label>
              <Textarea
                id="setup"
                placeholder="e.g. cp $ATMOS_ROOT_PROJECT_PATH/.env . && npm install"
                value={setupScript}
                onChange={e => setSetupScript(e.target.value)}
                className="font-mono text-sm h-24"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Executed when setting up a new workspace.</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="run">Run Script</Label>
              <Textarea
                id="run"
                placeholder="e.g. npm run dev"
                value={runScript}
                onChange={e => setRunScript(e.target.value)}
                className="font-mono text-sm h-24"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">One-click command to start services.</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="purge">Purge Script</Label>
              <Textarea
                id="purge"
                placeholder="e.g. rm -rf node_modules"
                value={purgeScript}
                onChange={e => setPurgeScript(e.target.value)}
                className="font-mono text-sm h-24"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Executed to clean up worktree/workspace files.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAttempt} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? 'Saving...' : 'Save Scripts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExitConfirm(false)}>Keep Editing</Button>
            <Button variant="destructive" onClick={handleConfirmExit}>Discard Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
