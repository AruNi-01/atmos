"use client";
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
} from '@workspace/ui';
import { cn } from "@/shared/lib/utils";
import { agentHooksApi } from '@/api/rest-api';
import { useWebSocketStore } from '@/features/connection/hooks/use-websocket';

import { buildUsageCarouselItems } from '@/features/quota-usage/lib/quota-display';
import { useQuotaOverviewQuery } from '@/features/quota-usage/hooks/use-quota-overview-query';
import {
  useAgentHooksStore,
  type AgentHookSession,
  AGENT_STATE,
  AGENT_TOOL_LABELS,
  AGENT_TOOL_ICON_IDS,
} from '@/features/agent/store/agent-hooks-store';
import { useAgentAttentionStore } from '@/features/agent/store/agent-attention-store';
import { useAgentAttentionSummaryStore } from '@/features/agent/store/agent-attention-summary-store';
import { useWorkspaceAgentGroupingHoldStore } from '@/features/agent/store/workspace-agent-grouping-hold';
import { useShallow } from 'zustand/react/shallow';
import { AgentHookStatusIndicator } from '@/features/agent/components/AgentHookStatusIndicator';
import { AgentIcon } from '@/features/agent/components/AgentIcon';
import { AnimatePresence, motion } from 'motion/react';
import { useProjects } from '@/features/project/hooks/use-project-bootstrap-query';
import { LayoutDashboard, X } from 'lucide-react';
import { ProviderGlyph } from '@/app-shell/QuotaPopover';
import { BotMessageSquareIcon, type BotMessageSquareHandle } from '@workspace/ui';
import { NappingBotIcon } from '@/app-shell/NappingBotIcon';
import { useExperimentSettingsStore } from '@/features/settings/store/experiment-settings-store';
import { useLayoutSettingsStore } from '@/features/settings/store/layout-settings-store';
import { useAgentTitleSettingsStore } from '@/features/settings/store/agent-title-settings-store';
import { useAppRouter } from '@/shared/hooks/use-app-router';
import { LocalServicesFooterItem } from '@/features/local-services/components/LocalServicesFooterItem';
import { ResourceMonitorFooterItem } from '@/features/resource-monitor/components/ResourceMonitorFooterItem';
import { effectiveShowResourceMonitor as resolveEffectiveShowResourceMonitor } from '@/features/resource-monitor/lib/resource-monitor-footer-visibility';
import {
  isAgentHookSideChatSession,
  navigateToAgentHookSessionPane,
  resolveAgentHookContextNames,
} from '@/features/agent/lib/agent-hook-navigation';
import {
  buildFooterAgentOverview,
  FOOTER_AGENT_OVERVIEW_ORDER,
  footerAgentOverviewTotal,
  footerSessionIdentityKeys,
  groupFooterOverviewRowsByContext,
  type FooterAgentOverviewBucket,
  type FooterAgentOverviewRow,
} from '@/features/agent/lib/footer-agent-overview';
import {
  findTerminalPaneByStableAgentPaneId,
  uniquePaneTitleForAgentStatus,
} from '@/features/agent/lib/agent-hook-pane-title';
import { resolvePaneToolbarTitle } from '@/features/terminal/lib/terminal-center-tab-presentation';
import { useContestedCliOwners } from '@/features/terminal/hooks/use-contested-cli-owners';
import { useTerminalStore } from '@/features/terminal/store/use-terminal-store';
import { getWorkspaceAgentGroupMeta } from '@/app-shell/sidebar/workspace-status';
import { useTranslations } from 'next-intl';
import { APP_FOOTER_HEIGHT_CLASS } from '@/app-shell/sidebar-layout-constants';

function groupSessionsByContext(
  rows: FooterAgentOverviewRow[],
): Map<string, FooterAgentOverviewRow[]> {
  return groupFooterOverviewRowsByContext(rows);
}

