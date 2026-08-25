"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared left-sidebar workspace info popover session.
 *
 * First hover still waits `OPEN_DELAY`. Once the popover is showing, moving
 * across other workspace rows swaps the open target immediately so the shell
 * stays mounted (content + anchor follow; no close/reopen wait).
 */

export const WORKSPACE_INFO_HOVER_OPEN_DELAY_MS = 1000;
export const WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS = 220;

export const WORKSPACE_INFO_HOVER_KEEP_ALIVE_SELECTOR = [
  "[data-workspace-popover-surface='true']",
  "[data-workspace-info-hover-host]",
  "[data-ws-row]",
  "[data-radix-popper-content-wrapper]",
  "[data-slot='popover-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-sub-content']",
  "[data-slot='select-content']",
  "[data-slot='tooltip-content']",
  "[data-slot='hover-card-content']",
].join(",");

export function isWorkspaceInfoHoverKeepAliveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(WORKSPACE_INFO_HOVER_KEEP_ALIVE_SELECTOR))
  );
}

export function isWorkspaceInfoHoverKeepAliveHovered(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector(
      WORKSPACE_INFO_HOVER_KEEP_ALIVE_SELECTOR.split(",").map((selector) => `${selector}:hover`).join(","),
    ),
  );
}

export type WorkspaceInfoHoverHostSnapshot = {
  openId: string | null;
  trigger: HTMLElement | null;
};

