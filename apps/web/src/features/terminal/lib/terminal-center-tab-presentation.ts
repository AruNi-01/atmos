import {
  getTerminalDisplayMeta,
  isPathLikeTitle,
  nextCenterTabSessionOscTitle,
  shortenPath,
  type ContestedOwnersMap,
  type TerminalTitleAgent,
} from "@atmos/shared/terminal";
import type { TerminalLayoutNode } from "@/features/terminal/types/index";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/features/terminal/types/index";
import { flattenTerminalLayout } from "@/features/terminal/lib/terminal-grid-utils";

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
  /**
   * Sticky session topic used for the tab (after Grok-style realtime strip).
   * Callers should feed this back as `previousSessionOsc` on the next resolve
   * so pure status OSC updates do not thrash tab width.
   */
  sessionOscTitle: string | undefined;
};

/**
 * Pick which pane drives an auto terminal-tab title:
 * - single pane → that pane
 * - multi pane → last active, else maximized, else first leaf in layout order
 */
export function pickRepresentativeTerminalPaneId(options: {
  panes: Record<string, TerminalPaneProps>;
  layout?: TerminalLayoutNode<string> | null;
  lastActivePaneId?: string | null;
  maximizedPaneId?: string | null;
}): string | null {
  const { panes, layout = null, lastActivePaneId = null, maximizedPaneId = null } = options;
  const layoutOrder = flattenTerminalLayout(layout).filter((paneId) => Boolean(panes[paneId]));
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
 * Center-tab title for a single pane.
 *
 * Unlike the pane toolbar (which follows live OSC spinners/activity), the
 * center tab only surfaces a **stable session topic**:
 * - Grok compound OSC → trailing fixed session name (`Responding - topic - grok` → `topic`)
 * - Once a session topic is known, pure realtime OSC updates do not replace it
 * - Pane custom labels keep the same agent/CWD suffix rules as the toolbar
 */
export function resolvePaneTitleForCenterTab(
  pane: TerminalPaneProps,
  options?: {
    configuredAgents?: TerminalTitleAgent[];
    contestedOwners?: ContestedOwnersMap;
    /**
     * Previous sticky session topic for this pane (from the last center-tab
     * resolve). Pure realtime OSC updates keep this instead of thrashing.
     */
    previousSessionOsc?: string | null;
  },
): {
  displayTitle: string;
  toolbarAgent: TerminalPaneAgent | undefined;
  sessionOscTitle: string | undefined;
} {
  const configuredAgents = options?.configuredAgents ?? [];
  const customLabel = pane.customLabel?.trim();
  const hasCustom = Boolean(customLabel);

  const shapeAgent =
    pane.agent ??
    configuredAgents.find(
      (agent) => agent.label.trim().toLowerCase() === pane.label.trim().toLowerCase(),
    );

  // Sticky stable session topic for the center tab — not live spinner/activity.
  const sessionOscTitle = hasCustom
    ? undefined
    : nextCenterTabSessionOscTitle(
        options?.previousSessionOsc ?? undefined,
        pane.oscTitle,
        {
          dynamicTitle: pane.dynamicTitle,
          toolbarAgent: shapeAgent,
        },
      );

  const auto = getTerminalDisplayMeta({
    baseTitle: pane.label,
    dynamicTitle: pane.dynamicTitle,
    configuredAgents,
    agent: shapeAgent,
    contestedOwners: options?.contestedOwners,
    // Center tab: stable session only. Live OSC stays on the pane toolbar.
    oscTitle: sessionOscTitle,
    suppressOscTitle: hasCustom,
  });

  return {
    displayTitle: composePaneDisplayTitle(pane, auto),
    toolbarAgent: toPaneAgent(auto.toolbarAgent),
    sessionOscTitle: hasCustom ? undefined : sessionOscTitle,
  };
}

/**
 * Same chrome as the terminal pane toolbar: live OSC (spinners / session
 * topics), custom labels, and leftover-brand drop after the process exits.
 */
export function resolvePaneToolbarTitle(
  pane: TerminalPaneProps,
  options?: {
    configuredAgents?: TerminalTitleAgent[];
    contestedOwners?: ContestedOwnersMap;
  },
): {
  displayTitle: string;
  toolbarAgent: TerminalPaneAgent | undefined;
} {
  const configuredAgents = options?.configuredAgents ?? [];
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
  });
  return {
    displayTitle: composePaneDisplayTitle(pane, auto),
    toolbarAgent: toPaneAgent(auto.toolbarAgent),
  };
}

