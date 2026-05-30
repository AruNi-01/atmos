'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, cn, toastManager } from '@workspace/ui';
import { Check, Copy, LoaderCircle, RotateCw } from 'lucide-react';
import { fetchRegisterToken } from '@/features/connection/lib/fetch-register-token';
import {
  buildRemoteComputerInstallCommand,
  buildRemoteComputerStartCommand,
} from '@/features/connection/lib/remote-computer-setup-commands';
import {
  clearRemoteComputerRegisterTokenCache,
  loadRemoteComputerRegisterTokenCache,
  saveRemoteComputerRegisterTokenCache,
} from '@/features/connection/lib/remote-computer-register-token-cache';

function CommandBlock({
  step,
  title,
  description,
  command,
  copied,
  onCopy,
  disabled,
  headerEnd,
}: {
  step: number;
  title: string;
  description: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
  disabled?: boolean;
  headerEnd?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          <span className="mr-2 text-muted-foreground">{step}.</span>
          {title}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {headerEnd}
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onCopy}>
            {copied ? <Check className="mr-2 size-4 text-emerald-500" /> : <Copy className="mr-2 size-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <pre
        className={cn(
          'overflow-x-auto rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed text-foreground',
          disabled && 'opacity-50',
        )}
      >
        {command}
      </pre>
    </div>
  );
}

export function RemoteComputerSetupBlock({
  active = true,
  hasAccessToken,
  controlPlaneUrl,
  accessToken,
  busy,
}: {
  /** When false (collapsed), skip loading cached registration codes. */
  active?: boolean;
  hasAccessToken: boolean;
  controlPlaneUrl: string;
  accessToken: string;
  busy: boolean;
}) {
  const installCommand = buildRemoteComputerInstallCommand();
  const [registerToken, setRegisterToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedStart, setCopiedStart] = useState(false);

  const applyCache = useCallback(
    (cache: { register_token: string; expires_at: number; created_at: number }) => {
      setRegisterToken(cache.register_token);
      setExpiresAt(cache.expires_at);
      setCreatedAt(cache.created_at);
    },
    [],
  );

  const clearRegistrationState = useCallback(() => {
    setRegisterToken(null);
    setExpiresAt(null);
    setCreatedAt(null);
  }, []);

  const generateRegistrationCode = useCallback(async () => {
    if (!hasAccessToken) {
      return;
    }
    setLoadingToken(true);
    try {
      const data = await fetchRegisterToken(controlPlaneUrl, accessToken);
      await saveRemoteComputerRegisterTokenCache(
        accessToken,
        controlPlaneUrl,
        data.register_token,
        data.expires_at,
      );
      const cached = await loadRemoteComputerRegisterTokenCache(accessToken, controlPlaneUrl);
      if (cached) {
        applyCache(cached);
      } else {
        applyCache({
          register_token: data.register_token,
          expires_at: data.expires_at,
          created_at: Math.floor(Date.now() / 1000),
        });
      }
    } catch (err) {
      clearRegistrationState();
      toastManager.add({
        title: 'Could not prepare registration code',
        description: err instanceof Error ? err.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setLoadingToken(false);
    }
  }, [
    accessToken,
    applyCache,
    clearRegistrationState,
    controlPlaneUrl,
    hasAccessToken,
  ]);

  useEffect(() => {
    if (!hasAccessToken) {
      clearRegistrationState();
      clearRemoteComputerRegisterTokenCache();
      return;
    }
    if (!active) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const cached = await loadRemoteComputerRegisterTokenCache(accessToken, controlPlaneUrl);
      if (cancelled) {
        return;
      }
      if (cached) {
        applyCache(cached);
      } else {
        clearRegistrationState();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    active,
    accessToken,
    applyCache,
    clearRegistrationState,
    controlPlaneUrl,
    hasAccessToken,
  ]);

  const startCommand =
    registerToken != null
      ? buildRemoteComputerStartCommand({ registerToken, controlPlaneUrl })
      : 'export PATH="$HOME/.atmos/bin:$PATH"\natmos computer start --token <registration_code> --daemon';

  const tokenExpired = expiresAt != null && expiresAt * 1000 < Date.now();
  const needsCode = !registerToken || tokenExpired;

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

  const step2Description = !hasAccessToken
    ? 'Save your access key above first.'
    : loadingToken
      ? 'Preparing registration code…'
      : needsCode
        ? tokenExpired
          ? 'Registration code expired — generate a new one for your current access key.'
          : 'Generate a registration code to link this remote computer to your access key above.'
        : createdAt != null
          ? `Run on the remote computer after step 1. Code generated ${new Date(createdAt * 1000).toLocaleString()}; expires in about 15 minutes.`
          : 'Run on the remote computer after step 1. Uses your saved access key; the code expires in about 15 minutes.';

  const regenerateButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={loadingToken || busy}
      onClick={() => void generateRegistrationCode()}
    >
      {loadingToken ? (
        <LoaderCircle className="mr-2 size-4 animate-spin" />
      ) : (
        <RotateCw className="mr-2 size-4" />
      )}
      {loadingToken
        ? 'Generating…'
        : tokenExpired
          ? 'Regenerate code'
          : 'Generate code'}
    </Button>
  );

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-4">
      <CommandBlock
        step={1}
        title="Install CLI + API"
        description="Installs Atmos on the remote computer."
        command={installCommand}
        copied={copiedInstall}
        onCopy={() => void copyText(installCommand, 'install')}
      />

      <CommandBlock
        step={2}
        title="Register and start (background)"
        description={step2Description}
        command={startCommand}
        copied={copiedStart}
        disabled={!hasAccessToken || !registerToken || tokenExpired || loadingToken}
        headerEnd={hasAccessToken && needsCode ? regenerateButton : null}
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
