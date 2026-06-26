'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, cn, toastManager } from '@workspace/ui';
import { Check, Copy, LoaderCircle } from 'lucide-react';
import { fetchRegisterToken } from '@/features/connection/lib/fetch-register-token';
import {
  buildRemoteComputerSetupCommand,
  buildRemoteComputerSetupPlaceholderCommand,
} from '@/features/connection/lib/remote-computer-setup-commands';
import { useAtmosComputerStore } from '@/features/connection/lib/atmos-computer-store';
import { clearRemoteComputerRegisterTokenCache } from '@/features/connection/lib/remote-computer-register-token-cache';

function CommandBlock({
  title,
  description,
  command,
  copied,
  onCopy,
  disabled,
  actionLabel = 'Copy',
  loading,
}: {
  title: string;
  description: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
  disabled?: boolean;
  actionLabel?: string;
  loading?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {title}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onCopy}>
            {loading ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : copied ? (
              <Check className="mr-2 size-4 text-emerald-500" />
            ) : (
              <Copy className="mr-2 size-4" />
            )}
            {loading ? 'Generating…' : copied ? 'Copied' : actionLabel}
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
  hasAccessToken,
  relayUrl,
  accessToken,
  relaySecretKey = '',
  busy,
}: {
  active?: boolean;
  hasAccessToken: boolean;
  relayUrl: string;
  accessToken: string;
  relaySecretKey?: string;
  busy: boolean;
}) {
  const registerCommandShown = useAtmosComputerStore(state => state.registerCommandShown);
  const registerTokenExpiresAt = useAtmosComputerStore(state => state.registerTokenExpiresAt);
  const setRegisterCommandShown = useAtmosComputerStore(state => state.setRegisterCommandShown);
  const setRegisterTokenExpiresAt = useAtmosComputerStore(state => state.setRegisterTokenExpiresAt);
  const [loadingToken, setLoadingToken] = useState(false);
  const [copiedSetup, setCopiedSetup] = useState(false);

  const clearRegistrationState = useCallback(() => {
    setRegisterCommandShown(null);
    setRegisterTokenExpiresAt(null);
  }, [setRegisterCommandShown, setRegisterTokenExpiresAt]);

  const generateRegistrationCode = useCallback(async (): Promise<string | null> => {
    if (!hasAccessToken) {
      return null;
    }
    setLoadingToken(true);
    try {
      const data = await fetchRegisterToken(relayUrl, accessToken, relaySecretKey);
      const command = buildRemoteComputerSetupCommand({
        registerToken: data.register_token,
        relayUrl,
        relaySecretKey,
      });
      setRegisterCommandShown(command);
      setRegisterTokenExpiresAt(data.expires_at);
      return command;
    } catch (err) {
      clearRegistrationState();
      toastManager.add({
        title: 'Could not prepare registration code',
        description: err instanceof Error ? err.message : 'Try again.',
        type: 'error',
      });
      return null;
    } finally {
      setLoadingToken(false);
    }
  }, [
    accessToken,
    clearRegistrationState,
    relayUrl,
    hasAccessToken,
    relaySecretKey,
    setRegisterCommandShown,
    setRegisterTokenExpiresAt,
  ]);

  useEffect(() => {
    clearRegistrationState();
    clearRemoteComputerRegisterTokenCache();
  }, [
    accessToken,
    clearRegistrationState,
    relayUrl,
    hasAccessToken,
    relaySecretKey,
  ]);

  const setupCommand =
    registerCommandShown ?? buildRemoteComputerSetupPlaceholderCommand(relayUrl);

  const tokenExpired =
    registerTokenExpiresAt != null && registerTokenExpiresAt * 1000 < Date.now();
  const needsCode = !registerCommandShown || tokenExpired;

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSetup(true);
      setTimeout(() => setCopiedSetup(false), 2000);
    } catch {
      toastManager.add({ title: 'Copy failed', type: 'error' });
    }
  }

  const setupDescription = !hasAccessToken
    ? 'Use an access key above first.'
    : loadingToken
      ? 'Preparing registration code…'
        : needsCode
          ? tokenExpired
            ? 'Registration code expired — generate and copy a fresh setup command.'
            : 'Generate and copy a setup command to link this remote computer to your access key above.'
        : 'Run on the remote computer. The registration code is one-time use and expires in about 15 minutes.';

  const actionLabel = needsCode
    ? tokenExpired
      ? 'Regenerate & Copy'
      : 'Generate & Copy'
    : 'Copy';

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-4">
      <CommandBlock
        title="Register & Start One Computer"
        description={setupDescription}
        command={setupCommand}
        copied={copiedSetup}
        disabled={!hasAccessToken || loadingToken || busy}
        actionLabel={actionLabel}
        loading={loadingToken}
        onCopy={() => {
          if (needsCode) {
            void (async () => {
              const command = await generateRegistrationCode();
              if (command) {
                await copyText(command);
              }
            })();
            return;
          }
          void copyText(setupCommand);
        }}
      />
    </div>
  );
}