function composePaneDisplayTitle(
  pane: TerminalPaneProps,
  auto: ReturnType<typeof getTerminalDisplayMeta>,
): string {
  const customLabel = pane.customLabel?.trim();
  if (!customLabel) {
    const displayTitle = (auto.displayTitle || auto.primaryTitle || "").trim();
    if (displayTitle) return displayTitle;
    // No session/cwd/command title yet — keep the agent name so the tab is
    // not icon-only (hover would otherwise replace the icon with close).
    const agentLabel = auto.toolbarAgent?.label?.trim();
    if (agentLabel) return agentLabel;
    return pane.label?.trim() || "Terminal";
  }

  const wantAgent = pane.keepAgentName !== false;
  const wantCwd = pane.keepCwd !== false;
  const showAgentLabel = wantAgent && !!auto.toolbarAgent;
  const cwdSuffix =
    !showAgentLabel && wantCwd && pane.dynamicTitle
      ? isPathLikeTitle(pane.dynamicTitle)
        ? shortenPath(pane.dynamicTitle)
        : auto.toolbarAgent
          ? undefined
          : pane.dynamicTitle
      : undefined;

  return [customLabel, showAgentLabel ? auto.toolbarAgent!.label : undefined, cwdSuffix]
    .filter(Boolean)
    .join(" · ");
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
 * - Otherwise use the representative pane's agent icon + **stable** session
 *   topic (not live OSC spinner/activity — those stay on the pane toolbar).
 * - If there is no session/cwd/command title yet, show the agent name so the
 *   tab is not icon-only.
 */
export function resolveTerminalCenterTabPresentation(options: {
  fallbackTitle: string;
  customTitle?: string | null;
  panes: Record<string, TerminalPaneProps>;
  layout?: TerminalLayoutNode<string> | null;
  lastActivePaneId?: string | null;
  maximizedPaneId?: string | null;
  configuredAgents?: TerminalTitleAgent[];
  contestedOwners?: ContestedOwnersMap;
  /**
   * Sticky session topics keyed by pane id (from prior center-tab resolves).
   * When the live OSC is pure realtime noise, the previous topic is kept so
   * tab width does not thrash.
   */
  previousSessionOscByPaneId?: ReadonlyMap<string, string> | Record<string, string | undefined>;
}): TerminalCenterTabPresentation {
  const custom = options.customTitle?.trim();
  if (custom) {
    return {
      displayTitle: custom,
      toolbarAgent: undefined,
      sourcePaneId: null,
      sessionOscTitle: undefined,
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
      sessionOscTitle: undefined,
    };
  }

  const previousSessionOsc = readPreviousSessionOsc(
    options.previousSessionOscByPaneId,
    sourcePaneId,
  );

  const pane = options.panes[sourcePaneId]!;
  const resolved = resolvePaneTitleForCenterTab(pane, {
    configuredAgents: options.configuredAgents,
    contestedOwners: options.contestedOwners,
    previousSessionOsc,
  });

  const displayTitle =
    resolved.displayTitle ||
    resolved.toolbarAgent?.label ||
    options.fallbackTitle ||
    "Terminal";

  return {
    displayTitle,
    toolbarAgent: resolved.toolbarAgent,
    sourcePaneId,
    sessionOscTitle: resolved.sessionOscTitle,
  };
}

function isSessionOscMap(
  store: ReadonlyMap<string, string> | Record<string, string | undefined>,
): store is ReadonlyMap<string, string> {
  // ReadonlyMap is a structural interface; prefer `get` over `instanceof Map`
  // so Map and ReadonlyMap views both narrow correctly under tsc.
  return typeof (store as ReadonlyMap<string, string>).get === "function";
}

function readPreviousSessionOsc(
  store:
    | ReadonlyMap<string, string>
    | Record<string, string | undefined>
    | undefined,
  paneId: string,
): string | undefined {
  if (!store) return undefined;
  if (isSessionOscMap(store)) return store.get(paneId);
  return store[paneId];
}
