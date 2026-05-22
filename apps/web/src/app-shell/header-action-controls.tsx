"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
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
  ExternalLink,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  SunMoon,
} from "lucide-react";

import type { ProviderKind, RemoteAccessStatus } from "@/features/connection/hooks/use-remote-access";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";
import { LocalModelDownloadProgress } from "@/app-shell/LocalModelDownloadProgress";
import { UsagePopover } from "./UsagePopover";
import { TunnelItem } from "./header-parts";

type DesktopWebStatus = "checking" | "ready" | "unavailable";

type HeaderActionControlsProps = {
  actionMenuFocusRef: React.MutableRefObject<HTMLElement | null>;
  activeRemoteTunnels: RemoteAccessStatus[];
  browserUrl: string | null;
  desktopWebPopoverOpen: boolean;
  desktopWebStatus: DesktopWebStatus;
  isActionMenuOpen: boolean;
  isDesktopRuntime: boolean;
  isFullScreenActive: boolean;
  isOpeningDesktopWeb: boolean;
  isRemoteAccessRunning: boolean;
  isRightCollapsed: boolean;
  isUsagePopoverOpen: boolean;
  layout: { opacity: number };
  managementAgentsEnabled: boolean;
  onCloseAutoFocusPrevent: (event: Event) => void;
  onOpenDesktopWeb: () => Promise<void> | void;
  refreshDesktopWebStatus: () => Promise<unknown> | unknown;
  refreshRemoteAccessStatus: () => Promise<unknown> | unknown;
  remoteAccessDotColor: string;
  renewRemoteAccess: (
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
  setRemoteAccessSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTheme: (theme: string) => void;
  showRightSidebar: boolean;
  theme?: string;
  toggleFullScreen: () => Promise<void> | void;
  toggleRightSidebar: () => void;
  updateLayout: (layout: { opacity: number }) => void;
};

export function HeaderActionControls({
  actionMenuFocusRef,
  activeRemoteTunnels,
  browserUrl,
  desktopWebPopoverOpen,
  desktopWebStatus,
  isActionMenuOpen,
  isDesktopRuntime,
  isFullScreenActive,
  isOpeningDesktopWeb,
  isRemoteAccessRunning,
  isRightCollapsed,
  isUsagePopoverOpen,
  layout,
  managementAgentsEnabled,
  onCloseAutoFocusPrevent,
  onOpenDesktopWeb,
  refreshDesktopWebStatus,
  refreshRemoteAccessStatus,
  remoteAccessDotColor,
  renewRemoteAccess,
  resolvedThemeLabel,
  setAgentChatOpen,
  setDesktopWebPopoverOpen,
  setGlobalSearchOpen,
  setIsActionMenuOpen,
  setIsSettingsOpen,
  setIsTokenUsageOpen,
  setIsUsagePopoverOpen,
  setRemoteAccessSettingsOpen,
  setTheme,
  showRightSidebar,
  theme,
  toggleFullScreen,
  toggleRightSidebar,
  updateLayout,
}: HeaderActionControlsProps) {
  return (
    <div className="relative z-10 flex items-center space-x-3 justify-end">
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
          <Popover
            open={desktopWebPopoverOpen}
            onOpenChange={(open) => {
              setDesktopWebPopoverOpen(open);
              if (open) {
                void refreshDesktopWebStatus();
                void refreshRemoteAccessStatus();
              }
            }}
          >
            <PopoverTrigger asChild>
              <button
                aria-label="Open in Web"
                className="relative size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                title={
                  isRemoteAccessRunning
                    ? "Tunnel active"
                    : desktopWebStatus === "ready"
                      ? "Open in Web"
                      : "Start Web"
                }
              >
                <Globe className="size-4" />
                {isRemoteAccessRunning && (
                  <span
                    className={cn(
                      "absolute right-1 top-1 size-2 rounded-full ring-1 ring-background",
                      remoteAccessDotColor,
                    )}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-80 max-h-[70vh] overflow-y-auto p-3 bg-popover border border-border shadow-md"
            >
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
                        ? "Web access is ready"
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
                  {!isRemoteAccessRunning && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDesktopWebPopoverOpen(false);
                        setRemoteAccessSettingsOpen(true);
                        void setIsSettingsOpen(true);
                      }}
                      className="cursor-pointer"
                    >
                      Remote Access
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

                {isRemoteAccessRunning && activeRemoteTunnels.length > 0 && (
                  <>
                    <div className="border-t border-border" />
                    <div className="space-y-2">
                      {activeRemoteTunnels.map((tunnel) => (
                        <TunnelItem
                          key={tunnel.provider}
                          status={tunnel}
                          onRenew={(ttlSecs, reuseToken) =>
                            tunnel.provider
                              ? renewRemoteAccess(tunnel.provider, ttlSecs, reuseToken).then(() => {})
                              : Promise.resolve()
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
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
