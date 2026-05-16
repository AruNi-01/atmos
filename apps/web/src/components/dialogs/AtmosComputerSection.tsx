'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toastManager,
  Switch,
} from '@workspace/ui';
import { Copy, KeyRound, LoaderCircle, RotateCw } from 'lucide-react';
import { useWebSocketStore } from '@/hooks/use-websocket';
import {
  cpFetchWithAccessToken,
  generateAccessToken,
  registerAccessTokenOnRelay,
} from '@/lib/atmos-access-token';
import { useAtmosComputerStore, type ComputerRow } from '@/lib/atmos-computer-store';

function formatExpiresAt(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleString();
}

export function AtmosComputerSection() {
  const {
    connectionMode,
    controlPlaneUrl,
    accessToken,
    computers,
    selectedServerId,
    relayWebSocketUrl,
    registerCommandShown,
    registerTokenExpiresAt,
    setConnectionMode,
    setControlPlaneUrl,
    setAccessToken,
    setComputers,
    setSelectedServerId,
    setRelayWebSocketUrl,
    setRegisterCommandShown,
    setRegisterTokenExpiresAt,
    resetRelaySession,
  } = useAtmosComputerStore();

  const [busy, setBusy] = useState<string | null>(null);
  const [tokenReveal, setTokenReveal] = useState<string | null>(null);

  const reconnectWs = () => {
    useWebSocketStore.getState().disconnect();
    void useWebSocketStore.getState().connect();
  };

  async function ensureAccessTokenReady(token: string): Promise<boolean> {
    if (token.trim().length < 32) {
      toastManager.add({
        title: 'Access token too short',
        description: 'Use at least 32 characters, or generate a new token.',
        type: 'error',
      });
      return false;
    }
    const reg = await registerAccessTokenOnRelay(controlPlaneUrl, token);
    if (!reg.ok) {
      toastManager.add({
        title: 'Could not register access token',
        description: reg.error ?? 'unknown',
        type: 'error',
      });
      return false;
    }
    return true;
  }

  async function onGenerateAccessToken() {
    setBusy('access');
    try {
      const token = generateAccessToken();
      const ok = await ensureAccessTokenReady(token);
      if (!ok) {
        return;
      }
      setAccessToken(token);
      setTokenReveal(token);
      toastManager.add({
        title: 'Access token created',
        description: 'Copy and store it — it will not be shown again.',
        type: 'success',
      });
    } finally {
      setBusy(null);
    }
  }

  async function onActivateAccessToken() {
    setBusy('access');
    try {
      const ok = await ensureAccessTokenReady(accessToken);
      if (ok) {
        toastManager.add({ title: 'Access token activated', type: 'success' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function onCreateRegisterToken() {
    if (!(await ensureAccessTokenReady(accessToken))) {
      return;
    }
    setBusy('register');
    try {
      const res = await cpFetchWithAccessToken(
        controlPlaneUrl,
        accessToken,
        '/v1/register_tokens',
        { method: 'POST', body: JSON.stringify({}) },
      );
      const data = (await res.json().catch(() => null)) as {
        register_command?: string;
        expires_at?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        toastManager.add({
          title: 'Register token failed',
          description: data?.error ?? JSON.stringify(data ?? res.status),
          type: 'error',
        });
        return;
      }
      if (data?.register_command) {
        setRegisterCommandShown(data.register_command);
        setRegisterTokenExpiresAt(data.expires_at ?? null);
        toastManager.add({
          title: 'Register token created',
          description: 'Run the command on your VPS (or set ATMOS_REGISTER_TOKEN).',
          type: 'success',
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function onRefreshList() {
    if (!(await ensureAccessTokenReady(accessToken))) {
      return;
    }
    setBusy('list');
    try {
      const res = await cpFetchWithAccessToken(
        controlPlaneUrl,
        accessToken,
        '/v1/computers',
      );
      const data = (await res.json().catch(() => null)) as
        | { computers?: ComputerRow[] }
        | null;
      if (!res.ok || !data?.computers) {
        toastManager.add({
          title: 'List computers failed',
          description: JSON.stringify(data ?? res.status),
          type: 'error',
        });
        return;
      }
      setComputers(data.computers);
      toastManager.add({ title: 'Computers refreshed', type: 'success' });
    } finally {
      setBusy(null);
    }
  }

  async function onRevokeSelected() {
    if (!selectedServerId) {
      toastManager.add({ title: 'Select a computer first', type: 'error' });
      return;
    }
    if (!(await ensureAccessTokenReady(accessToken))) {
      return;
    }
    setBusy('revoke');
    try {
      const res = await cpFetchWithAccessToken(
        controlPlaneUrl,
        accessToken,
        `/v1/computers/${encodeURIComponent(selectedServerId)}/revoke`,
        { method: 'POST', body: '{}' },
      );
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok) {
        toastManager.add({
          title: 'Revoke failed',
          description: JSON.stringify(data ?? res.status),
          type: 'error',
        });
        return;
      }
      toastManager.add({ title: 'Computer revoked', type: 'success' });
      await onRefreshList();
    } finally {
      setBusy(null);
    }
  }

  async function onConnectViaRelay() {
    if (!selectedServerId) {
      toastManager.add({ title: 'Select a computer first', type: 'error' });
      return;
    }
    if (!(await ensureAccessTokenReady(accessToken))) {
      return;
    }
    setBusy('session');
    try {
      const res = await cpFetchWithAccessToken(
        controlPlaneUrl,
        accessToken,
        `/v1/computers/${encodeURIComponent(selectedServerId)}/client_sessions`,
        {
          method: 'POST',
          body: JSON.stringify({ client_kind: 'web' }),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        ws_url?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.ws_url) {
        toastManager.add({
          title: 'Client session failed',
          description: data?.error ?? JSON.stringify(data ?? res.status),
          type: 'error',
        });
        return;
      }
      setRelayWebSocketUrl(data.ws_url);
      setConnectionMode('relay');
      toastManager.add({
        title: 'Relay session ready',
        description: 'Reconnecting main WebSocket…',
        type: 'success',
      });
      reconnectWs();
    } finally {
      setBusy(null);
    }
  }

  async function copyRegisterCommand() {
    if (!registerCommandShown) {
      return;
    }
    try {
      await navigator.clipboard.writeText(registerCommandShown);
      toastManager.add({ title: 'Copied register command', type: 'success' });
    } catch {
      toastManager.add({ title: 'Copy failed', type: 'error' });
    }
  }

  async function copyRevealedToken() {
    if (!tokenReveal) {
      return;
    }
    try {
      await navigator.clipboard.writeText(tokenReveal);
      toastManager.add({ title: 'Copied access token', type: 'success' });
    } catch {
      toastManager.add({ title: 'Copy failed', type: 'error' });
    }
  }

  return (
    <div className="space-y-6 px-6 py-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Atmos Computer</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Create your own access token (no account login), register VPS machines, then
          connect this browser over the public relay. Local mode still uses{' '}
          <span className="font-mono">runtime_manifest.json</span>.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium text-foreground">Your access token</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Treat it like a password: whoever has it can manage your computers on this relay.
          It is stored in this browser only — back it up yourself. We cannot recover a lost
          token.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium text-foreground">Relay privacy</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Relay mode uses TLS (<span className="font-mono">wss://</span>), but payloads are{' '}
          <strong className="text-foreground">not end-to-end encrypted</strong> yet.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Connect via relay</p>
          <p className="text-xs text-muted-foreground">
            When off, Web UI uses runtime_manifest / LAN API like today.
          </p>
        </div>
        <Switch
          checked={connectionMode === 'relay'}
          onCheckedChange={checked => {
            setConnectionMode(checked ? 'relay' : 'local');
            reconnectWs();
          }}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Control plane URL</label>
        <Input
          value={controlPlaneUrl}
          onChange={e => setControlPlaneUrl(e.target.value)}
          placeholder="https://relay.atmos.land"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">My access token</label>
        <Input
          type="password"
          autoComplete="off"
          value={accessToken}
          onChange={e => setAccessToken(e.target.value)}
          placeholder="Generate below or paste an existing token"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void onGenerateAccessToken()}
          >
            {busy === 'access' ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <KeyRound className="mr-2 size-4" />
            )}
            Generate new token
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null || !accessToken.trim()}
            onClick={() => void onActivateAccessToken()}
          >
            Activate / import token
          </Button>
        </div>
      </div>

      {tokenReveal ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3">
          <p className="text-xs font-medium text-foreground">Save this token now</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
            {tokenReveal}
          </pre>
          <Button variant="secondary" size="sm" onClick={() => void copyRevealedToken()}>
            <Copy className="mr-2 size-4" />
            Copy token
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null || !accessToken.trim()}
          onClick={() => void onCreateRegisterToken()}
        >
          {busy === 'register' ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : null}
          Add computer (register token)
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null || !accessToken.trim()}
          onClick={() => void onRefreshList()}
        >
          {busy === 'list' ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <RotateCw className="mr-2 size-4" />
          )}
          Refresh computers
        </Button>
      </div>

      {registerCommandShown ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-3">
          <p className="text-xs text-muted-foreground">
            Run on the VPS (expires{' '}
            {registerTokenExpiresAt ? formatExpiresAt(registerTokenExpiresAt) : 'soon'}):
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
            {registerCommandShown}
          </pre>
          <p className="text-xs text-muted-foreground">
            Or:{' '}
            <span className="font-mono">
              ATMOS_REGISTER_TOKEN=… ATMOS_CONTROL_PLANE_URL=… just dev-api
            </span>
          </p>
          <Button variant="secondary" size="sm" onClick={() => void copyRegisterCommand()}>
            <Copy className="mr-2 size-4" />
            Copy command
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Computer</label>
        <Select
          value={selectedServerId ?? ''}
          onValueChange={v => setSelectedServerId(v || null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select computer" />
          </SelectTrigger>
          <SelectContent>
            {computers
              .filter(c => !c.revoked)
              .map(c => (
                <SelectItem key={c.server_id} value={c.server_id}>
                  {(c.display_name ?? c.server_id).slice(0, 64)}
                  {c.online ? ' · online' : ''}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy !== null || !accessToken.trim()}
          onClick={() => void onConnectViaRelay()}
        >
          {busy === 'session' ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : null}
          Connect via relay
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null || !accessToken.trim()}
          onClick={() => void onRevokeSelected()}
        >
          Revoke selected
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            resetRelaySession();
            setConnectionMode('local');
            reconnectWs();
          }}
        >
          Clear relay session
        </Button>
      </div>

      {relayWebSocketUrl ? (
        <p className="break-all text-xs text-muted-foreground">
          Saved relay URL (redacted):{' '}
          {relayWebSocketUrl.replace(/token=[^&]+/, 'token=<redacted>')}
        </p>
      ) : null}
    </div>
  );
}
