'use client';

import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  Button,
} from '@workspace/ui';

interface TmuxInstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
}

export const TmuxInstallDialog: React.FC<TmuxInstallDialogProps> = ({ 
  isOpen, 
  onClose,
  onRetry,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>tmux Required</DialogTitle>
          <DialogDescription>
            Terminal persistence requires tmux to be installed on your system.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            tmux is a terminal multiplexer that allows Atmos to keep your terminal sessions running 
            even when you disconnect. This enables seamless reconnection to your work.
          </p>
          
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Install tmux:</h4>
            
            <div className="space-y-2">
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground mb-1">macOS (Homebrew)</p>
                <code className="text-sm font-mono">brew install tmux</code>
              </div>
              
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground mb-1">Ubuntu/Debian</p>
                <code className="text-sm font-mono">sudo apt install tmux</code>
              </div>
              
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground mb-1">Fedora/RHEL</p>
                <code className="text-sm font-mono">sudo dnf install tmux</code>
              </div>
              
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground mb-1">Arch Linux</p>
                <code className="text-sm font-mono">sudo pacman -S tmux</code>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            After installing, click "Check Again" to verify the installation.
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Continue Without tmux
          </Button>
          <Button onClick={onRetry}>
            Check Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
