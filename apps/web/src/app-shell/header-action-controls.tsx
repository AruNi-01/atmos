"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
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
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Settings,
  SunMoon,
} from "lucide-react";

import type { ProviderKind, TunnelConnectorStatus } from "@/features/connection/hooks/use-tunnel-connector";
import {
  activateCurrentLocalConnection,
  activateHostedRemoteConnection,
} from "@/features/connection/lib/hosted-connection-actions";
import {
  createHostedRemoteSession,
  listHostedRemoteComputers,
} from "@/features/connection/lib/hosted-connection";
import {
  ensureComputerClientSettingsHydrated,
} from "@/features/connection/lib/sync-computer-client-settings";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { AppshotCapturePreview, AppshotsHeaderButton } from "@/features/appshot";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { LocalModelDownloadProgress } from "@/app-shell/LocalModelDownloadProgress";
import { UsagePopover } from "./UsagePopover";
import { TunnelItem } from "./header-parts";

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
  isUsagePopoverOpen: boolean;
  layout: { opacity: number };
  managementAgentsEnabled: boolean;
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
  setIsTokenUsageOpen: (open: boolean) => Promise<URLSearchParams>;
  setIsUsagePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRemoteAccessSettingsSection: React.Dispatch<React.SetStateAction<"atmos-computer" | "tunnel-connector" | null>>;
  setTheme: (theme: string) => void;
  showRightSidebar: boolean;
  theme?: string;
  toggleFullScreen: () => Promise<void> | void;
  toggleRightSidebar: () => void;
  updateLayout: (layout: { opacity: number }) => void;
};