function footerOverviewBadgeClass(bucket: FooterAgentOverviewBucket): string {
  if (bucket === "running") return "text-blue-400 bg-blue-500/10";
  if (bucket === "attention") return "text-emerald-500 bg-emerald-500/10";
  if (bucket === "permission") return "text-amber-500 bg-amber-500/10";
  return "text-emerald-500";
}

function footerOverviewBucketLabel(
  t: (key: "footer.overviewRunning" | "footer.overviewIdle" | "footer.overviewNeedAttention" | "footer.overviewNeedPermission") => string,
  bucket: FooterAgentOverviewBucket,
): string {
  if (bucket === "running") return t("footer.overviewRunning");
  if (bucket === "idle") return t("footer.overviewIdle");
  if (bucket === "attention") return t("footer.overviewNeedAttention");
  return t("footer.overviewNeedPermission");
}

function FooterOverviewBucketIcon({
  bucket,
}: {
  bucket: FooterAgentOverviewBucket;
}) {
  if (bucket === "running") {
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center">
        <AgentHookStatusIndicator
          state={AGENT_STATE.RUNNING}
          variant="compact"
          placement="footer"
        />
      </span>
    );
  }
  const meta = getWorkspaceAgentGroupMeta(bucket === "idle" ? "done" : bucket);
  const Icon = meta.icon;
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center">
      <Icon className={cn("size-3.5", meta.className)} />
    </span>
  );
}

function markFooterSessionIdle(session: AgentHookSession) {
  const keys = footerSessionIdentityKeys(session);
  const hooks = useAgentHooksStore.getState();
  const live = hooks.sessions.get(session.session_id);
  if (live && live.state !== AGENT_STATE.IDLE) {
    void hooks.forceSessionIdle(session.session_id);
  }
  if (keys.length > 0) {
    const summaries = useAgentAttentionSummaryStore.getState();
    useAgentAttentionStore.getState().clearMatchingSessionIds(keys);
    for (const key of keys) summaries.clearPane(key);
    void agentHooksApi
      .clearAttention({ stablePaneIds: keys, dismissSummary: true })
      .catch((error) => {
        console.warn("[Footer] Failed to clear attention after mark idle:", error);
      });
  }
  const contextId = session.context_id?.trim();
  if (contextId) {
    useWorkspaceAgentGroupingHoldStore.getState().clearHold(contextId);
  }
}

