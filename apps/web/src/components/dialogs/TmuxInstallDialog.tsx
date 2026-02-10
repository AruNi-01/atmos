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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui';
import { ChevronDown } from 'lucide-react';

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
      <DialogContent className="max-w-lg max-h-[85vh] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>tmux Required</DialogTitle>
          <DialogDescription>
            Terminal persistence requires tmux to be installed on your system.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4 overflow-y-auto min-h-0">
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
              
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 w-full text-left">
                  <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180 shrink-0" />
                  <span>More platforms</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="flex flex-col gap-2">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground mb-1">Windows (WSL, recommended)</p>
                      <code className="text-sm font-mono">wsl sudo apt install tmux</code>
                      <p className="text-[11px] text-muted-foreground mt-1">Run Atmos API inside WSL</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground mb-1">Windows (MSYS2)</p>
                      <code className="text-sm font-mono">pacman -S tmux</code>
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
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            After installing, click &quot;Check Again&quot; to verify the installation.
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
