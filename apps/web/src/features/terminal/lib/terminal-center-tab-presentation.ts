import {
  getTerminalDisplayMeta,
  isPathLikeTitle,
  shortenPath,
  type ContestedOwnersMap,
  type TerminalTitleAgent,
} from "@atmos/shared/terminal";
import type { MosaicNode } from "react-mosaic-component";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/features/terminal/types/index";
import { flattenMosaicLayout } from "@/features/terminal/lib/terminal-grid-utils";

export type TerminalCenterTabPresentation = {
  /** Text shown on the center-stage terminal tab. */
  displayTitle: string;
  /**
   * Agent for the tab icon when auto-titled (no custom tab title).
   * `undefined` → keep the default terminal icon.
   */
  toolbarAgent: TerminalPaneAgent | undefined;
  /** Pane chosen as the title source (for debugging / tests). */
  sourcePaneId: string | null;
};

/**
 * Pick which pane drives an auto terminal-tab title:
 * - single pane → that pane
 * - multi pane → last active, else maximized, else first leaf in layout order
 */
export function pickRepresentativeTerminalPaneId(options: {
  panes: Record<string, TerminalPaneProps>;
  layout?: MosaicNode<string> | null;
  lastActivePaneId?: string | null;
  maximizedPaneId?: string | null;
}): string | null {
  const { panes, layout = null, lastActivePaneId = null, maximizedPaneId = null } = options;
  const layoutOrder = flattenMosaicLayout(layout).filter((paneId) => Boolean(panes[paneId]));
  const paneIds =
    layoutOrder.length > 0
      ? layoutOrder
      : Object.keys(panes).filter((paneId) => Boolean(panes[paneId]));

  if (paneIds.length === 0) return null;
  if (paneIds.length === 1) return paneIds[0]!;

  if (lastActivePaneId && panes[lastActivePaneId]) return lastActivePaneId;
  if (maximizedPaneId && panes[maximizedPaneId]) return maximizedPaneId;
  return paneIds[0]!;
}

/**
 * Pane toolbar–aligned title for a single pane (includes OSC session topic when present).
 * Custom pane labels keep the same agent/CWD suffix rules as the pane toolbar.
 */
export function resolvePaneTitleForCenterTab(
  pane: TerminalPaneProps,
  options?: {
    configuredAgents?: TerminalTitleAgent[];
    contestedOwners?: ContestedOwnersMap;
    /** Default true. When false, hide agent brand text (icon still returned). */
    showAgentName?: boolean;
  },
): { displayTitle: string; toolbarAgent: TerminalPaneAgent | undefined } {
  const configuredAgents = options?.configuredAgents ?? [];
  const showAgentName = options?.showAgentName !== false;
  const customLabel = pane.customLabel?.trim();
  const hasCustom = Boolean(customLabel);

  const shapeAgent =
    pane.agent ??
    configuredAgents.find(
      (agent) => agent.label.trim().toLowerCase() === pane.label.trim().toLowerCase(),
    );

  const auto = getTerminalDisplayMeta({
    baseTitle: pane.label,
    dynamicTitle: pane.dynamicTitle,
    configuredAgents,
    agent: shapeAgent,
    contestedOwners: options?.contestedOwners,
    oscTitle: pane.oscTitle,
    suppressOscTitle: hasCustom,
    showAgentName,
  });

  if (!hasCustom) {
    // Mirror the full pane toolbar title (primary + OSC when available).
    // Agent icon-only + empty text is valid when name is hidden and no OSC.
    const displayTitle = (auto.displayTitle || auto.primaryTitle || "").trim();
    return {
      displayTitle:
        displayTitle ||
        (auto.toolbarAgent ? "" : pane.label?.trim() || "Terminal"),
      toolbarAgent: toPaneAgent(auto.toolbarAgent),
    };
  }

  const wantAgent = pane.keepAgentName !== false && showAgentName;
  const wantCwd = pane.keepCwd !== false;
  const showAgentLabel = wantAgent && !!auto.toolbarAgent;
  const cwdSuffix =
    !showAgentLabel && wantCwd && pane.dynamicTitle
      ? isPathLikeTitle(pane.dynamicTitle)
        ? shortenPath(pane.dynamicTitle)
        : pane.dynamicTitle
      : undefined;

  const displayTitle = [customLabel, showAgentLabel ? auto.toolbarAgent!.label : undefined, cwdSuffix]
    .filter(Boolean)
    .join(" · ");

  return {
    displayTitle,
    // Keep agent for the tab icon even when brand text is hidden.
    toolbarAgent: toPaneAgent(auto.toolbarAgent),
  };
}

function toPaneAgent(
  agent: TerminalTitleAgent | undefined,
): TerminalPaneAgent | undefined {
  if (!agent) return undefined;
  return {
    id: agent.id,
    label: agent.label,
    command: agent.command,
    iconType: agent.iconType === "custom" ? "custom" : "built-in",
    pipeCommand: agent.pipeCommand,
  };
}

/**
 * Resolve what a center-stage terminal tab should show.
 *
 * - User `customTitle` wins for text and keeps the default terminal icon.
 * - Otherwise mirror the representative pane's title (and its agent icon).
 */
export function resolveTerminalCenterTabPresentation(options: {
  fallbackTitle: string;
  customTitle?: string | null;
  panes: Record<string, TerminalPaneProps>;
  layout?: MosaicNode<string> | null;
  lastActivePaneId?: string | null;
  maximizedPaneId?: string | null;
  configuredAgents?: TerminalTitleAgent[];
  contestedOwners?: ContestedOwnersMap;
  showAgentName?: boolean;
}): TerminalCenterTabPresentation {
  const custom = options.customTitle?.trim();
  if (custom) {
    return {
      displayTitle: custom,
      toolbarAgent: undefined,
      sourcePaneId: null,
    };
  }

  const sourcePaneId = pickRepresentativeTerminalPaneId({
    panes: options.panes,
    layout: options.layout,
    lastActivePaneId: options.lastActivePaneId,
    maximizedPaneId: options.maximizedPaneId,
  });

  if (!sourcePaneId) {
    return {
      displayTitle: options.fallbackTitle || "Terminal",
      toolbarAgent: undefined,
      sourcePaneId: null,
    };
  }

  const pane = options.panes[sourcePaneId]!;
  const resolved = resolvePaneTitleForCenterTab(pane, {
    configuredAgents: options.configuredAgents,
    contestedOwners: options.contestedOwners,
    showAgentName: options.showAgentName,
  });

  // Agent + name hidden + no OSC → empty text is intentional (icon only).
  const displayTitle =
    resolved.displayTitle ||
    (resolved.toolbarAgent ? "" : options.fallbackTitle || "Terminal");

  return {
    displayTitle,
    toolbarAgent: resolved.toolbarAgent,
    sourcePaneId,
  };
}