type Clock = {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

const EMPTY_HOST_SNAPSHOT: WorkspaceInfoHoverHostSnapshot = {
  openId: null,
  trigger: null,
};

// Browser `window.setTimeout` is a host method: `{ setTimeout }` then
// `clock.setTimeout()` throws TypeError: Illegal invocation.
const DEFAULT_CLOCK: Clock = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

export type WorkspaceInfoHoverEnterOptions = {
  immediate?: boolean;
  /** Distinguishes duplicate rows that share a workspace id (pinned + list). */
  instanceId?: string;
};

export function createWorkspaceInfoHoverSession(clock: Clock = DEFAULT_CLOCK) {
  let hoveredInstanceId: string | null = null;
  let openId: string | null = null;
  let openInstanceId: string | null = null;
  let holding = false;
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let slotEl: HTMLElement | null = null;
  let hostSnapshot: WorkspaceInfoHoverHostSnapshot = EMPTY_HOST_SNAPSHOT;
  const triggers = new Map<string, HTMLElement>();
  const locks = new Set<string>();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  // Host only cares about openId/trigger. Slot changes must notify portal
  // readers without replacing this object, or the host re-renders, React 19
  // re-runs the slot ref, and the popover never stays open.
  const syncHostSnapshot = () => {
    const trigger = openInstanceId ? triggers.get(openInstanceId) ?? null : null;
    if (hostSnapshot.openId === openId && hostSnapshot.trigger === trigger) {
      return false;
    }
    hostSnapshot =
      openId == null && trigger == null
        ? EMPTY_HOST_SNAPSHOT
        : { openId, trigger };
    return true;
  };

  const notify = () => {
    syncHostSnapshot();
    emit();
  };

  const clearOpenTimer = () => {
    if (openTimer == null) return;
    clock.clearTimeout(openTimer);
    openTimer = null;
  };

  const clearCloseTimer = () => {
    if (closeTimer == null) return;
    clock.clearTimeout(closeTimer);
    closeTimer = null;
  };

  const canClose = () =>
    hoveredInstanceId == null && !holding && locks.size === 0;

  const scheduleClose = () => {
    clearCloseTimer();
    if (!openId || !canClose()) return;
    closeTimer = clock.setTimeout(() => {
      closeTimer = null;
      if (!canClose()) return;
      openId = null;
      openInstanceId = null;
      notify();
    }, WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS);
  };

  const openNow = (id: string, instanceId: string) => {
    clearOpenTimer();
    clearCloseTimer();
    if (openId === id && openInstanceId === instanceId) {
      notify();
      return;
    }
    locks.clear();
    openId = id;
    openInstanceId = instanceId;
    notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    subscribe,
    getHostSnapshot: (): WorkspaceInfoHoverHostSnapshot => hostSnapshot,
    getServerSnapshot: (): WorkspaceInfoHoverHostSnapshot => EMPTY_HOST_SNAPSHOT,
    getOpenId: () => openId,
    getOpenInstanceId: () => openInstanceId,
    getSlotEl: () => slotEl,
    getPortalElForInstance: (instanceId: string) =>
      openInstanceId === instanceId ? slotEl : null,
    shouldIgnoreRootDismiss: () =>
      holding || locks.size > 0 || hoveredInstanceId != null,

    enter(id: string, trigger: HTMLElement, options?: WorkspaceInfoHoverEnterOptions) {
      const instanceId = options?.instanceId ?? id;
      hoveredInstanceId = instanceId;
      triggers.set(instanceId, trigger);
      holding = false;
      clearCloseTimer();

      if (openId != null || options?.immediate) {
        openNow(id, instanceId);
        return;
      }

      clearOpenTimer();
      openTimer = clock.setTimeout(() => {
        openTimer = null;
        if (hoveredInstanceId !== instanceId) return;
        openId = id;
        openInstanceId = instanceId;
        notify();
      }, WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    },

    leave(instanceId: string) {
      if (hoveredInstanceId === instanceId) hoveredInstanceId = null;
      clearOpenTimer();
      scheduleClose();
    },

    hold() {
      holding = true;
      clearCloseTimer();
    },

    unhold() {
      holding = false;
      scheduleClose();
    },

    setLock(key: string, locked: boolean) {
      if (locked) {
        locks.add(key);
        clearCloseTimer();
        return;
      }
      locks.delete(key);
      scheduleClose();
    },

    dismiss() {
      clearOpenTimer();
      clearCloseTimer();
      hoveredInstanceId = null;
      holding = false;
      locks.clear();
      if (openId == null) return;
      openId = null;
      openInstanceId = null;
      notify();
    },

    suppress(instanceId: string) {
      if (hoveredInstanceId === instanceId) hoveredInstanceId = null;
      triggers.delete(instanceId);
      clearOpenTimer();
      if (openInstanceId === instanceId) {
        holding = false;
        locks.clear();
        openId = null;
        openInstanceId = null;
        notify();
      } else {
        scheduleClose();
      }
    },

    detach(instanceId: string) {
      triggers.delete(instanceId);
      if (hoveredInstanceId === instanceId) hoveredInstanceId = null;
      if (openInstanceId === instanceId) {
        clearOpenTimer();
        clearCloseTimer();
        holding = false;
        locks.clear();
        openId = null;
        openInstanceId = null;
        notify();
        return;
      }
      clearOpenTimer();
      scheduleClose();
    },

    setSlotEl(el: HTMLElement | null) {
      if (slotEl === el) return;
      slotEl = el;
      emit();
    },

    reset() {
      clearOpenTimer();
      clearCloseTimer();
      hoveredInstanceId = null;
      holding = false;
      locks.clear();
      triggers.clear();
      const hadSlot = slotEl != null;
      slotEl = null;
      if (openId == null && hostSnapshot === EMPTY_HOST_SNAPSHOT && !hadSlot) return;
      openId = null;
      openInstanceId = null;
      notify();
    },
  };
}

export type WorkspaceInfoHoverSession = ReturnType<typeof createWorkspaceInfoHoverSession>;

export const workspaceInfoHoverSession = createWorkspaceInfoHoverSession();

export function subscribeWorkspaceInfoHover(listener: () => void) {
  return workspaceInfoHoverSession.subscribe(listener);
}

export function getWorkspaceInfoHoverPortalEl(instanceId: string): HTMLElement | null {
  return workspaceInfoHoverSession.getPortalElForInstance(instanceId);
}

export function useWorkspaceInfoHoverPortal(instanceId: string): HTMLElement | null {
  return useSyncExternalStore(
    subscribeWorkspaceInfoHover,
    () => getWorkspaceInfoHoverPortalEl(instanceId),
    () => null,
  );
}

export function useWorkspaceInfoHoverOpen(instanceId: string): boolean {
  return useSyncExternalStore(
    subscribeWorkspaceInfoHover,
    () => workspaceInfoHoverSession.getOpenInstanceId() === instanceId,
    () => false,
  );
}