type RemoteAccessSettingsSection = "atmos-computer" | "tunnel-connector";

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
          <p className="text-sm font-medium text-popover-foreground">Remote Access</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Switch computers or publish this one through a tunnel.
          </p>
        </div>
        {isTunnelConnectorRunning ? (
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Tunnel active
          </Badge>
        ) : null}
      </div>

      <Tabs defaultValue="computer" className="space-y-3">
        <TabsList className="grid w-full grid-cols-2 border border-border/70 bg-background/70 p-1">
          <TabsTrigger value="computer" className="text-xs">
            Atmos Computer
          </TabsTrigger>
          <TabsTrigger value="tunnel" className="text-xs">
            Tunnel Connector
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
  const {
    accessToken,
    computers,
    connectionMode,
    controlPlaneUrl,
    localServerId,
    relayWebSocketUrl,
    selectedServerId,
    setComputers,
  } = useAtmosComputerStore();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasAccessToken = accessToken.trim().length >= 32;
  const activeComputers = React.useMemo(
    () => computers.filter((computer) => !computer.revoked),
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
        const rows = await listHostedRemoteComputers(state.controlPlaneUrl, trimmed);
        setComputers(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load computers.");
      } finally {
        setIsRefreshing(false);
      }
    },
    [setComputers],
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

  async function connectComputer(serverId: string) {
    setBusyId(serverId);
    setError(null);
    try {
      if (serverId === localServerId) {
        await activateCurrentLocalConnection();
      } else {
        const session = await createHostedRemoteSession(controlPlaneUrl, accessToken, serverId);
        await activateHostedRemoteConnection(serverId, session);
      }
      toastManager.add({ title: "Connected", type: "success" });
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect.");
      toastManager.add({
        title: "Could not connect",
        description: err instanceof Error ? err.message : "Try again.",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (!hasAccessToken) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-4 py-4">
        <p className="text-sm font-medium text-popover-foreground">Access key required</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Save an Atmos Computer access key before switching computers from the header.
        </p>
        <Button size="sm" className="mt-3 w-full cursor-pointer" onClick={onOpenSettings}>
          Open Computer Settings
        </Button>
      </div>
    );
  }

  if (activeComputers.length === 0 && !isRefreshing) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-4 py-4">
        <p className="text-sm font-medium text-popover-foreground">No computers yet</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Register this computer or add another machine with the same access key.
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 cursor-pointer" onClick={() => void refreshComputers()}>
            <RotateCw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
          <Button size="sm" className="flex-1 cursor-pointer" onClick={onOpenSettings}>
            Add Computer
          </Button>
        </div>
        {error ? <p className="mt-3 text-xs leading-5 text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs text-muted-foreground">
          {activeComputers.length} computer{activeComputers.length === 1 ? "" : "s"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={isRefreshing || busyId !== null}
          onClick={() => void refreshComputers()}
          className="h-7 cursor-pointer px-2 text-xs"
        >
          <RotateCw className={cn("mr-1.5 size-3.5", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
        {isRefreshing && activeComputers.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-5 text-sm text-muted-foreground">
            Loading computers…
          </div>
        ) : (
          activeComputers.map((computer) => {
            const name = (computer.display_name ?? "Computer").slice(0, 64);
            const isLocal = computer.server_id === localServerId;
            const isConnected = connectedServerId === computer.server_id || (isLocal && connectionMode === "local");
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
                        {computer.online ? "Online" : "Offline"}
                      </span>
                      {isLocal ? <span>Current machine</span> : null}
                      {computer.last_seen_at ? <span>Seen {formatComputerSeenAt(computer.last_seen_at)}</span> : null}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isConnected ? "secondary" : "default"}
                    disabled={busyId !== null || isConnected}
                    onClick={() => void connectComputer(computer.server_id)}
                    className="h-7 shrink-0 cursor-pointer px-2 text-xs"
                  >
                    {isBusy ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : isConnected ? (
                      "In use"
                    ) : isLocal ? (
                      "Use locally"
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error ? <p className="px-1 text-xs leading-5 text-destructive">{error}</p> : null}
      <Button variant="outline" size="sm" className="w-full cursor-pointer" onClick={onOpenSettings}>
        Manage Computers
      </Button>
    </div>
  );
}

function formatComputerSeenAt(value: number): string {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
              ? "Browser access is ready"
              : "Browser access via sidecar"}
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {desktopWebStatus === "ready"
            ? "Open the current page in your browser using the desktop sidecar URL, with the same API port to avoid cross-origin mismatches."
            : "Use the local sidecar URL in your browser. Once the sidecar finishes warming up, the same page will open there."}
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
            Tunnel Connector
          </Button>
        )}
        <Button
          onClick={() => void onOpenDesktopWeb()}
          disabled={isOpeningDesktopWeb}
          className="flex-1 cursor-pointer"
        >
          {isOpeningDesktopWeb
            ? "Starting..."
            : desktopWebStatus === "ready"
              ? "Open In Web"
              : "Start Web"}
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
  isUsagePopoverOpen,
  layout,
  managementAgentsEnabled,
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
  setIsTokenUsageOpen,
  setIsUsagePopoverOpen,
  setRemoteAccessSettingsSection,
  setTheme,
  showRightSidebar,
  theme,
  toggleFullScreen,
  toggleRightSidebar,
  updateLayout,
}: HeaderActionControlsProps) {
  return (
    <div className="relative z-10 flex items-center space-x-3 justify-end">
      {isDesktopRuntime ? <AppshotCapturePreview /> : null}
      <LocalModelDownloadProgress />
      <button
        aria-label="Search"
        className="desktop-no-drag flex items-center gap-3 px-3 py-1.5 h-8 min-w-[180px] bg-muted/40 hover:bg-muted/60 text-muted-foreground text-[12px] rounded-md border border-transparent hover:border-border transition-colors ease-out duration-200 cursor-pointer"
        onClick={() => setGlobalSearchOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
          <Command className="size-3" />
          <span className="text-xs">K</span>
        </kbd>
      </button>

      <div className="desktop-no-drag flex items-center justify-end gap-2">
        {isDesktopRuntime ? (
          <>
            <AppshotsHeaderButton onCloseAutoFocus={onCloseAutoFocusPrevent} />
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
                  aria-label="Open in Web"
                  className="relative size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                  title="Remote Access"
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
          </>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <UsagePopover
              open={isUsagePopoverOpen}
              onOpenChange={setIsUsagePopoverOpen}
              onPopoverCloseAutoFocus={onCloseAutoFocusPrevent}
            />
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex items-center gap-2">
              <span>AI Usage</span>
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
                    aria-label="Open actions menu"
                    className="size-8 flex items-center justify-center rounded-md text-base font-medium tracking-[0.18em] text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="translate-x-[0.08em]">···</span>
                  </button>
                }
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-2">
                <span>Menu</span>
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
              Settings
            </MenuItem>

            <MenuSubmenu>
              <MenuSubmenuTrigger className="[&_[data-slot=chevron]]:ml-2">
                <span className="flex items-center gap-2">
                  <SunMoon className="size-4 text-foreground/90" />
                  <span>Theme</span>
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
                  Light
                  {theme === "light" ? <MenuShortcut>Current</MenuShortcut> : null}
                </MenuItem>
                <MenuItem
                  closeOnClick
                  onClick={() => {
                    setTheme("dark");
                    setIsActionMenuOpen(false);
                  }}
                >
                  <Moon className="size-4" />
                  Dark
                  {theme === "dark" ? <MenuShortcut>Current</MenuShortcut> : null}
                </MenuItem>
                <MenuItem
                  closeOnClick
                  onClick={() => {
                    setTheme("system");
                    setIsActionMenuOpen(false);
                  }}
                >
                  <Laptop className="size-4" />
                  System
                  {theme === "system" ? <MenuShortcut>Current</MenuShortcut> : null}
                </MenuItem>
              </MenuSubmenuPanel>
            </MenuSubmenu>

            {!isTauriRuntime() ? (
              <MenuItem
                closeOnClick
                onClick={() => {
                  void toggleFullScreen();
                  setIsActionMenuOpen(false);
                }}
              >
                {isFullScreenActive ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                {isFullScreenActive ? "Exit Full Screen" : "Enter Full Screen"}
              </MenuItem>
            ) : null}

            <MenuSeparator />

            {managementAgentsEnabled ? (
              <MenuSubmenu>
                <MenuSubmenuTrigger>
                  <span className="flex items-center gap-2">
                    <Bot className="size-4 text-foreground/90" />
                    <span>ACP Agent</span>
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
                    Open Agent Chat
                  </MenuItem>

                  <MenuItem closeOnClick={false}>
                    <div className="flex w-full items-center gap-2">
                      <span className="min-w-14 text-sm text-foreground">Opacity</span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        value={layout.opacity}
                        onChange={(e) => updateLayout({ opacity: Number(e.target.value) })}
                        aria-label="Agent chat panel opacity"
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
                void setIsTokenUsageOpen(true);
                setIsActionMenuOpen(false);
              }}
            >
              <ChartColumnBig className="size-4" />
              Token Usage
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
                    aria-label={isRightCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
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
                    <span>{isRightCollapsed ? "Expand Right Sidebar" : "Collapse Right Sidebar"}</span>
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
