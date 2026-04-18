'use client';

import React from 'react';
import { format } from 'date-fns';
import {
  Badge,
  Button,
  Calendar,
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
import {
  CalendarIcon,
  Check,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Play,
  ShieldCheck,
  ShieldOff,
  Square,
  SquareTerminal,
  Wifi,
  X,
} from 'lucide-react';

import { getRuntimeApiConfig, httpBase, isTauriRuntime } from '@/lib/desktop-runtime';
import { Terminal, type TerminalRef } from '@/components/terminal/Terminal';
import {
  useRemoteAccess,
  type ProviderKind,
  type ProviderAccessMode,
  type ProviderDiagnostics,
  type RemoteAccessStatus,
} from '@/hooks/use-remote-access';

export function formatProvider(kind: ProviderKind): string {
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

export function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No Expiry';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (remainMinutes === 0) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${hours}h ${remainMinutes}m`;
}

export type SessionUrgency = 'ok' | 'warning' | 'expired';

export function getSessionUrgency(expiresAt: string | null): SessionUrgency {
  if (!expiresAt) return 'ok';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  if (diff < 60 * 60 * 1000) return 'warning'; // < 1 hour
  return 'ok';
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text);
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

/** Label row with optional external-link button on the right. */
export function CopyableLabel({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <p className="text-xs text-muted-foreground">{children}</p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          title="Open in browser"
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

/** Inline copyable text box — click anywhere to copy, hover highlights, icon → check on success. */
export function CopyableText({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title="Click to copy"
      className="group flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded bg-muted px-2 py-1 transition-colors hover:bg-accent"
    >
      <code className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        {value}
      </code>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-500" />
      ) : (
        <Copy className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      )}
    </button>
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

  if (
    !showDownload &&
    !showAuthHint &&
    !showTailscaleStart &&
    !showTailscaleLogin &&
    fallbackWarnings.length === 0
  ) {
    return null;
  }

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
          <PopoverContent className="w-auto overflow-hidden p-0" align="end" avoidCollisions={false}>
            <Calendar
              mode="single"
              selected={customDate}
              captionLayout="dropdown"
              defaultMonth={customDate ?? new Date()}
              disabled={{ before: new Date() }}
              onSelect={(d) => setCustomDate(d)}
              classNames={{ month_grid: 'w-full', weeks: 'min-h-[168px]' }}
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

// ---------------------------------------------------------------------------
// Renew Session Popover
// ---------------------------------------------------------------------------

export function RenewSessionPopover({
  provider,
  status,
  onRenew,
  urgency,
}: {
  provider: ProviderKind;
  status: RemoteAccessStatus;
  onRenew: (ttlSecs: number, reuseToken: boolean) => Promise<void>;
  urgency: SessionUrgency;
}) {
  const [open, setOpen] = React.useState(false);
  const [ttlSecs, setTtlSecs] = React.useState(3600);
  const [reuseToken, setReuseToken] = React.useState(true);
  const [isRenewing, setIsRenewing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleRenew = async () => {
    setError(null);
    setIsRenewing(true);
    try {
      await onRenew(ttlSecs, reuseToken);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRenewing(false);
    }
  };

  const triggerCls = urgency === 'expired'
    ? 'border-red-500/60 bg-red-500/10 text-red-500 hover:bg-red-500/20'
    : 'border-amber-500/60 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20';

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('cursor-pointer', triggerCls)}>
          <LoaderCircle className="mr-1.5 size-3.5" />
          {urgency === 'expired' ? 'Expired — Renew' : 'Renew'}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Renew Session</p>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">New expiration</p>
            <TtlPicker value={ttlSecs} onChange={setTtlSecs} />
          </div>
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Entry token</p>
            <div className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="radio"
                  name={`token-mode-${provider}`}
                  checked={reuseToken}
                  onChange={() => setReuseToken(true)}
                  className="accent-foreground"
                />
                Keep existing token
                <span className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">recommended</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="radio"
                  name={`token-mode-${provider}`}
                  checked={!reuseToken}
                  onChange={() => setReuseToken(false)}
                  className="accent-foreground"
                />
                Generate new token
              </label>
            </div>
            {!reuseToken && (
              <p className="mt-1.5 text-[11px] text-amber-500">
                Previously shared URLs will stop working.
              </p>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <Button className="w-full cursor-pointer" size="sm" onClick={() => void handleRenew()} disabled={isRenewing}>
            {isRenewing ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <LoaderCircle className="mr-1.5 size-3.5" />}
            Renew Session
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Start Tunnel Popover
// ---------------------------------------------------------------------------

function StartTunnelPopover({
  provider,
  isStarting,
  isStopping,
  onStart,
  onForceStop,
}: {
  provider: ProviderKind;
  isStarting: boolean;
  isStopping: boolean;
  onStart: (mode: ProviderAccessMode, ttlSecs: number) => Promise<void>;
  onForceStop: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<ProviderAccessMode>('public');
  const [ttlSecs, setTtlSecs] = React.useState(3600);
  const [startError, setStartError] = React.useState<string | null>(null);

  const isAlreadyRunning = startError?.toLowerCase().includes('already running');

  const handleStart = async () => {
    setStartError(null);
    try {
      await onStart(provider === 'tailscale' ? mode : 'public', ttlSecs);
      setOpen(false);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleForceStop = async () => {
    try {
      await onForceStop();
      setStartError(null);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setStartError(null); }}>
      <PopoverTrigger asChild>
        <Button size="sm" className="cursor-pointer" disabled={isStarting}>
          {isStarting ? (
            <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 size-3.5" />
          )}
          Start Tunnel
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">
          Start {formatProvider(provider)} Tunnel
        </p>
        <div className="space-y-3">
          {provider === 'tailscale' && (
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Access Mode</p>
              <Select value={mode} onValueChange={(v) => setMode(v as ProviderAccessMode)}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — internet accessible (Funnel)</SelectItem>
                  <SelectItem value="private">Private — tailnet only (Serve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Expiration</p>
            <TtlPicker value={ttlSecs} onChange={setTtlSecs} />
          </div>
          {startError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <p className="font-medium">Failed to start tunnel</p>
              <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{startError}</p>
              {isAlreadyRunning && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2 w-full cursor-pointer"
                  onClick={() => void handleForceStop()}
                  disabled={isStopping}
                >
                  {isStopping ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <Square className="mr-1.5 size-3.5" />}
                  Stop Now
                </Button>
              )}
            </div>
          )}
          <Button
            className="w-full cursor-pointer"
            size="sm"
            onClick={() => void handleStart()}
            disabled={isStarting}
          >
            {isStarting ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> : <Play className="mr-1.5 size-3.5" />}
            Start Tunnel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// View Tunnel Popover
// ---------------------------------------------------------------------------

function ViewTunnelPopover({
  status,
  onRenew,
}: {
  status: RemoteAccessStatus;
  onRenew: (ttlSecs: number, reuseToken: boolean) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const urgency = getSessionUrgency(status.expires_at);
  const expiryTextCls =
    urgency === 'expired'
      ? 'text-red-500 font-medium'
      : urgency === 'warning'
        ? 'text-amber-500 font-medium'
        : 'text-foreground';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="cursor-pointer">
          <ExternalLink className="mr-1.5 size-3.5" />
          View Tunnel
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[400px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <StatusDot state="Running" />
            Active Tunnel
          </span>
          <button
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <X className="size-3.5" />
          </button>
        </div>
        {/* Inset dividers per SettingsModalRule: px-4 wrapper, border-b on each row */}
        <div className="px-4">
          {status.public_url && (
            <div className="border-b border-border py-3 last:border-b-0">
              <CopyableLabel href={status.public_url}>Public URL</CopyableLabel>
              <CopyableText value={status.public_url} />
            </div>
          )}
          {status.share_url && (
            <div className="border-b border-border py-3 last:border-b-0">
              <CopyableLabel href={status.share_url}>Access URL (with token)</CopyableLabel>
              <CopyableText value={status.share_url} />
            </div>
          )}
          {status.entry_token && (
            <div className="border-b border-border py-3 last:border-b-0">
              <CopyableLabel>Entry Token</CopyableLabel>
              <CopyableText value={status.entry_token} />
            </div>
          )}
          <div className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Expires</p>
              <p className={cn('text-xs', expiryTextCls)}>{formatExpiry(status.expires_at)}</p>
            </div>
            {(urgency === 'warning' || urgency === 'expired') && status.provider && (
              <RenewSessionPopover
                provider={status.provider}
                status={status}
                onRenew={onRenew}
                urgency={urgency}
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function RemoteAccessContent() {
  const {
    statusMap,
    providers,
    isLoading,
    startingProviders,
    stoppingProviders,
    detect,
    start,
    stop,
    renew,
    saveCredential,
  } = useRemoteAccess();

  const [tokenEditProvider, setTokenEditProvider] = React.useState<ProviderKind | null>(null);
  const [tokenDraft, setTokenDraft] = React.useState('');

  React.useEffect(() => {
    void detect();
  }, [detect]);

  const handleStart = async (provider: ProviderKind, mode: ProviderAccessMode, ttlSecs: number) => {
    const config = await getRuntimeApiConfig();
    const targetBaseUrl = httpBase(config);
    await start(provider, mode, targetBaseUrl, ttlSecs || undefined);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <div>
          <p className="text-base font-medium text-foreground">Providers</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tunnel providers for remote browser access to your local Atmos instance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void detect()}
          disabled={isLoading}
          className="cursor-pointer"
        >
          {isLoading ? (
            <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <LoaderCircle className="mr-1.5 size-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Provider list */}
      <div className="border-t border-border">
        {isLoading && providers.length === 0 ? (
          <div className="space-y-px px-6 py-4">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : providers.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">No providers detected.</div>
        ) : (
          <div className="border-t border-border px-4">
            {providers.map((p) => {
              const install = providerInstallLabel(p);
              const auth = providerAuthLabel(p);
              const isReady = p.logged_in;
              const providerStatus = statusMap[p.provider];
              const isThisRunning = !!(providerStatus && providerStatus.provider_status.state === 'Running');
              const isThisStarting = startingProviders.has(p.provider);
              const isThisStopping = stoppingProviders.has(p.provider);
              const showTokenConfig = supportsTokenConfig(p.provider) && !p.logged_in;
              const isEditing = tokenEditProvider === p.provider;
              const sessionUrgency = isThisRunning ? getSessionUrgency(providerStatus?.expires_at ?? null) : 'ok';

              return (
                <div key={p.provider} className="border-b border-border px-2 py-4 last:border-b-0">
                  <div className="flex items-center gap-3">
                    {/* Provider info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {formatProvider(p.provider)}
                        </p>
                        {isThisRunning && (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <Wifi className="size-3" />
                            Running
                          </Badge>
                        )}
                        {sessionUrgency === 'expired' && (
                          <Badge className="border-red-500/30 bg-red-500/10 text-red-500">
                            Session expired
                          </Badge>
                        )}
                        {sessionUrgency === 'warning' && (
                          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                            Expires {formatExpiry(providerStatus?.expires_at ?? null)}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          className={cn(
                            install.color === 'text-emerald-500'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
                          )}
                        >
                          {install.color === 'text-emerald-500' ? <Check className="size-3" /> : <X className="size-3" />}
                          {install.label}
                        </Badge>
                        {auth && (
                          <Badge
                            className={cn(
                              auth.color === 'text-emerald-500'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
                            )}
                          >
                            {auth.color === 'text-emerald-500' ? <ShieldCheck className="size-3" /> : <ShieldOff className="size-3" />}
                            {auth.label}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Install */}
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

                      {/* Configure token (ngrok) */}
                      {showTokenConfig && !isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="cursor-pointer"
                          onClick={() => { setTokenEditProvider(p.provider); setTokenDraft(''); }}
                        >
                          <KeyRound className="mr-1.5 size-3.5" />
                          Configure
                        </Button>
                      )}

                      {/* Tunnel controls (ready providers) */}
                      {isReady && (
                        <>
                          {isThisRunning ? (
                            <>
                              {providerStatus && (
                                <ViewTunnelPopover
                                  status={providerStatus}
                                  onRenew={(ttlSecs, reuseToken) => renew(p.provider, ttlSecs, reuseToken).then(() => {})}
                                />
                              )}
                              {providerStatus && (sessionUrgency === 'warning' || sessionUrgency === 'expired') && (
                                <RenewSessionPopover
                                  provider={p.provider}
                                  status={providerStatus}
                                  onRenew={(ttlSecs, reuseToken) => renew(p.provider, ttlSecs, reuseToken).then(() => {})}
                                  urgency={sessionUrgency}
                                />
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                className="cursor-pointer"
                                onClick={() => void stop(p.provider)}
                                disabled={isThisStopping}
                              >
                                {isThisStopping ? (
                                  <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                                ) : (
                                  <Square className="mr-1.5 size-3.5" />
                                )}
                                Stop Tunnel
                              </Button>
                            </>
                          ) : (
                            <StartTunnelPopover
                              provider={p.provider}
                              isStarting={isThisStarting}
                              isStopping={isThisStopping}
                              onStart={(mode, ttl) => handleStart(p.provider, mode, ttl)}
                              onForceStop={() => stop(p.provider)}
                            />
                          )}
                        </>
                      )}
                    </div>
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
                        onClick={() => { setTokenEditProvider(null); setTokenDraft(''); }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* Structured actions and warnings */}
                  <ProviderActions p={p} onRedetect={() => void detect()} />

                  {p.last_error && (
                    <p className="mt-2 text-xs text-red-500">{p.last_error}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
