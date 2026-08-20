'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Badge,
  Button,
  Input,
  Skeleton,
  cn,
} from '@workspace/ui';
import {
  Check,
  Download,
  KeyRound,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
  ShieldOff,
  Square,
  Wifi,
  X,
} from 'lucide-react';

import { getRuntimeApiConfig, httpBase, isDesktopRuntime } from '@/shared/lib/desktop-runtime';
import {
  useTunnelConnector,
  type ProviderKind,
  type ProviderAccessMode,
} from '@/features/connection/hooks/use-tunnel-connector';
import {
  PROVIDER_INSTALL,
  ProviderActionTerminalPopover,
  ProviderActions,
  RenewSessionPopover,
  StartTunnelPopover,
  ViewTunnelPopover,
  formatExpiry,
  formatProvider,
  getSessionUrgency,
  providerAuthLabel,
  providerInstallLabel,
  supportsTokenConfig,
} from '@/features/tunnel-connector/components/tunnel-connector-controls';
import { SettingsGroup, SettingsGroupCard } from '@/features/settings/components/settings/SettingsGroupCard';

export {
  CopyableLabel,
  CopyableText,
  RenewSessionPopover,
  formatExpiry,
  formatProvider,
  getSessionUrgency,
} from '@/features/tunnel-connector/components/tunnel-connector-controls';

export function TunnelConnectorSection() {
  const t = useTranslations("tunnelConnector.section");
  if (!isDesktopRuntime()) {
    return (
      <SettingsGroup>
        <p className="px-2 py-3 text-sm text-muted-foreground">{t("desktopOnly")}</p>
      </SettingsGroup>
    );
  }

  return <TunnelConnectorContent />;
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function TunnelConnectorContent() {
  const t = useTranslations("tunnelConnector.section");
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
  } = useTunnelConnector();

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
    <SettingsGroupCard
      title={t("providersTitle")}
      description={t("providersDescription")}
      headerEnd={
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
            <RotateCw className="mr-1.5 size-3.5" />
          )}
          {t("refresh")}
        </Button>
      }
    >
        {isLoading && providers.length === 0 ? (
          <div className="space-y-2 py-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : providers.length === 0 ? (
          <div className="py-3 text-sm text-muted-foreground">{t("empty")}</div>
        ) : (
          <div>
            {providers.map((p) => {
              const install = providerInstallLabel(p);
              const auth = providerAuthLabel(p);
              const isReady = p.logged_in;
              const providerStatus = statusMap[p.provider];
              const isThisRunning = !!(
                providerStatus &&
                providerStatus.provider_status?.state === 'Running'
              );
              const isThisStarting = startingProviders.has(p.provider);
              const isThisStopping = stoppingProviders.has(p.provider);
              const showTokenConfig = supportsTokenConfig(p.provider) && !p.logged_in;
              const isEditing = tokenEditProvider === p.provider;
              const sessionUrgency = isThisRunning ? getSessionUrgency(providerStatus?.expires_at ?? null) : 'ok';

              return (
                <div key={p.provider} className="border-b border-border/60 px-2 py-3 last:border-b-0">
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
                            {t("status.running")}
                          </Badge>
                        )}
                        {sessionUrgency === 'expired' && (
                          <Badge className="border-red-500/30 bg-red-500/10 text-red-500">
                            {t("status.sessionExpired")}
                          </Badge>
                        )}
                        {sessionUrgency === 'warning' && (
                          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                            {t("status.expires", {
                              expiry: formatExpiry(providerStatus?.expires_at ?? null),
                            })}
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
                          triggerLabel={t("actions.install")}
                          triggerIcon={<Download className="mr-1.5 size-3.5" />}
                          title={t("actions.installProvider", {
                            provider: formatProvider(p.provider),
                          })}
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
                          {t("actions.configure")}
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
                                {t("actions.stopTunnel")}
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
                        placeholder={t("tokenPlaceholder")}
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
                        {t("actions.save")}
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
    </SettingsGroupCard>
  );
}
