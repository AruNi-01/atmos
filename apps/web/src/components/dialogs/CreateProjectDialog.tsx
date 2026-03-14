'use client';

import React, { useState, useEffect } from 'react';
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
import { useProjectStore } from '@/hooks/use-project-store';
import { wsProjectApi, fsApi } from '@/api/ws-api';
import { FileBrowser } from './FileBrowser';
import { useWebSocket } from '@/hooks/use-websocket';

interface CreateProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const addProject = useProjectStore(s => s.addProject);
  const { isConnected, connectionState } = useWebSocket();
  
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
          setValidationError('Warning: This is not a Git repository');
        }
      } else {
        setValidationError(result.error || 'Invalid path');
      }
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : 'Validation failed');
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
      setValidationError(e instanceof Error ? e.message : 'Failed to import project');
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
            <DialogTitle>Import Project</DialogTitle>
          </DialogHeader>
          
          {/* 连接状态提示 */}
          {connectionState !== 'connected' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm mb-4">
              <span className="text-yellow-700 dark:text-yellow-300">
                {connectionState === 'connecting' && 'Connecting to server...'}
                {connectionState === 'reconnecting' && 'Reconnecting to server...'}
                {connectionState === 'disconnected' && 'Not connected to server. File browsing will not work.'}
              </span>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="path">Project Path</Label>
              <div className="flex gap-2">
                <Input
                  id="path"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/path/to/your/project"
                  className="flex-1 font-mono text-sm"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowFileBrowser(true)}
                  disabled={!isConnected}
                  className="cursor-pointer"
                >
                  Browse...
                </Button>
              </div>
              
              {/* 验证状态 */}
              {isValidating && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className="animate-spin">⏳</span> Validating path...
                </p>
              )}
              
              {/* 验证信息 */}
              {validationInfo && !validationError && (
                <div className="text-xs space-y-1">
                  {validationInfo.isGitRepo ? (
                    <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
                      <span>✓</span> Git repository detected
                      {validationInfo.defaultBranch && (
                        <span className="text-muted-foreground">
                          (branch: {validationInfo.defaultBranch})
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <span>⚠</span> Not a Git repository (will be imported as a plain directory)
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
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project Name"
              />
              <p className="text-xs text-muted-foreground">
                This name will be displayed in the sidebar.
              </p>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} className="cursor-pointer">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !name || !path || Boolean(validationError && !validationInfo)}
                className="cursor-pointer"
              >
                {isSubmitting ? 'Importing...' : 'Import Project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* 文件浏览器对话框 */}
      <FileBrowser
        open={showFileBrowser}
        onOpenChange={setShowFileBrowser}
        onSelect={handleFileBrowserSelect}
        title="Select Project Directory"
        selectLabel="Select"
        dirsOnly={true}
      />
    </>
  );
};
