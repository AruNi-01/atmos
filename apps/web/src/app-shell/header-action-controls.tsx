"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Laptop,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Search,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toastManager,
} from "@workspace/ui";
import {
  Command,
  Computer,
  ExternalLink,
  Globe,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import type { ProviderKind, TunnelConnectorStatus } from "@/features/connection/hooks/use-tunnel-connector";
import {
  activateCurrentLocalConnection,
  activateHostedRemoteConnection,
} from "@/features/connection/lib/hosted-connection-actions";
import {
  activeComputerRows,
  isCurrentLocalComputer,
} from "@/features/connection/lib/computer-list";
import {
  loadLocalComputerStatus,
} from "@/features/connection/lib/atmos-computer-local";
import {
  createHostedRemoteSession,
  listHostedRemoteComputers,
} from "@/features/connection/lib/hosted-connection";
import {
  ensureComputerClientSettingsHydrated,
} from "@/features/connection/lib/sync-computer-client-settings";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { AppshotCapturePreview, AppshotsHeaderButton } from "@/features/appshot";
import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";
import { useOpenSettings } from "@/features/settings/lib/open-settings";
import { LocalModelDownloadProgress } from "@/app-shell/LocalModelDownloadProgress";
import { QuotaPopover } from "./QuotaPopover";
import { TunnelItem } from "./header-parts";
import { HeaderWorkspaceSummaryButton } from "./header-workspace-widgets";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { useWorkbenchLocale } from "@/providers/app/workbench-intl-provider";
import { formatComputerSeenAt } from "./header-action-controls-utils";

type DesktopWebStatus = "checking" | "ready" | "unavailable";

type HeaderActionControlsProps = {
  activeTunnelConnectors: TunnelConnectorStatus[];
  browserUrl: string | null;
  desktopWebPopoverOpen: boolean;
  desktopWebStatus: DesktopWebStatus;
  isDesktopRuntime: boolean;
  isOpeningDesktopWeb: boolean;
  isTunnelConnectorRunning: boolean;
  isQuotaPopoverOpen: boolean;
  currentProjectName?: string | null;
  currentWorkspaceDisplayName?: string | null;
  currentWorkspaceName?: string | null;
  headerProjectId?: string | null;
  headerWorkspaceId?: string | null;
  headerContextId: string | null;
  headerEffectivePath?: string | null;
  onCloseAutoFocusPrevent: (event: Event) => void;
  onOpenDesktopWeb: () => Promise<void> | void;
  refreshDesktopWebStatus: () => Promise<unknown> | unknown;
  refreshTunnelConnectorStatus: () => Promise<unknown> | unknown;
  tunnelConnectorDotColor: string;
  renewTunnelConnector: (
    provider: ProviderKind,
    ttlSecs: number,
    reuseToken: boolean,
  ) => Promise<unknown>;
  setDesktopWebPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setGlobalSearchOpen: (open: boolean) => void;
  setIsQuotaPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

type RemoteAccessSettingsSection = "atmos-computer" | "tunnel-connector";

const LOCAL_SWITCH_BUSY_ID = "__local_switch__";

function RemoteAccessPopover({
  activeTunnelConnectors,
  browserUrl,
  desktopWebStatus,
  isOpeningDesktopWeb,
  isTunnelConnectorRunning,
  onOpenDesktopWeb,
  renewTunnelConnector,
  setDesktopWebPopoverOpen,
}: {
  activeTunnelConnectors: TunnelConnectorStatus[];
  browserUrl: string | null;
  desktopWebStatus: DesktopWebStatus;
  isOpeningDesktopWeb: boolean;
  isTunnelConnectorRunning: boolean;
  onOpenDesktopWeb: () => Promise<void> | void;
  renewTunnelConnector: (
    provider: ProviderKind,
    ttlSecs: number,
    reuseToken: boolean,
  ) => Promise<unknown>;
  setDesktopWebPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const t = useTranslations("header");
  const openSettingsPage = useOpenSettings();

  const openSettings = React.useCallback(
    (section: RemoteAccessSettingsSection) => {
      setDesktopWebPopoverOpen(false);
      openSettingsPage(section);
    },
    [openSettingsPage, setDesktopWebPopoverOpen],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-sm font-medium text-popover-foreground">{t("remoteAccess.title")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("remoteAccess.subtitle")}
          </p>
        </div>
        {isTunnelConnectorRunning ? (
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {t("remoteAccess.tunnelActive")}
          </Badge>
        ) : null}
      </div>

      <Tabs defaultValue="computer" className="space-y-3">
        <TabsList className="grid w-full grid-cols-2 border border-border/70 bg-background/70 p-1">
          <TabsTrigger value="computer" className="text-xs">
            {t("remoteAccess.atmosComputerTab")}
          </TabsTrigger>
          <TabsTrigger value="tunnel" className="text-xs">
            {t("remoteAccess.tunnelConnectorTab")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="computer" className="mt-0">
          <AtmosComputerPopoverContent
            onOpenSettings={() => openSettings("atmos-computer")}
            onConnected={() => setDesktopWebPopoverOpen(false)}
          />
        </TabsContent>
        <TabsContent value="tunnel" className="mt-0">
          <TunnelConnectorPopoverContent
            activeTunnelConnectors={activeTunnelConnectors}
            browserUrl={browserUrl}
            desktopWebStatus={desktopWebStatus}
            isOpeningDesktopWeb={isOpeningDesktopWeb}
            isTunnelConnectorRunning={isTunnelConnectorRunning}
            onOpenDesktopWeb={onOpenDesktopWeb}
            onOpenSettings={() => openSettings("tunnel-connector")}
            renewTunnelConnector={renewTunnelConnector}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AtmosComputerPopoverContent({
  onConnected,
  onOpenSettings,
}: {
  onConnected: () => void;
  onOpenSettings: () => void;
}) {
  const t = useTranslations("header");
  const { locale } = useWorkbenchLocale();
  const {
    accessToken,
    computers,
    connectionMode,
    relayUrl,
    localServerId,
    relayWebSocketUrl,
    selectedServerId,
    setComputers,
    setLocalServerId,
  } = useAtmosComputerStore();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasAccessToken = accessToken.trim().length >= 32;
  const activeComputers = React.useMemo(
    () => activeComputerRows(computers),
    [computers],
  );
  const connectedServerId =
    connectionMode === "relay" && relayWebSocketUrl ? selectedServerId : null;

  const refreshComputers = React.useCallback(
    async (token = useAtmosComputerStore.getState().accessToken) => {
      const trimmed = token.trim();
      if (trimmed.length < 32) {
        return;
      }
      setIsRefreshing(true);
      setError(null);
      try {
        const state = useAtmosComputerStore.getState();
        const rows = await listHostedRemoteComputers(state.relayUrl, trimmed);
        setComputers(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("remoteAccess.loadComputersError"));
      } finally {
        setIsRefreshing(false);
      }
    },
    [setComputers, t],
  );

  React.useEffect(() => {
    let cancelled = false;
    void ensureComputerClientSettingsHydrated().then(() => {
      if (cancelled) return;
      void refreshComputers();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshComputers]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isHostedAtmosOrigin()) {
        return;
      }
      const status = await loadLocalComputerStatus(
        useAtmosComputerStore.getState().localServerId,
      ).catch(() => null);
      if (cancelled) {
        return;
      }
      if (status?.server_id) {
        setLocalServerId(status.server_id);
      } else if (status && !status.registered) {
        setLocalServerId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocalServerId]);

  async function connectComputer(serverId: string) {
    setBusyId(serverId);
    setError(null);
    try {
      if (serverId === localServerId) {
        await activateCurrentLocalConnection();
      } else {
        const session = await createHostedRemoteSession(relayUrl, accessToken, serverId);
        await activateHostedRemoteConnection(serverId, session);
      }
      toastManager.add({ title: t("remoteAccess.connectedToastTitle"), type: "success" });
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("remoteAccess.connectErrorMessage"));
      toastManager.add({
        title: t("remoteAccess.connectErrorTitle"),
        description: err instanceof Error ? err.message : t("remoteAccess.connectErrorHint"),
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function switchToLocalComputer() {
    setBusyId(LOCAL_SWITCH_BUSY_ID);
    setError(null);
    try {
      await activateCurrentLocalConnection();
      toastManager.add({ title: t("remoteAccess.connectedToastTitle"), type: "success" });
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("remoteAccess.connectErrorMessage"));
      toastManager.add({
        title: t("remoteAccess.connectErrorTitle"),
        description: err instanceof Error ? err.message : t("remoteAccess.connectErrorHint"),
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (!hasAccessToken) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-4 py-4">
        <p className="text-sm font-medium text-popover-foreground">{t("remoteAccess.accessKeyRequired")}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("remoteAccess.accessKeyRequiredDescription")}
        </p>
        <Button size="sm" className="mt-3 w-full cursor-pointer" onClick={onOpenSettings}>
          {t("remoteAccess.openComputerSettings")}
        </Button>
      </div>
    );
  }

  if (activeComputers.length === 0 && !isRefreshing) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-4 py-4">
        <p className="text-sm font-medium text-popover-foreground">{t("remoteAccess.noComputers")}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("remoteAccess.noComputersDescription")}
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 cursor-pointer" onClick={() => void refreshComputers()}>
            <RotateCcw className="mr-1.5 size-3.5" />
            {t("remoteAccess.refresh")}
          </Button>
          <Button size="sm" className="flex-1 cursor-pointer" onClick={onOpenSettings}>
            {t("remoteAccess.addComputer")}
          </Button>
        </div>
        {error ? <p className="mt-3 text-xs leading-5 text-destructive">{error}</p> : null}
      </div>
    );
  }

  const computerCountLabel = activeComputers.length === 1
    ? t("remoteAccess.computerCountOne", { count: activeComputers.length })
    : t("remoteAccess.computerCountMany", { count: activeComputers.length });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-muted-foreground">
          {computerCountLabel}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={isRefreshing || busyId !== null}
          onClick={() => void refreshComputers()}
          className="h-7 cursor-pointer px-2 text-xs"
        >
          <RotateCcw className={cn("mr-1.5 size-3.5", isRefreshing && "animate-spin-reverse")} />
          {t("remoteAccess.refresh")}
        </Button>
      </div>

      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
        {isRefreshing && activeComputers.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-5 text-sm text-muted-foreground">
            {t("remoteAccess.loading")}
          </div>
        ) : (
          activeComputers.map((computer) => {
            const name = (computer.display_name ?? t("remoteAccess.computerDefaultName")).slice(0, 64);
            const isLocal = isCurrentLocalComputer(computer, localServerId);
            const isUsingLocal = isLocal && connectionMode === "local";
            const isConnected = !isLocal && connectedServerId === computer.server_id;
            const isBusy = busyId === computer.server_id;
            return (
              <div
                key={computer.server_id}
                className="rounded-md border border-border bg-muted/15 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Computer className="size-3.5 shrink-0 text-muted-foreground" />
                      <p className="truncate text-sm font-medium text-popover-foreground">{name}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          computer.online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            computer.online ? "bg-emerald-500" : "bg-muted-foreground/50",
                          )}
                        />
                        {computer.online ? t("remoteAccess.computerOnline") : t("remoteAccess.computerOffline")}
                      </span>
                      {isLocal ? <span>{t("remoteAccess.currentMachine")}</span> : null}
                      {computer.last_seen_at ? (
                        <span>{t("remoteAccess.seen", { value: formatComputerSeenAt(computer.last_seen_at, locale, t) })}</span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isConnected || isUsingLocal ? "secondary" : "default"}
                    disabled={busyId !== null || isConnected || isUsingLocal}
                    onClick={() => void connectComputer(computer.server_id)}
                    className="h-7 shrink-0 cursor-pointer px-2 text-xs"
                  >
                    {isBusy ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : isLocal ? (
                      t("remoteAccess.useLocally")
                    ) : isConnected ? (
                      t("remoteAccess.inUse")
                    ) : (
                      t("remoteAccess.connect")
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error ? <p className="px-1 text-xs leading-5 text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        {connectionMode === "relay" ? (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 cursor-pointer"
            disabled={busyId !== null}
            onClick={() => void switchToLocalComputer()}
          >
            {busyId === LOCAL_SWITCH_BUSY_ID ? (
              <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Laptop className="mr-1.5 size-3.5" />
            )}
            {t("remoteAccess.useLocally")}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className={cn("cursor-pointer", connectionMode === "relay" ? "flex-1" : "w-full")}
          onClick={onOpenSettings}
        >
          {t("remoteAccess.manageComputers")}
        </Button>
      </div>
    </div>
  );
}

function TunnelConnectorPopoverContent({
  activeTunnelConnectors,
  browserUrl,
  desktopWebStatus,
  isOpeningDesktopWeb,
  isTunnelConnectorRunning,
  onOpenDesktopWeb,
  onOpenSettings,
  renewTunnelConnector,
}: {
  activeTunnelConnectors: TunnelConnectorStatus[];
  browserUrl: string | null;
  desktopWebStatus: DesktopWebStatus;
  isOpeningDesktopWeb: boolean;
  isTunnelConnectorRunning: boolean;
  onOpenDesktopWeb: () => Promise<void> | void;
  onOpenSettings: () => void;
  renewTunnelConnector: (
    provider: ProviderKind,
    ttlSecs: number,
    reuseToken: boolean,
  ) => Promise<unknown>;
}) {
  const t = useTranslations("header");

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              desktopWebStatus === "ready"
                ? "bg-success"
                : desktopWebStatus === "checking"
                  ? "bg-warning"
                  : "bg-muted-foreground/50",
            )}
          />
          <p className="text-sm font-medium text-popover-foreground">
            {desktopWebStatus === "ready"
              ? t("remoteAccess.browserReady")
              : t("remoteAccess.browserViaSidecar")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {desktopWebStatus === "ready"
            ? t("remoteAccess.browserReadyDescription")
            : t("remoteAccess.browserViaSidecarDescription")}
        </p>
      </div>

      {browserUrl ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground break-all">
          {browserUrl}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {!isTunnelConnectorRunning && (
          <Button
            variant="outline"
            onClick={onOpenSettings}
            className="cursor-pointer"
          >
            {t("remoteAccess.tunnelConnector")}
          </Button>
        )}
        <Button
          onClick={() => void onOpenDesktopWeb()}
          disabled={isOpeningDesktopWeb}
          className="flex-1 cursor-pointer"
        >
          {isOpeningDesktopWeb
            ? t("remoteAccess.starting")
            : desktopWebStatus === "checking"
              ? t("remoteAccess.checkingWeb")
              : desktopWebStatus === "ready"
                ? t("remoteAccess.openInWeb")
                : t("remoteAccess.retryWeb")}
          <ExternalLink className="size-4" />
        </Button>
      </div>

      {isTunnelConnectorRunning && activeTunnelConnectors.length > 0 && (
        <>
          <div className="border-t border-border" />
          <div className="space-y-2">
            {activeTunnelConnectors.map((tunnel) => (
              <TunnelItem
                key={tunnel.provider}
                status={tunnel}
                onRenew={(ttlSecs, reuseToken) =>
                  tunnel.provider
                    ? renewTunnelConnector(tunnel.provider, ttlSecs, reuseToken).then(() => {})
                    : Promise.resolve()
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function HeaderActionControls({
  activeTunnelConnectors,
  browserUrl,
  desktopWebPopoverOpen,
  desktopWebStatus,
  isDesktopRuntime,
  isOpeningDesktopWeb,
  isTunnelConnectorRunning,
  isQuotaPopoverOpen,
  currentProjectName,
  currentWorkspaceDisplayName,
  currentWorkspaceName,
  headerProjectId,
  headerWorkspaceId,
  headerContextId,
  headerEffectivePath,
  onCloseAutoFocusPrevent,
  onOpenDesktopWeb,
  refreshDesktopWebStatus,
  refreshTunnelConnectorStatus,
  tunnelConnectorDotColor,
  renewTunnelConnector,
  setDesktopWebPopoverOpen,
  setGlobalSearchOpen,
  setIsQuotaPopoverOpen,
}: HeaderActionControlsProps) {
  const t = useTranslations("header");
  const showHeaderSummary = useLayoutSettingsStore((state) => state.showHeaderSummary);
  const showGlobalSearch = useLayoutSettingsStore((state) => state.showHeaderGlobalSearch);
  const showRemoteAccess = useLayoutSettingsStore((state) => state.showHeaderRemoteAccess);
  const showAppshot = useLayoutSettingsStore((state) => state.showHeaderAppshot);
  const loadLayoutSettings = useLayoutSettingsStore((state) => state.loadSettings);

  React.useEffect(() => {
    void loadLayoutSettings();
  }, [loadLayoutSettings]);

  return (
    <div className="relative z-10 flex items-center space-x-3 justify-end">
      {isDesktopRuntime && showAppshot ? <AppshotCapturePreview /> : null}
      <LocalModelDownloadProgress />
      {showGlobalSearch ? (
        <button
          aria-label={t("searchAria")}
          className="desktop-no-drag flex items-center gap-3 px-3 py-1.5 h-8 min-w-[180px] bg-muted/40 hover:bg-muted/60 text-muted-foreground text-[12px] rounded-md border border-transparent hover:border-border cursor-pointer"
          onClick={() => setGlobalSearchOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">{t("searchPlaceholder")}</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
            <Command className="size-3" />
            <span className="text-xs">K</span>
          </kbd>
        </button>
      ) : null}
      {showHeaderSummary ? (
        <HeaderWorkspaceSummaryButton
          contextId={headerContextId}
          currentProjectName={currentProjectName}
          currentWorkspaceDisplayName={currentWorkspaceDisplayName}
          currentWorkspaceName={currentWorkspaceName}
          projectId={headerProjectId}
          workspaceId={headerWorkspaceId}
          effectivePath={headerEffectivePath}
        />
      ) : null}

      <div className="desktop-no-drag flex items-center justify-end gap-2">
        {isDesktopRuntime && showAppshot ? (
          <AppshotsHeaderButton onCloseAutoFocus={onCloseAutoFocusPrevent} />
        ) : null}
        {isDesktopRuntime && showRemoteAccess ? (
          <Popover
            open={desktopWebPopoverOpen}
            onOpenChange={(open) => {
              setDesktopWebPopoverOpen(open);
              if (open) {
                void refreshDesktopWebStatus();
                void refreshTunnelConnectorStatus();
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                aria-label={t("menu.openInWeb")}
                className="relative size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={t("menu.remoteAccess")}
              >
                <Globe className="size-4" />
                {isTunnelConnectorRunning && (
                  <span
                    className={cn(
                      "absolute right-1 top-1 size-2 rounded-full ring-1 ring-background",
                      tunnelConnectorDotColor,
                    )}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[420px] max-w-[calc(100vw-24px)] max-h-[76vh] overflow-y-auto p-3 bg-popover border border-border shadow-md"
            >
              <RemoteAccessPopover
                activeTunnelConnectors={activeTunnelConnectors}
                browserUrl={browserUrl}
                desktopWebStatus={desktopWebStatus}
                isOpeningDesktopWeb={isOpeningDesktopWeb}
                isTunnelConnectorRunning={isTunnelConnectorRunning}
                onOpenDesktopWeb={onOpenDesktopWeb}
                renewTunnelConnector={renewTunnelConnector}
                setDesktopWebPopoverOpen={setDesktopWebPopoverOpen}
              />
            </PopoverContent>
          </Popover>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <QuotaPopover
              open={isQuotaPopoverOpen}
              onOpenChange={setIsQuotaPopoverOpen}
              onPopoverCloseAutoFocus={onCloseAutoFocusPrevent}
            />
          </TooltipTrigger>
          <TooltipContent>
              <div className="flex items-center gap-2">
                <span>{t("menu.quotaUsage")}</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                <Command className="size-3" />
                <span className="text-xs">U</span>
              </kbd>
            </div>
          </TooltipContent>
        </Tooltip>

      </div>
    </div>
  );
}
