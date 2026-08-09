"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Bot,
  Button,
  ChartColumnBig,
  Laptop,
  Maximize,
  Minimize,
  Moon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Search,
  Sun,
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
  Menu,
  MenuItem,
  MenuPanel,
  MenuSeparator,
  MenuShortcut,
  MenuSubmenu,
  MenuSubmenuPanel,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@workspace/ui/components/animate-ui/components/base/menu";
import {
  ArrowBigUp,
  Command,
  Computer,
  ExternalLink,
  Globe,
  LoaderCircle,
  Languages,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Settings,
  SunMoon,
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
import { LocalModelDownloadProgress } from "@/app-shell/LocalModelDownloadProgress";
import { QuotaPopover } from "./QuotaPopover";
import { TunnelItem } from "./header-parts";
import { HeaderWorkspaceSummaryButton } from "./header-workspace-widgets";
import { useLayoutSettingsStore } from "@/features/settings/store/layout-settings-store";
import { useWorkbenchLocale } from "@/providers/app/workbench-intl-provider";
import { formatComputerSeenAt } from "./header-action-controls-utils";

type DesktopWebStatus = "checking" | "ready" | "unavailable";

type HeaderActionControlsProps = {
  actionMenuFocusRef: React.MutableRefObject<HTMLElement | null>;
  activeTunnelConnectors: TunnelConnectorStatus[];
  browserUrl: string | null;
  desktopWebPopoverOpen: boolean;
  desktopWebStatus: DesktopWebStatus;
  isActionMenuOpen: boolean;
  isDesktopRuntime: boolean;
  isFullScreenActive: boolean;
  isOpeningDesktopWeb: boolean;
  isTunnelConnectorRunning: boolean;
  isRightCollapsed: boolean;
  isQuotaPopoverOpen: boolean;
  layout: { opacity: number };
  managementAgentsEnabled: boolean;
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
  resolvedThemeLabel: string;
  setAgentChatOpen: (open: boolean) => void;
  setDesktopWebPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setGlobalSearchOpen: (open: boolean) => void;
  setIsActionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSettingsOpen: (open: boolean) => Promise<URLSearchParams>;
  setIsQuotaPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRemoteAccessSettingsSection: React.Dispatch<React.SetStateAction<"atmos-computer" | "tunnel-connector" | null>>;
  setTheme: (theme: string) => void;
  showRightSidebar: boolean;
  theme?: string;
  toggleFullScreen: () => Promise<void> | void;
  toggleRightSidebar: () => void;
  updateLayout: (layout: { opacity: number }) => void;
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
  setIsSettingsOpen,
  setRemoteAccessSettingsSection,
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
  setIsSettingsOpen: (open: boolean) => Promise<URLSearchParams>;
  setRemoteAccessSettingsSection: React.Dispatch<React.SetStateAction<RemoteAccessSettingsSection | null>>;
}) {
  const t = useTranslations("header");

  const openSettings = React.useCallback(
    (section: RemoteAccessSettingsSection) => {
      setDesktopWebPopoverOpen(false);
      setRemoteAccessSettingsSection(section);
      void setIsSettingsOpen(true);
    },
    [setDesktopWebPopoverOpen, setIsSettingsOpen, setRemoteAccessSettingsSection],
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
  actionMenuFocusRef,
  activeTunnelConnectors,
  browserUrl,
  desktopWebPopoverOpen,
  desktopWebStatus,
  isActionMenuOpen,
  isDesktopRuntime,
  isFullScreenActive,
  isOpeningDesktopWeb,
  isTunnelConnectorRunning,
  isRightCollapsed,
  isQuotaPopoverOpen,
  layout,
  managementAgentsEnabled,
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
  resolvedThemeLabel,
  setAgentChatOpen,
  setDesktopWebPopoverOpen,
  setGlobalSearchOpen,
  setIsActionMenuOpen,
  setIsSettingsOpen,
  setIsQuotaPopoverOpen,
  setRemoteAccessSettingsSection,
  setTheme,
  showRightSidebar,
  theme,
  toggleFullScreen,
  toggleRightSidebar,
  updateLayout,
}: HeaderActionControlsProps) {
  const t = useTranslations("header");
  const router = useRouter();
  const showHeaderSummary = useLayoutSettingsStore((state) => state.showHeaderSummary);
  const showGlobalSearch = useLayoutSettingsStore((state) => state.showHeaderGlobalSearch);
  const showRemoteAccess = useLayoutSettingsStore((state) => state.showHeaderRemoteAccess);
  const showAppshot = useLayoutSettingsStore((state) => state.showHeaderAppshot);
  const loadLayoutSettings = useLayoutSettingsStore((state) => state.loadSettings);
  const { locale, setLocale } = useWorkbenchLocale();
  const currentLocaleLabel = locale === "zh" ? t("localeChinese") : t("localeEnglish");

  const handleLocaleSelect = React.useCallback((nextLocale: string) => {
    if (nextLocale === "en" || nextLocale === "zh") {
      setLocale(nextLocale);
    }
    setIsActionMenuOpen(false);
  }, [setIsActionMenuOpen, setLocale]);

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
          className="desktop-no-drag flex items-center gap-3 px-3 py-1.5 h-8 min-w-[180px] bg-muted/40 hover:bg-muted/60 text-muted-foreground text-[12px] rounded-md border border-transparent hover:border-border transition-colors ease-out duration-200 cursor-pointer"
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
                className="relative size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
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
                setIsSettingsOpen={setIsSettingsOpen}
                setRemoteAccessSettingsSection={setRemoteAccessSettingsSection}
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

        <Menu open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={t("menu.openActions")}
                    className="size-8 flex items-center justify-center rounded-md text-base font-medium tracking-[0.18em] text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="translate-x-[0.08em]">···</span>
                  </button>
                }
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-2">
                <span>{t("menu.label")}</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                  <Command className="size-3" />
                  <ArrowBigUp className="size-3" />
                  <span className="text-xs">M</span>
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
          <MenuPanel finalFocus={actionMenuFocusRef} align="end" sideOffset={8} className="w-56">
            <MenuItem
              closeOnClick
              onClick={() => {
                void setIsSettingsOpen(true);
                setIsActionMenuOpen(false);
              }}
            >
              <Settings className="size-4" />
              {t("menu.settings")}
            </MenuItem>

            <MenuSubmenu>
              <MenuSubmenuTrigger className="[&_[data-slot=chevron]]:ml-2">
                <span className="flex items-center gap-2">
                  <SunMoon className="size-4 text-foreground/90" />
                  <span>{t("menu.theme")}</span>
                </span>
                <span className="ml-auto text-xs tracking-wide text-foreground/90">
                  {resolvedThemeLabel}
                </span>
              </MenuSubmenuTrigger>
              <MenuSubmenuPanel className="w-44">
                <MenuItem
                  closeOnClick
                  onClick={() => {
                    setTheme("light");
                    setIsActionMenuOpen(false);
                  }}
                >
                  <Sun className="size-4" />
                  {t("menu.themeLight")}
                  {theme === "light" ? <MenuShortcut>{t("menu.current")}</MenuShortcut> : null}
                </MenuItem>
                <MenuItem
                  closeOnClick
                  onClick={() => {
                    setTheme("dark");
                    setIsActionMenuOpen(false);
                  }}
                >
                  <Moon className="size-4" />
                  {t("menu.themeDark")}
                  {theme === "dark" ? <MenuShortcut>{t("menu.current")}</MenuShortcut> : null}
                </MenuItem>
                <MenuItem
                  closeOnClick
                  onClick={() => {
                    setTheme("system");
                    setIsActionMenuOpen(false);
                  }}
                >
                  <Laptop className="size-4" />
                  {t("menu.themeSystem")}
                  {theme === "system" ? <MenuShortcut>{t("menu.current")}</MenuShortcut> : null}
                </MenuItem>
              </MenuSubmenuPanel>
            </MenuSubmenu>

            <MenuSubmenu>
              <MenuSubmenuTrigger className="[&_[data-slot=chevron]]:ml-2">
                <span className="flex items-center gap-2">
                  <Languages className="size-4 text-foreground/90" />
                  <span>{t("menu.language")}</span>
                </span>
                <span className="ml-auto text-xs tracking-wide text-foreground/90">{currentLocaleLabel}</span>
              </MenuSubmenuTrigger>
              <MenuSubmenuPanel className="w-44">
                <MenuItem
                  closeOnClick
                  onClick={() => handleLocaleSelect("en")}
                >
                  {t("localeEnglish")}
                  {locale === "en" ? <MenuShortcut>{t("menu.current")}</MenuShortcut> : null}
                </MenuItem>
                <MenuItem
                  closeOnClick
                  onClick={() => handleLocaleSelect("zh")}
                >
                  {t("localeChinese")}
                  {locale === "zh" ? <MenuShortcut>{t("menu.current")}</MenuShortcut> : null}
                </MenuItem>
              </MenuSubmenuPanel>
            </MenuSubmenu>

            {/* Fullscreen control for all shells (web, Electron, and Tauri menu). */}
            <MenuItem
              closeOnClick
              onClick={() => {
                void toggleFullScreen();
                setIsActionMenuOpen(false);
              }}
            >
              {isFullScreenActive ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              {isFullScreenActive ? t("menu.fullScreenExit") : t("menu.fullScreenEnter")}
            </MenuItem>

            <MenuSeparator />

            {managementAgentsEnabled ? (
              <MenuSubmenu>
                <MenuSubmenuTrigger>
                  <span className="flex items-center gap-2">
                    <Bot className="size-4 text-foreground/90" />
                    <span>{t("menu.acpAgent")}</span>
                  </span>
                </MenuSubmenuTrigger>
                <MenuSubmenuPanel className="w-64">
                  <MenuItem
                    closeOnClick
                    onClick={() => {
                      setAgentChatOpen(true);
                      setIsActionMenuOpen(false);
                    }}
                  >
                    {t("menu.openAgentChat")}
                  </MenuItem>

                  <MenuItem closeOnClick={false}>
                    <div className="flex w-full items-center gap-2">
                      <span className="min-w-14 text-sm text-foreground">{t("menu.opacity")}</span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={layout.opacity}
                        onChange={(e) => updateLayout({ opacity: Number(e.target.value) })}
                        aria-label={t("menu.opacity")}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/18 accent-foreground/35"
                      />
                      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                        {layout.opacity}%
                      </span>
                    </div>
                  </MenuItem>
                </MenuSubmenuPanel>
              </MenuSubmenu>
            ) : null}

            <MenuItem
              closeOnClick
              onClick={() => {
                router.push("/token-usage");
                setIsActionMenuOpen(false);
              }}
            >
              <ChartColumnBig className="size-4" />
              {t("menu.tokenUsage")}
            </MenuItem>
          </MenuPanel>
        </Menu>

        <AnimatePresence initial={false}>
          {showRightSidebar ? (
            <motion.div
              key="right-sidebar-toggle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={isRightCollapsed ? t("rightSidebar.expand") : t("rightSidebar.collapse")}
                    onClick={toggleRightSidebar}
                    className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                  >
                    {isRightCollapsed ? (
                      <PanelRightOpen className="size-4" />
                    ) : (
                      <PanelRightClose className="size-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-2">
                    <span>{isRightCollapsed ? t("rightSidebar.expandLabel") : t("rightSidebar.collapseLabel")}</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                      <Command className="size-3" />
                      <ArrowBigUp className="size-3" />
                      <span className="text-xs">B</span>
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
