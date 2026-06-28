'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Workspace.components.scriptDialog');
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
        title: t('toasts.errorTitle'),
        description: t('toasts.loadFailed'),
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
      onClose();
    } catch (error) {
      console.error('Failed to save scripts:', error);
      toastManager.add({
        title: t('toasts.errorTitle'),
        description: t('toasts.saveFailed'),
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
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>
              {t('description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="bg-muted p-3 rounded-md text-xs font-mono space-y-1">
              <p className="font-bold text-muted-foreground mb-2">{t('env.title')}</p>
              <div className="grid grid-cols-[1fr_2fr] gap-x-4 gap-y-1">
                <span className="text-white font-bold">ATMOS_ROOT_PROJECT_PATH</span>
                <span className="text-muted-foreground">{t('env.rootProjectPath')}</span>

                <span className="text-white font-bold">ATMOS_WORKSPACE_NAME</span>
                <span className="text-muted-foreground">{t('env.workspaceName')}</span>

                <span className="text-white font-bold">ATMOS_WORKSPACE_PATH</span>
                <span className="text-muted-foreground">{t('env.workspacePath')}</span>
              </div>
              <div className="mt-2 text-muted-foreground/80 italic">
                {t('env.note')}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="setup">{t('setup.title')}</Label>
              <Textarea
                id="setup"
                placeholder={t('setup.placeholder')}
                value={setupScript}
                onChange={e => setSetupScript(e.target.value)}
                className="font-mono text-sm h-24"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">{t('setup.help')}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="run">{t('run.title')}</Label>
              <Textarea
                id="run"
                placeholder={t('run.placeholder')}
                value={runScript}
                onChange={e => setRunScript(e.target.value)}
                className="font-mono text-sm h-24"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">{t('run.help')}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="purge">{t('purge.title')}</Label>
              <Textarea
                id="purge"
                placeholder={t('purge.placeholder')}
                value={purgeScript}
                onChange={e => setPurgeScript(e.target.value)}
                className="font-mono text-sm h-24"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">{t('purge.help')}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAttempt} disabled={isSaving}>{t('actions.cancel')}</Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving ? t('actions.saving') : t('actions.saveScripts')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmExit.title')}</DialogTitle>
            <DialogDescription>
              {t('confirmExit.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExitConfirm(false)}>{t('confirmExit.keepEditing')}</Button>
            <Button variant="destructive" onClick={handleConfirmExit}>{t('confirmExit.discardChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