function SessionStateBadge({
  bucket,
  label,
  idleLabel,
  clearLabel,
  hoverAction,
  onAction,
}: {
  bucket: FooterAgentOverviewBucket;
  label: string;
  idleLabel: string;
  clearLabel: string;
  hoverAction: "idle" | "clear" | null;
  onAction: () => void;
}) {
  const springTransition = { type: "spring" as const, stiffness: 500, damping: 30 };

  return (
    <div className="relative h-5 min-w-[7.25rem] shrink-0 overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        {hoverAction === "idle" ? (
          <motion.button
            key="reset-idle"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={springTransition}
            className="absolute inset-0 flex cursor-pointer items-center justify-center rounded px-1.5 py-px font-mono text-[9px] text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"
            onClick={(e) => { e.stopPropagation(); onAction(); }}
          >
            {idleLabel}
          </motion.button>
        ) : hoverAction === "clear" ? (
          <motion.button
            key="clear"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={springTransition}
            className="absolute inset-0 flex cursor-pointer items-center justify-center rounded px-1.5 py-px font-mono text-[9px] text-red-400 bg-red-500/10 hover:bg-red-500/20"
            onClick={(e) => { e.stopPropagation(); onAction(); }}
          >
            {clearLabel}
          </motion.button>
        ) : (
          <motion.span
            key={bucket}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={springTransition}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded px-1.5 py-px font-mono text-[9px]",
              footerOverviewBadgeClass(bucket),
            )}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function SessionRow({
  session,
  bucket,
  onNavigate,
  onCanvas = false,
  paneTitle,
}: {
  session: AgentHookSession;
  bucket: FooterAgentOverviewBucket;
  onNavigate: () => void;
  onCanvas?: boolean;
  paneTitle?: string | null;
}) {
  const t = useTranslations("appShell");
  const [hovered, setHovered] = React.useState(false);
  const removeSession = useAgentHooksStore((s) => s.removeSession);
  const isIdle = bucket === "idle";

  const hoverAction = !hovered ? null : isIdle ? "clear" as const : "idle" as const;
  const handleAction = () => {
    if (isIdle) {
      void removeSession(session.session_id);
    } else {
      markFooterSessionIdle(session);
    }
  };

  const title = paneTitle?.trim();

  return (
    <div
      className="flex items-center justify-between gap-2 px-1 py-0.5 rounded-sm hover:bg-accent/50 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onNavigate}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <FooterOverviewBucketIcon bucket={bucket} />
        <AgentIcon
          registryId={AGENT_TOOL_ICON_IDS[session.tool] ?? session.tool}
          name={AGENT_TOOL_LABELS[session.tool] ?? session.tool}
          size={11}
          className="shrink-0"
        />
        {title ? (
          <span className="min-w-0 truncate text-[10px] text-muted-foreground" title={title}>
            {title}
          </span>
        ) : null}
        {isAgentHookSideChatSession(session) ? (
          <span className="shrink-0 rounded-sm bg-cyan-500/15 px-1 text-[9px] font-medium text-cyan-700 dark:text-cyan-300">
            {t("footer.sideChat")}
          </span>
        ) : null}
        {onCanvas && (
          <span title={t("footer.openOnCanvasLabel")} className="inline-flex shrink-0 text-sky-500">
            <LayoutDashboard className="size-3" />
          </span>
        )}
      </div>
      <SessionStateBadge
        bucket={bucket}
        label={footerOverviewBucketLabel(t, bucket)}
        idleLabel={t("footer.overviewIdle")}
        clearLabel={t("footer.clearSession")}
        hoverAction={hoverAction}
        onAction={handleAction}
      />
    </div>
  );
}

function useContextDisplayNameResolver() {
  const projects = useProjects();
  const t = useTranslations("appShell");
  return useCallback((contextKey: string): string => {
    if (contextKey === "unknown") return t("footer.unknownProject");
    for (const project of projects) {
      if (project.id === contextKey) return project.name;
      for (const ws of project.workspaces) {
        if (ws.id === contextKey) return `${project.name} / ${ws.branch}`;
      }
    }
    if (contextKey.includes("/") || contextKey.includes("\\")) {
      return contextKey.split(/[\\/]/).slice(-2).join("/");
    }
    return contextKey.slice(0, 8);
  }, [projects, t]);
}

function useContextNameResolver() {
  const projects = useProjects();
  return useCallback(
    (contextId: string | null | undefined) =>
      resolveAgentHookContextNames(contextId, null, projects),
    [projects],
  );
}

function useFooterAgentOverview() {
  const sessionsMap = useAgentHooksStore(useShallow((s) => s.sessions));
  const attentionPanes = useAgentAttentionStore(useShallow((s) => s.panes));
  return useMemo(
    () => buildFooterAgentOverview(sessionsMap.values(), attentionPanes.values()),
    [sessionsMap, attentionPanes],
  );
}

function useAgentHookSessionPaneTitles(
  sessions: AgentHookSession[],
): Readonly<Record<string, string>> {
  const showAgentName = useAgentTitleSettingsStore((s) => s.showAgentNameInTerminalTitles);
  const contestedOwners = useContestedCliOwners();
  const workspacePanes = useTerminalStore((s) => s.workspacePanes);
  const projectWikiPanes = useTerminalStore((s) => s.projectWikiPanes);
  const codeReviewPanes = useTerminalStore((s) => s.codeReviewPanes);

  return useMemo(() => {
    const out: Record<string, string> = {};
    const state = { workspacePanes, projectWikiPanes, codeReviewPanes };
    for (const session of sessions) {
      const paneId = session.pane_id?.trim() || session.session_id;
      const pane = findTerminalPaneByStableAgentPaneId(state, paneId);
      if (!pane) continue;
      const resolved = resolvePaneToolbarTitle(pane, { contestedOwners, showAgentName });
      const suffix = uniquePaneTitleForAgentStatus(
        resolved.displayTitle,
        AGENT_TOOL_LABELS[session.tool] ?? session.tool,
      );
      if (suffix) out[session.session_id] = suffix;
    }
    return out;
  }, [
    sessions,
    workspacePanes,
    projectWikiPanes,
    codeReviewPanes,
    showAgentName,
    contestedOwners,
  ]);
}

