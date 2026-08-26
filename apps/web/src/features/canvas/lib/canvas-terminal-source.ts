"use client";

import {
  DEFAULT_CENTER_SPACE_ID,
  hostIdFromCenterKey,
  makeCenterSpaceKey,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  findWorkspacePaneIdsByTmuxWindowName,
  FIXED_TERMINAL_TAB_VALUE,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { spaceIdFromTmuxWindowName } from "@/features/terminal/store/terminal-store-helpers";
import {
  commitLocatedPaneNavigation,
  navigateToLocatedPane,
  waitForDestination,
  type NavigateToLocatedPaneRouter,
} from "@/features/terminal/public/navigate-to-located-pane";
import type { CanvasTerminalShapeProps } from "./canvas-terminal-shape";

export type CanvasTerminalSourceInput = Pick<
  CanvasTerminalShapeProps,
  "workspaceId" | "tmuxWindowName" | "contextScope" | "sourceTerminalTabId"
>;

export type CanvasTerminalSourceTarget = {
  hostId: string;
  spaceId: string;
  paintContextId: string;
  contextScope: "project" | "workspace";
  tmuxWindowName: string;
  sourceTerminalTabId: string;
};

/**
 * Pins store the paint context in `workspaceId` (host + extra space). URL / tmux
 * / agent keys still need the host id; extra spaces are recovered from the
 * paint key or the namespaced tmux window.
 */
export function resolveCanvasTerminalSourceTarget(
  props: CanvasTerminalSourceInput,
): CanvasTerminalSourceTarget {
  const hostId = hostIdFromCenterKey(props.workspaceId);
  const fromPaint = parseCenterSpaceKey(props.workspaceId).spaceId;
  const fromTmux = spaceIdFromTmuxWindowName(props.tmuxWindowName);
  const spaceId = fromPaint !== DEFAULT_CENTER_SPACE_ID ? fromPaint : fromTmux;
  const contextScope = props.contextScope === "project" ? "project" : "workspace";
  const sourceTerminalTabId =
    props.sourceTerminalTabId?.trim() || FIXED_TERMINAL_TAB_VALUE;
  return {
    hostId,
    spaceId,
    paintContextId: makeCenterSpaceKey(hostId, spaceId),
    contextScope,
    tmuxWindowName: props.tmuxWindowName?.trim() || "",
    sourceTerminalTabId,
  };
}

export function buildCanvasTerminalSourcePath(
  target: CanvasTerminalSourceTarget,
  options?: { terminalTabId?: string | null; canvas?: boolean },
): string {
  const base = target.contextScope === "project" ? "/project" : "/workspace";
  const params = new URLSearchParams();
  params.set("id", target.hostId);
  const tab = options?.terminalTabId?.trim() || target.sourceTerminalTabId;
  if (tab) params.set("tab", tab);
  if (target.tmuxWindowName) params.set("terminalTmux", target.tmuxWindowName);
  if (options?.canvas) params.set("canvas", "true");
  return `${base}?${params.toString()}`;
}

export function canvasTerminalMatchesAgentTarget(
  props: Pick<CanvasTerminalShapeProps, "workspaceId" | "tmuxWindowName">,
  target: { contextId: string | null; tmuxWindowName: string | null },
): boolean {
  if (!target.contextId || !target.tmuxWindowName) return false;
  return (
    hostIdFromCenterKey(props.workspaceId) === target.contextId &&
    props.tmuxWindowName === target.tmuxWindowName
  );
}

function currentHostIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id")?.trim() || null;
}

/**
 * Jump from a canvas terminal back to its center-stage source.
 *
 * Same contract as footer agent-status: host id in the URL (never a paint
 * key), owning terminal tab, then Center Space switch with the dest
 * `terminalTmux` already committed so leftover chrome cannot bounce the
 * incoming space.
 */
export async function navigateToCanvasTerminalSource(
  props: CanvasTerminalSourceInput,
  router: NavigateToLocatedPaneRouter,
): Promise<boolean> {
  const target = resolveCanvasTerminalSourceTarget(props);
  if (!target.hostId || !target.tmuxWindowName) return false;

  const state = useTerminalStore.getState();
  const hit = findWorkspacePaneIdsByTmuxWindowName(
    state,
    target.paintContextId,
    target.tmuxWindowName,
    target.contextScope === "project",
  );
  const tabId = hit?.terminalTabId || target.sourceTerminalTabId;
  const pane = hit
    ? state.getPanes(target.paintContextId, hit.terminalTabId)[hit.paneId]
    : undefined;

  if (hit && pane?.sessionId) {
    return navigateToLocatedPane(
      {
        hostId: target.hostId,
        spaceId: target.spaceId,
        paintContextId: target.paintContextId,
        terminalTabId: hit.terminalTabId,
        paneId: hit.paneId,
        sessionId: pane.sessionId,
        tmuxWindowName: target.tmuxWindowName,
      },
      { routeKind: target.contextScope, router },
    );
  }

  const path = buildCanvasTerminalSourcePath(target, { terminalTabId: tabId });
  const { useCenterSpaceStore } = await import(
    "@/app-shell/center-space/center-space-store"
  );
  const store = useCenterSpaceStore.getState();
  if (!store.hydrated) store.hydrate();
  store.ensureHost(target.hostId);

  const sameHost = currentHostIdFromLocation() === target.hostId;
  const alreadyOnDestSpace =
    sameHost && store.getActiveSpaceId(target.hostId) === target.spaceId;

  if (!sameHost) {
    store.setActiveSpace(target.hostId, target.spaceId);
    commitLocatedPaneNavigation(router, path);
    return true;
  }

  commitLocatedPaneNavigation(router, path);
  if (alreadyOnDestSpace) return true;

  const committed = await waitForDestination({
    pathname: target.contextScope === "project" ? "/project" : "/workspace",
    id: target.hostId,
    tab: tabId,
    terminalTmux: target.tmuxWindowName,
  });
  if (!committed) return false;

  const { switchCenterSpace } = await import(
    "@/app-shell/center-space/center-space-switch"
  );
  await switchCenterSpace(target.hostId, target.spaceId, {
    preserveDeepLink: true,
  });
  return true;
}
