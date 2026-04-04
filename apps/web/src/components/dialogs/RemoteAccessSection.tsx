'use client';

import React from 'react';
import { format } from 'date-fns';
import {
  Button,
  Calendar,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
  toastManager,
} from '@workspace/ui';
import { CalendarIcon, Check, ChevronDown, Copy, Download, ExternalLink, Globe, KeyRound, LoaderCircle, Play, RefreshCw, Square, SquareTerminal, X } from 'lucide-react';
import { getRuntimeApiConfig, httpBase, isTauriRuntime } from '@/lib/desktop-runtime';
import { Terminal, type TerminalRef } from '@/components/terminal/Terminal';
import {
  useRemoteAccess,
  type ProviderKind,
  type ProviderAccessMode,
  type ProviderDiagnostics,
} from '@/hooks/use-remote-access';

function formatProvider(kind: ProviderKind): string {
  if (kind === 'cloudflare') return 'Cloudflare Tunnel';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function getActionCommand(provider: ProviderKind, action: 'install' | 'start' | 'login'): string | null {
  const info = PROVIDER_INSTALL[provider];
  if (!info) return null;
  if (action === 'install') return getInstallCommand(provider);
  if (action === 'login') return info.authHint ?? null;
  if (action === 'start') return info.startHint ?? null;
  return null;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'Unknown';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (remainMinutes === 0) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${hours}h ${remainMinutes}m`;
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).then(() => {
    toastManager.add({ title: 'Copied to clipboard', type: 'success' });
  });
}

function StatusDot({ state }: { state: string }) {
  const color =
    state === 'Running'
      ? 'bg-emerald-500'
      : state === 'Error'
        ? 'bg-red-500'
        : 'bg-yellow-500';
  return <span className={cn('inline-block size-2 rounded-full', color)} />;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 border-b border-border px-6 py-5 last:border-b-0">
      <div className="flex items-center">
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      <div className="flex items-center gap-2 text-sm text-foreground">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider install config
// ---------------------------------------------------------------------------

type ProviderInstallInfo = {
  commands: Record<string, string>;
  url: string;
  urlLabel: string;
  authHint?: string;
  startHint?: string;
};

const PROVIDER_INSTALL: Record<string, ProviderInstallInfo | null> = {
  tailscale: {
    commands: {
      darwin: 'brew install tailscale',
      linux: 'curl -fsSL https://tailscale.com/install.sh | sh',
    },
    url: 'https://tailscale.com/download',
    urlLabel: 'Tailscale Downloads',
    authHint: 'tailscale login',
    startHint: 'open -a Tailscale',
  },
  cloudflare: {
    commands: {
      darwin: 'brew install cloudflared',
      linux: 'curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared',
    },
    url: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
    urlLabel: 'Cloudflare Downloads',
  },
  ngrok: null,
};

function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'darwin';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'windows';
  return 'linux';
}

function getInstallCommand(provider: ProviderKind): string | null {
  const info = PROVIDER_INSTALL[provider];
  if (!info) return null;
  const platform = detectPlatform();
  return info.commands[platform] ?? info.commands['darwin'] ?? null;
}

// ---------------------------------------------------------------------------
// Provider install terminal popover
// ---------------------------------------------------------------------------

function ProviderActionTerminalPopover({
  provider,
  action,
  triggerLabel,
  triggerIcon,
  title,
  onDone,
}: {
  provider: ProviderKind;
  action: 'install' | 'start' | 'login';
  triggerLabel: string;
  triggerIcon: React.ReactNode;
  title: string;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const terminalRef = React.useRef<TerminalRef | null>(null);
  const startedRef = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);
  const command = getActionCommand(provider, action);
  const info = PROVIDER_INSTALL[provider];

  React.useEffect(() => {
    if (open) {
      startedRef.current = false;
      setSessionId(`provider-install-${provider}-${Date.now()}`);
    } else {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      terminalRef.current?.destroy();
      setSessionId(null);
      startedRef.current = false;
    }
  }, [open, provider]);

  const sendCommand = React.useCallback(() => {
    if (startedRef.current || !command) return;
    startedRef.current = true;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    terminalRef.current?.sendText(`${command}\r`);
  }, [command]);

  const queueCommand = React.useCallback(
    (delayMs: number) => {
      if (startedRef.current) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        sendCommand();
      }, delayMs);
    },
    [sendCommand],
  );

  if (!command || !info) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 cursor-pointer">
          {triggerIcon}
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[520px] overflow-hidden p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            <SquareTerminal className="size-3.5" />
            {title}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => copyToClipboard(command)}
              title="Copy command"
            >
              <Copy className="size-3.5" />
            </button>
            <button
              className="text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setOpen(false)}
              title="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Command bar */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5">
          <code className="flex-1 truncate text-[11px] font-mono text-muted-foreground">
            <span className="text-emerald-500">$</span> {command}
          </code>
        </div>

        {/* Terminal */}
        <div className="h-[280px] bg-background">
          {sessionId && (
            <Terminal
              ref={terminalRef}
              sessionId={sessionId}
              workspaceId="default"
              terminalName={`install-${provider}`}
              noTmux
              onSessionReady={() => queueCommand(1200)}
              onData={() => {
                if (!startedRef.current) queueCommand(400);
              }}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Inline link helpers for provider guidance
// ---------------------------------------------------------------------------

function ProviderActions({ p, onRedetect }: { p: ProviderDiagnostics; onRedetect: () => void }) {
  const info = PROVIDER_INSTALL[p.provider];
  const showDownload = !p.binary_found && info;
  const showAuthHint = p.provider !== 'ngrok' && p.binary_found && !p.logged_in && info?.authHint;
  const showTailscaleStart =
    p.provider === 'tailscale' && p.binary_found && p.daemon_running === false;
  const showTailscaleLogin =
    p.provider === 'tailscale' && p.binary_found && p.daemon_running === true && !p.logged_in;

  // Warnings from backend that aren't covered by structured actions above
  // (e.g. daemon not running, or future provider-specific messages)
  const hasStructuredAction = showDownload || showAuthHint || showTailscaleStart || showTailscaleLogin;
  const fallbackWarnings = hasStructuredAction ? [] : p.warnings;

  if (!showDownload && !showAuthHint && fallbackWarnings.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {(showTailscaleStart || showTailscaleLogin) && (
        <div className="flex flex-wrap items-center gap-2">
          {showTailscaleStart && (
            <ProviderActionTerminalPopover
              provider="tailscale"
              action="start"
              triggerLabel="Start Service"
              triggerIcon={<Play className="mr-1.5 size-3.5" />}
              title="Start Tailscale Service"
              onDone={onRedetect}
            />
          )}
          {showTailscaleLogin && (
            <ProviderActionTerminalPopover
              provider="tailscale"
              action="login"
              triggerLabel="Login"
              triggerIcon={<KeyRound className="mr-1.5 size-3.5" />}
              title="Login to Tailscale"
              onDone={onRedetect}
            />
          )}
        </div>
      )}
      {/* Structured: auth hint with copy */}
      {showAuthHint && (
        <div className="flex items-center gap-1.5">
          <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-foreground">
            {info!.authHint}
          </code>
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => copyToClipboard(info!.authHint!)}
            title="Copy command"
          >
            <Copy className="size-3" />
          </button>
        </div>
      )}
      {/* Structured: download link */}
      {showDownload && (
        <a
          href={info!.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="size-3" />
          {info!.urlLabel}
        </a>
      )}
      {/* Fallback: render backend warnings (daemon hints, etc.) */}
      {fallbackWarnings.map((w, i) => {
        // Parse inline commands (`cmd`) and URLs (https://...) into interactive elements
        const parts = w.split(/(`[^`]+`|https?:\/\/\S+)/g);
        return (
          <p key={i} className="flex flex-wrap items-center gap-1 text-xs text-yellow-500">
            <span>⚠</span>
            {parts.map((part, j) => {
              if (part.startsWith('`') && part.endsWith('`')) {
                const cmd = part.slice(1, -1);
                return (
                  <span key={j} className="inline-flex items-center gap-1">
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono text-foreground">
                      {cmd}
                    </code>
                    <button
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => copyToClipboard(cmd)}
                      title="Copy"
                    >
                      <Copy className="size-2.5" />
                    </button>
                  </span>
                );
              }
              if (/^https?:\/\//.test(part)) {
                return (
                  <a
                    key={j}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    <ExternalLink className="size-2.5" />
                    {(() => {
                      try { return new URL(part).hostname; }
                      catch { return part; }
                    })()}
                  </a>
                );
              }
              return <span key={j}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TTL Picker
// ---------------------------------------------------------------------------

type TtlPreset = { label: string; seconds: number };

const TTL_PRESETS: TtlPreset[] = [
  { label: '1 Hour', seconds: 3_600 },
  { label: '12 Hours', seconds: 43_200 },
  { label: '1 Day', seconds: 86_400 },
  { label: '30 Days', seconds: 2_592_000 },
  { label: '90 Days', seconds: 7_776_000 },
  { label: '180 Days', seconds: 15_552_000 },
  { label: '365 Days', seconds: 31_536_000 },
];

const NO_EXPIRY_SECONDS = 0;
const CUSTOM_SENTINEL = '__custom__';
const NO_EXPIRY_SENTINEL = '__no_expiry__';

function ttlPresetLabel(seconds: number): string {
  if (seconds === NO_EXPIRY_SECONDS) return 'No Expiry';
  const preset = TTL_PRESETS.find((p) => p.seconds === seconds);
  return preset ? preset.label : formatDuration(seconds);
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'No Expiry';
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3_600);
  const m = Math.floor((totalSeconds % 3_600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || '< 1m';
}

function TtlPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = React.useState<'preset' | 'custom'>(() => {
    if (value === NO_EXPIRY_SECONDS) return 'preset';
    return TTL_PRESETS.some((p) => p.seconds === value) ? 'preset' : 'custom';
  });
  const [calOpen, setCalOpen] = React.useState(false);
  const [customDate, setCustomDate] = React.useState<Date | undefined>(undefined);
  const [customTime, setCustomTime] = React.useState('00:00');

  const selectValue =
    mode === 'custom'
      ? CUSTOM_SENTINEL
      : value === NO_EXPIRY_SECONDS
        ? NO_EXPIRY_SENTINEL
        : String(value);

  const handleSelectChange = (v: string) => {
    if (v === CUSTOM_SENTINEL) {
      setMode('custom');
      return;
    }
    setMode('preset');
    if (v === NO_EXPIRY_SENTINEL) {
      onChange(NO_EXPIRY_SECONDS);
    } else {
      onChange(Number(v));
    }
  };

  const applyCustom = () => {
    if (!customDate) return;
    const [hh, mm] = customTime.split(':').map(Number);
    const target = new Date(customDate);
    target.setHours(hh ?? 0, mm ?? 0, 0, 0);
    const diffSecs = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1_000));
    onChange(diffSecs || 60);
    setCalOpen(false);
  };

  return (
    <div className="flex w-full items-center gap-2">
      <Select value={selectValue} onValueChange={handleSelectChange} disabled={disabled}>
        <SelectTrigger className={cn('w-full', mode === 'custom' && 'w-[120px]')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TTL_PRESETS.map((p) => (
            <SelectItem key={p.seconds} value={String(p.seconds)}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value={NO_EXPIRY_SENTINEL}>No Expiry</SelectItem>
          <SelectItem value={CUSTOM_SENTINEL}>Custom…</SelectItem>
        </SelectContent>
      </Select>

      {mode === 'custom' && (
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={disabled}
              className="min-w-0 flex-1 justify-between font-normal"
            >
              <span className="truncate text-xs">
                {customDate ? format(customDate, 'PP') : 'Pick date'}
              </span>
              <CalendarIcon className="ml-1 size-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="end">
            <Calendar
              mode="single"
              selected={customDate}
              captionLayout="dropdown"
              defaultMonth={customDate ?? new Date()}
              disabled={{ before: new Date() }}
              onSelect={(d) => setCustomDate(d)}
            />
            <div className="flex items-center gap-2 border-t border-border px-3 py-2">
              <Input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="h-8 w-[110px] text-xs font-mono appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              />
              <Button size="sm" disabled={!customDate} onClick={applyCustom} className="ml-auto cursor-pointer">
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function RemoteAccessSection() {
  if (!isTauriRuntime()) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="px-6 py-5">
          <p className="text-base font-medium text-foreground">Remote Access</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Remote Access is only available in the desktop app.
          </p>
        </div>
      </div>
    );
  }

  return <RemoteAccessContent />;
}

/** Whether a provider supports inline auth-token configuration. */
function supportsTokenConfig(provider: ProviderKind): boolean {
  return provider === 'ngrok';
}

function providerInstallLabel(p: ProviderDiagnostics): { label: string; color: string } {
  if (p.provider === 'ngrok') {
    // ngrok uses embedded SDK — always integrated
    return { label: 'SDK Integrated', color: 'text-emerald-500' };
  }
  return p.binary_found
    ? { label: 'Installed', color: 'text-emerald-500' }
    : { label: 'Uninstalled', color: 'text-red-500' };
}

function providerAuthLabel(
  p: ProviderDiagnostics,
): { label: string; color: string } | null {
  // Don't show auth status when the provider is not installed (can't be authed)
  if (p.provider !== 'ngrok' && !p.binary_found) return null;
  return p.logged_in
    ? { label: 'Authenticated', color: 'text-emerald-500' }
    : { label: 'Not Authenticated', color: 'text-red-500' };
}

function RemoteAccessContent() {
  const {
    status,
    providers,
    isLoading,
    isStarting,
    isStopping,
    detect,
    refreshStatus,
    start,
    stop,
    saveCredential,
  } = useRemoteAccess();

  const [selectedProvider, setSelectedProvider] = React.useState<ProviderKind | ''>('');
  const [selectedMode, setSelectedMode] = React.useState<ProviderAccessMode>('private');
  const [ttlSecs, setTtlSecs] = React.useState(3600);
  const [detectionExpanded, setDetectionExpanded] = React.useState(false);
  const [tokenEditProvider, setTokenEditProvider] = React.useState<ProviderKind | null>(null);
  const [tokenDraft, setTokenDraft] = React.useState('');

  React.useEffect(() => {
    void detect();
  }, [detect]);

  React.useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].provider);
    }
  }, [providers, selectedProvider]);

  const isRunning = !!(status && status.provider_status.state === 'Running');

  const handleStart = async () => {
    if (!selectedProvider) return;
    try {
      const config = await getRuntimeApiConfig();
      const targetBaseUrl = httpBase(config);
      await start(
        selectedProvider,
        selectedMode,
        targetBaseUrl,
        ttlSecs || undefined,
      );
    } catch (err) {
      toastManager.add({
        title: 'Failed to start tunnel',
        description: err instanceof Error ? err.message : String(err),
        type: 'error',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Card 1: Tunnel Status */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3">
            <p className="text-base font-medium text-foreground">Remote Access</p>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                <StatusDot state="Running" />
                Tunnel active
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Expose your local Atmos instance via a secure tunnel for remote browser access.
          </p>
        </div>

        <div className="border-t border-border">
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
              <div>
                <p className="text-sm font-medium text-foreground">Provider</p>
                <p className="mt-1 text-xs text-muted-foreground">Select tunnel provider</p>
              </div>
              <div className="flex items-center">
                {isLoading ? (
                  <Skeleton className="h-9 w-full rounded-md" />
                ) : (
                  <Select
                    value={selectedProvider}
                    onValueChange={(v) => setSelectedProvider(v as ProviderKind)}
                    disabled={isRunning}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.provider} value={p.provider}>
                          <span className="flex items-center gap-2">
                            {formatProvider(p.provider)}
                            {p.logged_in && (
                              <span className="text-xs text-emerald-500">✓ ready</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
              <div>
                <p className="text-sm font-medium text-foreground">Access Mode</p>
                <p className="mt-1 text-xs text-muted-foreground">Private requires authentication, public is open</p>
              </div>
              <div className="flex items-center">
                <Select
                  value={selectedMode}
                  onValueChange={(v) => setSelectedMode(v as ProviderAccessMode)}
                  disabled={isRunning}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
              <div>
                <p className="text-sm font-medium text-foreground">Expiration</p>
                <p className="mt-1 text-xs text-muted-foreground">Session duration</p>
              </div>
              <div className="flex items-center">
                <TtlPicker value={ttlSecs} onChange={setTtlSecs} disabled={isRunning} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => void handleStart()}
                disabled={isStarting || !selectedProvider || isRunning}
                className="cursor-pointer"
              >
                {isStarting ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <Play className="mr-2 size-4" />
                )}
                {isRunning ? 'Tunnel Running' : 'Start Tunnel'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Active Tunnel (visible only when running) */}
      {isRunning && status && (
        <div className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3">
              <p className="text-base font-medium text-foreground">Active Tunnel</p>
              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                <StatusDot state="Running" />
                {status.provider ? formatProvider(status.provider) : 'Unknown'}
              </span>
            </div>
          </div>
          <div className="border-t border-emerald-500/20">
            {status.gateway_url && (
              <InfoRow label="Gateway URL">
                <code className="truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {status.gateway_url}
                </code>
              </InfoRow>
            )}
            {status.public_url && (
              <InfoRow label="Public URL">
                <code className="truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {status.public_url}
                </code>
                <button
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => copyToClipboard(status.public_url!)}
                  title="Copy"
                >
                  <Copy className="size-3.5" />
                </button>
                <a
                  href={status.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  title="Open in browser"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </InfoRow>
            )}
            {status.share_url && (
              <InfoRow label="Share URL">
                <code className="truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {status.share_url}
                </code>
                <button
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => copyToClipboard(status.share_url!)}
                  title="Copy"
                >
                  <Copy className="size-3.5" />
                </button>
              </InfoRow>
            )}
            {status.active_session_id && (
              <InfoRow label="Session">
                <code className="truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {status.active_session_id.slice(0, 16)}…
                </code>
              </InfoRow>
            )}
            <InfoRow label="Expires">
              {formatExpiry(status.expires_at)}
            </InfoRow>
            {status.provider_status.message && (
              <InfoRow label="Message">
                <span className="text-xs text-muted-foreground">{status.provider_status.message}</span>
              </InfoRow>
            )}
            <div className="flex justify-end px-6 py-4">
              <Button
                variant="destructive"
                onClick={() => void stop()}
                disabled={isStopping}
                className="cursor-pointer"
              >
                {isStopping ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <Square className="mr-2 size-4" />
                )}
                Stop Tunnel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card 2: Provider Detection */}
      <Collapsible
        open={detectionExpanded}
        onOpenChange={setDetectionExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <Globe className="absolute inset-0 size-5 text-muted-foreground transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">Provider Detection</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Detected tunnel providers and their current status.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <Button
            variant="outline"
            onClick={() => {
              setDetectionExpanded(true);
              void detect();
            }}
            disabled={isLoading}
            className="cursor-pointer"
          >
            {isLoading ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Detect
          </Button>
        </div>

        <CollapsibleContent>
          {providers.length === 0 ? (
            <div className="border-t border-border px-6 py-5 text-sm text-muted-foreground">
              {isLoading ? 'Detecting providers…' : 'No providers detected.'}
            </div>
          ) : (
            <div className="border-t border-border px-4">
              {providers.map((p) => {
                const install = providerInstallLabel(p);
                const auth = providerAuthLabel(p);
                const showTokenConfig = supportsTokenConfig(p.provider) && !p.logged_in;
                const isEditing = tokenEditProvider === p.provider;

                return (
                  <div
                    key={p.provider}
                    className="border-b border-border px-2 py-4 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {formatProvider(p.provider)}
                        </p>
                        <div className="mt-1 flex items-center gap-3">
                          {/* Install / SDK status */}
                          <span className={cn('inline-flex items-center gap-1 text-xs', install.color)}>
                            <span className={cn(
                              'inline-block size-1.5 rounded-full',
                              install.color.replace('text-', 'bg-'),
                            )} />
                            {install.label}
                          </span>

                          {/* Auth status (hidden when uninstalled) */}
                          {auth && (
                            <span className={cn('inline-flex items-center gap-1 text-xs', auth.color)}>
                              <span className={cn(
                                'inline-block size-1.5 rounded-full',
                                auth.color.replace('text-', 'bg-'),
                              )} />
                              {auth.label}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Install button (for uninstalled binary providers) */}
                      {p.provider !== 'ngrok' && !p.binary_found && PROVIDER_INSTALL[p.provider] && (
                        <ProviderActionTerminalPopover
                          provider={p.provider}
                          action="install"
                          triggerLabel="Install"
                          triggerIcon={<Download className="mr-1.5 size-3.5" />}
                          title={`Install ${formatProvider(p.provider)}`}
                          onDone={() => void detect()}
                        />
                      )}

                      {/* Configure token button */}
                      {showTokenConfig && !isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 cursor-pointer"
                          onClick={() => {
                            setTokenEditProvider(p.provider);
                            setTokenDraft('');
                          }}
                        >
                          <KeyRound className="mr-1.5 size-3.5" />
                          Configure
                        </Button>
                      )}
                    </div>

                    {/* Inline token editor */}
                    {isEditing && (
                      <div className="mt-3 flex items-center gap-2">
                        <Input
                          type="password"
                          value={tokenDraft}
                          onChange={(e) => setTokenDraft(e.target.value)}
                          placeholder="Paste auth token…"
                          className="h-8 flex-1 font-mono text-xs"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          className="shrink-0 cursor-pointer"
                          disabled={!tokenDraft.trim()}
                          onClick={async () => {
                            await saveCredential(p.provider, tokenDraft.trim());
                            setTokenEditProvider(null);
                            setTokenDraft('');
                            toastManager.add({ title: 'Token saved', type: 'success' });
                            void detect();
                          }}
                        >
                          <Check className="mr-1 size-3.5" />
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 cursor-pointer"
                          onClick={() => {
                            setTokenEditProvider(null);
                            setTokenDraft('');
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    )}

                    {/* Structured actions: install link, auth hint */}
                    <ProviderActions p={p} onRedetect={() => void detect()} />

                    {p.last_error && (
                      <p className="mt-2 text-xs text-red-500">{p.last_error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}


