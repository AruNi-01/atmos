import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { LIST_PAGE_SIZE, nextListWindow } from "./list-page";
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

/**
 * Show `LIST_PAGE_SIZE` rows. A new `resetKey` derives 20 on that render
 * instead of keeping the previous window.
 */
export function useListWindow(resetKey = "") {
  const [state, setState] = useState(() => ({ key: resetKey, shown: LIST_PAGE_SIZE }));
  const shown = state.key === resetKey ? state.shown : LIST_PAGE_SIZE;

  const applyEnd = useCallback(
    (loaded: number, hasNextPage: boolean) => {
      const decision = nextListWindow({ shown, loaded, hasNextPage });
      if (decision.shown !== shown) setState({ key: resetKey, shown: decision.shown });
      return decision.fetch;
    },
    [resetKey, shown],
  );

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
    reportListFirstFrame(target);
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!cancelled) markListRevealReady(token);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearListRevealReady(token);
    };
  }, [target, token]);

  return { ready, shown: windowState.shown, applyEnd: windowState.applyEnd };
}
