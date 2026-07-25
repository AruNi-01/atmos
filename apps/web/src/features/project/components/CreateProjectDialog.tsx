'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  Button,
  Label,
  Input
} from '@workspace/ui';
import { useProjectStore } from '@/features/project/store/use-project-store';
import { wsProjectApi } from '@/api/ws-api';
import { FileBrowser } from '@/features/files/components/FileBrowser';
import { useWebSocket } from '@/features/connection/hooks/use-websocket';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import {
  canUseNativeDirectoryPicker,
  pickLocalDirectory,
} from '@/shared/lib/desktop-directory-picker';

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const t = useTranslations('project.createProjectDialog');
  const addProject = useProjectStore(s => s.addProject);
  const { isConnected, connectionState } = useWebSocket();
  const connectionMode = useAtmosComputerStore((s) => s.connectionMode);
  // Native OS picker only when Desktop is talking to the local machine.
  // Relay / remote computers still need the in-app FileBrowser (WS FS API).
  const useNativePicker =
    canUseNativeDirectoryPicker() && connectionMode === 'local';
  
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationInfo, setValidationInfo] = useState<{
    isGitRepo: boolean;
    defaultBranch: string | null;
  } | null>(null);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);

  // 当路径改变时验证
  useEffect(() => {
    if (path && isConnected) {
      const timeoutId = setTimeout(() => {
        handleValidate();
      }, 500); // 防抖
      return () => clearTimeout(timeoutId);
    }
  }, [path, isConnected]);

  const handleValidate = async () => {
    if (!path) return;
    
    setIsValidating(true);
    setValidationError(null);
    setValidationInfo(null);
    
    try {
      const result = await wsProjectApi.validatePath(path);
      
      if (result.is_valid) {
        if (result.suggested_name && !name) {
          setName(result.suggested_name);
        }
        setValidationInfo({
          isGitRepo: result.is_git_repo,
          defaultBranch: result.default_branch,
        });
        
        if (!result.is_git_repo) {
          setValidationError(t('validation.warningNotGitRepo'));
        }
      } else {
        setValidationError(result.error || t('validation.invalidPath'));
      }
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : t('validation.failed'));
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileBrowserSelect = (
    selectedPath: string, 
    isGitRepo: boolean, 
    suggestedName: string | null
  ) => {
    setPath(selectedPath);
    if (suggestedName) {
      setName(suggestedName);
    }
    setValidationInfo({
      isGitRepo,
      defaultBranch: null, // Will be updated by validation
    });
    setShowFileBrowser(false);
  };

  const handleBrowse = useCallback(async () => {
    if (useNativePicker) {
      setIsPickingDirectory(true);
      try {
        const selected = await pickLocalDirectory({
          defaultPath: path || undefined,
          title: t('fileBrowser.title'),
        });
        if (selected) {
          setPath(selected);
          setValidationInfo(null);
          setValidationError(null);
        }
      } finally {
        setIsPickingDirectory(false);
      }
      return;
    }
    setShowFileBrowser(true);
  }, [useNativePicker, path, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !path) return;

    setIsSubmitting(true);
    try {
      await addProject({
        name,
        mainFilePath: path,
      });
      onClose();
      setPath('');
      setName('');
      setValidationError(null);
      setValidationInfo(null);
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : t('submit.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setPath('');
    setName('');
    setValidationError(null);
    setValidationInfo(null);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>
          
          {/* 连接状态提示 */}
          {connectionState !== 'connected' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm mb-4">
              <span className="text-yellow-700 dark:text-yellow-300">
                {connectionState === 'connecting' && t('connection.connecting')}
                {connectionState === 'reconnecting' && t('connection.reconnecting')}
                {connectionState === 'disconnected' && t('connection.disconnected')}
              </span>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="path">{t('fields.path.label')}</Label>
              <div className="flex gap-2">
                <Input
                  id="path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={t('fields.path.placeholder')}
                  className="flex-1 font-mono text-sm"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => void handleBrowse()}
                  disabled={useNativePicker ? isPickingDirectory : !isConnected}
                  className="cursor-pointer"
                >
                  {t('fields.path.browse')}
                </Button>
              </div>
              
              {/* 验证状态 */}
              {isValidating && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="animate-spin">⏳</span> {t('validation.validating')}
                </p>
              )}
              
              {/* 验证信息 */}
              {validationInfo && !validationError && (
                <div className="text-xs space-y-1">
                  {validationInfo.isGitRepo ? (
                    <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
                      <span>✓</span> {t('validation.gitRepoDetected')}
                      {validationInfo.defaultBranch && (
                        <span className="text-muted-foreground">
                          {t('validation.branch', { branch: validationInfo.defaultBranch })}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <span>⚠</span> {t('validation.notGitRepo')}
                    </p>
                  )}
                </div>
              )}
              
              {/* 错误信息 */}
              {validationError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <span>✗</span> {validationError}
                </p>
              )}
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="name">{t('fields.name.label')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('fields.name.placeholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('fields.name.help')}
              </p>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} className="cursor-pointer">
                {t('actions.cancel')}
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !name || !path || Boolean(validationError && !validationInfo)}
                className="cursor-pointer"
              >
                {isSubmitting ? t('actions.importing') : t('actions.import')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Web / remote: in-app browser. Desktop local uses the native OS picker. */}
      {!useNativePicker ? (
        <FileBrowser
          open={showFileBrowser}
          onOpenChange={setShowFileBrowser}
          onSelect={handleFileBrowserSelect}
          title={t('fileBrowser.title')}
          selectLabel={t('fileBrowser.select')}
          dirsOnly={true}
        />
      ) : null}
    </>
  );
};