export function AgentStatusPopoverContent({
  embedded = false,
  onNavigateSession,
  isSessionOnCanvas,
}: {
  embedded?: boolean;
  onNavigateSession?: (session: AgentHookSession) => void;
  isSessionOnCanvas?: (session: AgentHookSession) => boolean;
} = {}) {
  const t = useTranslations("appShell");
  const { rows } = useFooterAgentOverview();
  const clearIdleSessions = useAgentHooksStore((s) => s.clearIdleSessions);
  const router = useAppRouter();
  const projects = useProjects();

  const sessions = useMemo(() => rows.map((row) => row.session), [rows]);
  const grouped = useMemo(() => groupSessionsByContext(rows), [rows]);
  const paneTitles = useAgentHookSessionPaneTitles(sessions);
  const hasIdleSessions = rows.some((row) => row.bucket === "idle");
  const resolveContextDisplayName = useContextDisplayNameResolver();
  const resolveContextName = useContextNameResolver();

  const navigateToSessionPane = useCallback((session: AgentHookSession) => {
    if (onNavigateSession) {
      onNavigateSession(session);
      return;
    }
    navigateToAgentHookSessionPane(session, router, projects);
  }, [onNavigateSession, router, projects]);

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "p-3 text-[11px] text-muted-foreground",
          embedded && "flex h-full items-center justify-center text-center",
        )}
      >
        {t("footer.noActiveAgentSessions")}
      </div>
    );
  }

  return (
      <div className={cn("p-2 overflow-y-auto", embedded ? "h-full" : "max-h-64")}>
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] font-semibold text-foreground">
          {t("footer.agentSessions", { count: rows.length })}
        </span>
        {hasIdleSessions && (
          <Button
            variant="ghost"
            size="sm"
          className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => clearIdleSessions()}
        >
          <X className="size-3 mr-0.5" />
          {t("footer.clearIdle")}
        </Button>
      )}
    </div>

      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([contextKey, pathRows]) => {
          const displayName = resolveContextDisplayName(contextKey);
          const { projectName, workspaceName, workspaceDisplayName } = resolveContextName(contextKey);
          const contextLabel = projectName
            ? [projectName, workspaceDisplayName ?? workspaceName].filter(Boolean).join(" / ")
            : displayName;
          return (
            <div key={contextKey} className="space-y-0.5">
              <div
                className="px-1 text-[10px] font-medium text-muted-foreground truncate"
                title={contextKey}
              >
                {contextLabel}
              </div>
              {pathRows.map((row) => (
                <SessionRow
                  key={row.session.session_id}
                  session={row.session}
                  bucket={row.bucket}
                  paneTitle={paneTitles[row.session.session_id]}
                  onCanvas={isSessionOnCanvas?.(row.session) ?? false}
                  onNavigate={() => navigateToSessionPane(row.session)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AcpChatButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("appShell");
  const iconRef = useRef<BotMessageSquareHandle>(null);
  return (
    <button
      type="button"
      aria-label={t("footer.openAgentChat")}
      className="inline-flex h-5 items-center gap-1 rounded-sm bg-transparent px-1 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      onClick={onClick}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    >
      <BotMessageSquareIcon ref={iconRef} size={12} />
      <span className="whitespace-nowrap">{t("footer.acpChat")}</span>
    </button>
  );
}

function HoverScrollText({ text, active }: { text: string; active: boolean }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScroll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    const el = textRef.current;
    if (el) el.scrollLeft = 0;
  }, []);

  const startScroll = useCallback(() => {
    const el = textRef.current;
    if (!el) return;

    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 0) return;

    stopScroll();
    timeoutRef.current = setTimeout(() => {
      const duration = overflow * 40;
      const startTime = performance.now();

      const step = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        el.scrollLeft = overflow * progress;
        if (progress < 1) {
          animRef.current = requestAnimationFrame(step);
        }
      };

      animRef.current = requestAnimationFrame(step);
    }, 400);
  }, [stopScroll]);

  useEffect(() => {
    stopScroll();
    return stopScroll;
  }, [text, stopScroll]);

  useEffect(() => {
    if (active) {
      startScroll();
      return;
    }
    stopScroll();
  }, [active, startScroll, stopScroll]);

  return (
    <span
      ref={textRef}
      className="block overflow-hidden whitespace-nowrap font-medium text-muted-foreground"
      title={text}
    >
      {text}
    </span>
  );
}

function AgentStatusOverviewTrigger() {
  const t = useTranslations("appShell");
  const { counts } = useFooterAgentOverview();
  const total = footerAgentOverviewTotal(counts);

  if (total === 0) {
    return (
      <span className="text-muted-foreground whitespace-nowrap inline-flex items-center gap-1.5">
        <NappingBotIcon />
        <span>{t("footer.napping")}</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {FOOTER_AGENT_OVERVIEW_ORDER.map((bucket) => {
        const count = counts[bucket];
        if (count <= 0) return null;
        const label = footerOverviewBucketLabel(t, bucket);
        return (
          <span
            key={bucket}
            className="inline-flex items-center gap-0.5 whitespace-nowrap text-foreground"
            title={`${count} ${label}`}
            aria-label={`${count} ${label}`}
          >
            <FooterOverviewBucketIcon bucket={bucket} />
            <span className="tabular-nums">{count}</span>
          </span>
        );
      })}
    </span>
  );
}

const Footer: React.FC = () => {
  const t = useTranslations("appShell");
  const router = useAppRouter();
  const connectionState = useWebSocketStore(s => s.connectionState);
  const launchpadAgentsEnabled = useExperimentSettingsStore((s) => s.launchpadAgentsEnabled);
  const loadExperimentSettings = useExperimentSettingsStore((s) => s.loadSettings);
  const showLocalServices = useLayoutSettingsStore((s) => s.showLocalServices);
  const layoutLoaded = useLayoutSettingsStore((s) => s.loaded);
  const showResourceMonitor = useLayoutSettingsStore((s) => s.showResourceMonitor);
  const effectiveShowResourceMonitor = resolveEffectiveShowResourceMonitor(
    layoutLoaded,
    showResourceMonitor,
  );
  const showUsageCarousel = useLayoutSettingsStore((s) => s.showUsageCarousel);
  const showAgentStatus = useLayoutSettingsStore((s) => s.showAgentStatus);
  const loadLayoutSettings = useLayoutSettingsStore((s) => s.loadSettings);
  const usageQuery = useQuotaOverviewQuery({
    enabled: connectionState === 'connected' && showUsageCarousel,
  });
  const quotaOverview = usageQuery.data ?? null;
  const [usageIndex, setUsageIndex] = useState(0);
  const [isUsageCarouselHovered, setIsUsageCarouselHovered] = useState(false);

  const usageCarouselItems = useMemo(
    () => buildUsageCarouselItems(quotaOverview),
    [quotaOverview]
  );
  const usageCarouselItem = usageCarouselItems.length > 0
    ? usageCarouselItems[usageIndex % usageCarouselItems.length]
    : null;

  useEffect(() => {
    void loadExperimentSettings();
    void loadLayoutSettings();
  }, [loadExperimentSettings, loadLayoutSettings]);

  useEffect(() => {
    setUsageIndex(0);
  }, [usageCarouselItems.length]);

  useEffect(() => {
    if (isUsageCarouselHovered) return;
    if (usageCarouselItems.length <= 1) return;
    const timer = window.setInterval(() => {
      setUsageIndex((index) => index + 1);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [isUsageCarouselHovered, usageCarouselItems.length]);

  const statusColors: Record<typeof connectionState, string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-yellow-500',
    reconnecting: 'bg-orange-500',
    disconnected: 'bg-red-500',
  };

  const statusText: Record<typeof connectionState, string> = {
    connected: t("footer.status.normal"),
    connecting: t("footer.status.connecting"),
    reconnecting: t("footer.status.reconnecting"),
    disconnected: t("footer.status.disconnected"),
  };

  const showLeftCarousel = showUsageCarousel && Boolean(usageCarouselItem);
  const showWsStatus = connectionState !== "connected";
  const showLeft = showWsStatus || showLocalServices || effectiveShowResourceMonitor || showLeftCarousel;
  const showRightAgent = showAgentStatus;
  const showRightAcp = launchpadAgentsEnabled;
  const showRight = showRightAgent || showRightAcp;

  if (!showLeft && !showRight) {
    return null;
  }

  return (
    <footer className={cn(APP_FOOTER_HEIGHT_CLASS, "flex shrink-0 items-center justify-between px-3 backdrop-blur-md text-[10px] font-mono text-muted-foreground select-none")}>
      {showLeft ? (
        <div className="flex items-center space-x-2">
          {showWsStatus ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center hover:text-foreground cursor-pointer"
                >
                  <div className={cn(
                    "size-2 rounded-full mr-2",
                    statusColors[connectionState],
                    "animate-pulse"
                  )}></div>
                  <span className="font-medium text-muted-foreground">{statusText[connectionState]}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs p-0">
                <div className="px-3 py-2 text-[11px] font-mono">
                  <div className="font-semibold mb-1.5 flex items-center justify-between gap-4">
                    <span>{t("footer.activeWebSocket")}</span>
                  </div>
                  <div className="text-background/90">{t("footer.notConnected")}</div>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : null}
          {showWsStatus && (effectiveShowResourceMonitor || showLocalServices || showLeftCarousel) ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {effectiveShowResourceMonitor ? (
            <ResourceMonitorFooterItem />
          ) : null}
          {effectiveShowResourceMonitor && (showLocalServices || showLeftCarousel) ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {showLocalServices ? (
            <LocalServicesFooterItem />
          ) : null}
          {showLocalServices && showLeftCarousel ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {showLeftCarousel && usageCarouselItem ? (
            <div
              className="flex min-w-0 w-[min(360px,38vw)] items-center gap-1.5 text-muted-foreground"
              onMouseEnter={() => setIsUsageCarouselHovered(true)}
              onMouseLeave={() => setIsUsageCarouselHovered(false)}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={usageCarouselItem.providerId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex shrink-0 items-center justify-center text-foreground/85"
                >
                  <ProviderGlyph providerId={usageCarouselItem.providerId} size={12} />
                </motion.span>
              </AnimatePresence>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={usageCarouselItem.providerId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="min-w-0 flex-1"
                >
                  <HoverScrollText
                    text={usageCarouselItem.text}
                    active={isUsageCarouselHovered}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      ) : (
        <div />
      )}

      {showRight ? (
        <div className="flex items-center space-x-2">
          {showRightAgent ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 hover:text-foreground cursor-pointer"
                >
                  <AgentStatusOverviewTrigger />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                className="w-[28rem] max-w-[calc(100vw-1.5rem)] p-0"
              >
                <AgentStatusPopoverContent />
              </PopoverContent>
            </Popover>
          ) : null}
          {showRightAgent && showRightAcp ? (
            <div className="h-3 w-px bg-border" />
          ) : null}
          {showRightAcp ? (
            <AcpChatButton onClick={() => router.push("/agent-chat")} />
          ) : null}
        </div>
      ) : null}
    </footer>
  );
};

export default Footer;
