'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, cn, toastManager } from '@workspace/ui';
import { Check, Copy, LoaderCircle, RotateCw } from 'lucide-react';
import { fetchRegisterToken } from '@/lib/fetch-register-token';
import { buildVpsInstallCommand, buildVpsStartCommand } from '@/lib/vps-setup-commands';

function CommandBlock({
  step,
  title,
  description,
  command,
  copied,
  onCopy,
  disabled,
}: {
  step: number;
  title: string;
  description: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          <span className="mr-2 text-muted-foreground">{step}.</span>
          {title}
        </p>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onCopy}>
          {copied ? <Check className="mr-2 size-4 text-emerald-500" /> : <Copy className="mr-2 size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <pre
        className={cn(
          'overflow-x-auto rounded-xl border border-border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed text-foreground',
          disabled && 'opacity-50',
        )}
      >
        {command}
      </pre>
    </div>
  );
}

export function VpsRemoteSetupBlock({
  hasAccessToken,
  controlPlaneUrl,
  accessToken,
  busy,
}: {
  hasAccessToken: boolean;
  controlPlaneUrl: string;
  accessToken: string;
  busy: boolean;
}) {
  const installCommand = buildVpsInstallCommand();
  const [registerToken, setRegisterToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedStart, setCopiedStart] = useState(false);

  const refreshToken = useCallback(async () => {
    if (!hasAccessToken) {
      return;
    }
    setLoadingToken(true);
    try {
      const data = await fetchRegisterToken(controlPlaneUrl, accessToken);
      setRegisterToken(data.register_token);
      setExpiresAt(data.expires_at);
    } catch (err) {
      setRegisterToken(null);
      setExpiresAt(null);
      toastManager.add({
        title: 'Could not create register token',
        description: err instanceof Error ? err.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setLoadingToken(false);
    }
  }, [accessToken, controlPlaneUrl, hasAccessToken]);

  useEffect(() => {
    if (hasAccessToken) {
      void refreshToken();
    } else {
      setRegisterToken(null);
      setExpiresAt(null);
    }
  }, [hasAccessToken, refreshToken]);

  const startCommand =
    registerToken != null
      ? buildVpsStartCommand({ registerToken, controlPlaneUrl })
      : 'export PATH="$HOME/.atmos/bin:$PATH"\natmos computer start --token <register_token> --daemon';

  const tokenExpired = expiresAt != null && expiresAt * 1000 < Date.now();

  async function copyText(text: string, which: 'install' | 'start') {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'install') {
        setCopiedInstall(true);
        setTimeout(() => setCopiedInstall(false), 2000);
      } else {
        setCopiedStart(true);
        setTimeout(() => setCopiedStart(false), 2000);
      }
    } catch {
      toastManager.add({ title: 'Copy failed', type: 'error' });
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-border/80 bg-muted/10 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Add a remote server (VPS)</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!hasAccessToken || loadingToken || busy}
          onClick={() => void refreshToken()}
        >
          {loadingToken ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <RotateCw className="mr-2 size-4" />
          )}
          New token
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Run these two commands on a Linux x86_64 VPS over SSH. Installs the CLI and API, then
        registers to your account and starts Atmos Server in the background. The token in step 2
        expires in about 15 minutes — use New token to refresh.
      </p>

      <CommandBlock
        step={1}
        title="Install CLI + API"
        description="Installs atmos and api under ~/.atmos (no browser, does not auto-start)."
        command={installCommand}
        copied={copiedInstall}
        onCopy={() => void copyText(installCommand, 'install')}
      />

      <CommandBlock
        step={2}
        title="Register and start (background)"
        description={
          !hasAccessToken
            ? 'Save your access token above first.'
            : tokenExpired
              ? 'Register token expired — click New token.'
              : loadingToken
                ? 'Preparing register token…'
                : 'Run on the VPS after step 1. --daemon keeps the API running after SSH exits.'
        }
        command={startCommand}
        copied={copiedStart}
        disabled={!hasAccessToken || !registerToken || tokenExpired || loadingToken}
        onCopy={() => {
          if (!registerToken) {
            return;
          }
          void copyText(startCommand, 'start');
        }}
      />
    </div>
  );
}
