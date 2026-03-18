'use client';

import { useState, useEffect } from 'react';
import { X, Download, ExternalLink, ArrowRight } from 'lucide-react';
import { Button, cn } from '@workspace/ui';
import { isTauriRuntime } from '@/lib/desktop-runtime';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdateStatus,
  type UpdateInfo,
} from '@/hooks/use-updater';

export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ stage: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    checkForUpdate((s) => {
      setStatus(s);
      if (s.stage === 'available') {
        setUpdateInfo(s.info);
      }
    });
  }, []);

  const handleUpdate = async () => {
    await downloadAndInstallUpdate(setStatus);
  };

  if (dismissed || !updateInfo) return null;

  const isUpdating =
    status.stage === 'downloading' || status.stage === 'installing' || status.stage === 'done';

  return (
    <div
      className={cn(
        'fixed bottom-6 left-6 z-[100] w-[340px]',
        'bg-popover text-popover-foreground border shadow-lg rounded-lg p-4',
        'animate-in fade-in slide-in-from-bottom-4 duration-300',
      )}
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 size-6 flex items-center justify-center hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground transition-colors ease-out duration-200"
      >
        <X className="size-4" />
      </button>

      <div className="mb-3">
        <h4 className="text-sm font-semibold">Update Available</h4>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          v{updateInfo.currentVersion}
          <ArrowRight className="size-3" />
          v{updateInfo.version}
        </p>
      </div>

      {status.stage === 'error' && (
        <p className="text-xs text-destructive mb-3">{status.message}</p>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          asChild
        >
          <a
            href="https://github.com/AruNi-01/atmos/releases"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-3.5" />
            What&apos;s New
          </a>
        </Button>

        <Button
          size="sm"
          className="gap-1.5 text-xs"
          disabled={isUpdating}
          onClick={handleUpdate}
        >
          <Download className="size-3.5" />
          {status.stage === 'downloading'
            ? 'Downloading…'
            : status.stage === 'installing'
              ? 'Installing…'
              : 'Update'}
        </Button>
      </div>
    </div>
  );
}
