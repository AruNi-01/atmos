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
export const WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS = 150;

export type WorkspaceInfoHoverHostSnapshot = {
  openId: string | null;
  trigger: HTMLElement | null;
  slotEl: HTMLElement | null;
};

type Clock = {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

const EMPTY_HOST_SNAPSHOT: WorkspaceInfoHoverHostSnapshot = {
  openId: null,
  trigger: null,
  slotEl: null,
};

export function createWorkspaceInfoHoverSession(clock: Clock = {
  setTimeout,
  clearTimeout,
}) {
  let hoveredId: string | null = null;
  let openId: string | null = null;
  let holding = false;
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let slotEl: HTMLElement | null = null;
  let hostSnapshot: WorkspaceInfoHoverHostSnapshot = EMPTY_HOST_SNAPSHOT;
  const triggers = new Map<string, HTMLElement>();
  const locks = new Set<string>();
  const listeners = new Set<() => void>();

  const notify = () => {
    const trigger = openId ? triggers.get(openId) ?? null : null;
    if (
      hostSnapshot.openId === openId &&
      hostSnapshot.trigger === trigger &&
      hostSnapshot.slotEl === slotEl
    ) {
      return;
    }
    hostSnapshot = { openId, trigger, slotEl };
    for (const listener of listeners) listener();
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
    hoveredId == null && !holding && locks.size === 0;

  const scheduleClose = () => {
    clearCloseTimer();
    if (!openId || !canClose()) return;
    closeTimer = clock.setTimeout(() => {
      closeTimer = null;
      if (!canClose()) return;
      openId = null;
      notify();
    }, WORKSPACE_INFO_HOVER_CLOSE_DELAY_MS);
  };

  const openNow = (id: string) => {
    clearOpenTimer();
    clearCloseTimer();
    if (openId === id) {
      notify();
      return;
    }
    locks.clear();
    openId = id;
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
    getSlotEl: () => slotEl,

    enter(id: string, trigger: HTMLElement, options?: { immediate?: boolean }) {
      hoveredId = id;
      triggers.set(id, trigger);
      holding = false;
      clearCloseTimer();

      if (openId != null || options?.immediate) {
        openNow(id);
        return;
      }

      clearOpenTimer();
      openTimer = clock.setTimeout(() => {
        openTimer = null;
        if (hoveredId !== id) return;
        openId = id;
        notify();
      }, WORKSPACE_INFO_HOVER_OPEN_DELAY_MS);
    },

    leave(id: string) {
      if (hoveredId === id) hoveredId = null;
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
      hoveredId = null;
      holding = false;
      locks.clear();
      if (openId == null) return;
      openId = null;
      notify();
    },

    suppress(id: string) {
      if (hoveredId === id) hoveredId = null;
      triggers.delete(id);
      clearOpenTimer();
      if (openId === id) {
        holding = false;
        locks.clear();
        openId = null;
        notify();
      } else {
        scheduleClose();
      }
    },

    detach(id: string) {
      triggers.delete(id);
      if (hoveredId === id) hoveredId = null;
      if (openId === id) {
        clearOpenTimer();
        clearCloseTimer();
        holding = false;
        locks.clear();
        openId = null;
        notify();
        return;
      }
      clearOpenTimer();
      scheduleClose();
    },

    setSlotEl(el: HTMLElement | null) {
      if (slotEl === el) return;
      slotEl = el;
      notify();
    },

    reset() {
      clearOpenTimer();
      clearCloseTimer();
      hoveredId = null;
      holding = false;
      locks.clear();
      triggers.clear();
      slotEl = null;
      if (openId == null && hostSnapshot === EMPTY_HOST_SNAPSHOT) return;
      openId = null;
      notify();
    },
  };
}

export type WorkspaceInfoHoverSession = ReturnType<typeof createWorkspaceInfoHoverSession>;

export const workspaceInfoHoverSession = createWorkspaceInfoHoverSession();

export function subscribeWorkspaceInfoHover(listener: () => void) {
  return workspaceInfoHoverSession.subscribe(listener);
}

export function getWorkspaceInfoHoverPortalEl(workspaceId: string): HTMLElement | null {
  if (workspaceInfoHoverSession.getOpenId() !== workspaceId) return null;
  return workspaceInfoHoverSession.getSlotEl();
}

export function useWorkspaceInfoHoverPortal(workspaceId: string): HTMLElement | null {
  return useSyncExternalStore(
    subscribeWorkspaceInfoHover,
    () => getWorkspaceInfoHoverPortalEl(workspaceId),
    () => null,
  );
}

export function useWorkspaceInfoHoverOpen(workspaceId: string): boolean {
  return useSyncExternalStore(
    subscribeWorkspaceInfoHover,
    () => workspaceInfoHoverSession.getOpenId() === workspaceId,
    () => false,
  );
}
