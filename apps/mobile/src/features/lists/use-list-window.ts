import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  LIST_PAGE_SIZE,
  nextListWindow,
  reconcileListWindow,
  type StoredListWindow,
} from "./list-page";
import { reportListFirstFrame } from "./list-navigation";

const readyTokens = new Set<string>();
const revealListeners = new Set<() => void>();
let mountSerial = 0;

function subscribeListReveal(listener: () => void) {
  revealListeners.add(listener);
  return () => {
    revealListeners.delete(listener);
  };
}

function isListRevealReady(token: string) {
  return readyTokens.has(token);
}

function markListRevealReady(token: string) {
  if (readyTokens.has(token)) return;
  readyTokens.add(token);
  for (const listener of revealListeners) listener();
}

function clearListRevealReady(token: string) {
  if (!readyTokens.delete(token)) return;
  for (const listener of revealListeners) listener();
}

function nextMountId() {
  mountSerial += 1;
  return mountSerial;
}

const windows = new Map<number, StoredListWindow>();
const windowListeners = new Set<() => void>();

function subscribeListWindow(listener: () => void) {
  windowListeners.add(listener);
  return () => {
    windowListeners.delete(listener);
  };
}

function emitListWindow() {
  for (const listener of windowListeners) listener();
}

/**
 * Show `LIST_PAGE_SIZE` rows. Changing `resetKey` stores a fresh page of 20
 * on that render, including when the caller returns to a previous key.
 * The store is updated here, not with `setState`, so the render does not
 * call `setState` and the effect does not either.
 */
export function useListWindow(resetKey = "") {
  const [mountId] = useState(() => nextMountId());
  const stored = windows.get(mountId);
  const reconciled = reconcileListWindow(stored, resetKey);
  if (reconciled !== stored) windows.set(mountId, reconciled);

  const shown = useSyncExternalStore(
    subscribeListWindow,
    () => windows.get(mountId)?.shown ?? LIST_PAGE_SIZE,
    () => LIST_PAGE_SIZE,
  );

  const applyEnd = useCallback(
    (loaded: number, hasNextPage: boolean) => {
      const decision = nextListWindow({ shown, loaded, hasNextPage });
      if (decision.shown !== shown) {
        windows.set(mountId, { key: resetKey, shown: decision.shown });
        emitListWindow();
      }
      return decision.fetch;
    },
    [mountId, resetKey, shown],
  );

  useEffect(() => {
    return () => {
      windows.delete(mountId);
    };
  }, [mountId]);

  return { shown, applyEnd };
}

/**
 * First commit is not ready. The effect records click-to-first-frame, then
 * the next animation frame enables queries. Ready state is a module store so
 * this hook does not set React state inside the effect.
 */
export function useListReveal(target: string, resetKey = "") {
  const [mountId] = useState(() => nextMountId());
  const token = `${mountId}:${target}:${resetKey}`;
  const ready = useSyncExternalStore(
    subscribeListReveal,
    () => isListRevealReady(token),
    () => false,
  );
  const windowState = useListWindow(token);

  useEffect(() => {
    reportListFirstFrame(target, resetKey || undefined);
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!cancelled) markListRevealReady(token);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearListRevealReady(token);
    };
  }, [resetKey, target, token]);

  return { ready, shown: windowState.shown, applyEnd: windowState.applyEnd };
}
