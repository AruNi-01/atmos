/**
 * Tiny pub/sub so non-React entry points can open the Desktop Use readiness modal.
 */

import type { DesktopUseReadiness } from "./readiness";

export type DesktopUseReadinessModalState = {
  open: boolean;
  readiness: DesktopUseReadiness | null;
  /** Optional label of the feature that triggered the gate (for copy). */
  source?: "appshot" | "slash" | "generic";
};

type Listener = (state: DesktopUseReadinessModalState) => void;

let state: DesktopUseReadinessModalState = {
  open: false,
  readiness: null,
  source: undefined,
};
const listeners = new Set<Listener>();

function publish() {
  for (const l of listeners) {
    try {
      l(state);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function getDesktopUseReadinessModalState(): DesktopUseReadinessModalState {
  return state;
}

export function subscribeDesktopUseReadinessModal(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function openDesktopUseReadinessModal(
  readiness: DesktopUseReadiness,
  source: DesktopUseReadinessModalState["source"] = "generic",
): void {
  state = { open: true, readiness, source };
  publish();
}

export function closeDesktopUseReadinessModal(): void {
  if (!state.open) return;
  state = { open: false, readiness: state.readiness, source: state.source };
  publish();
}

/**
 * Entry helper: background readiness check → modal when not ready.
 * Does not block the caller.
 */
export function gateDesktopUseFeature(
  source: DesktopUseReadinessModalState["source"] = "generic",
  handlers?: {
    onReady?: () => void;
  },
): void {
  // Lazy import to avoid circular deps with readiness.ts call sites
  void import("./readiness").then(
    ({ checkDesktopUseReadinessInBackground }) => {
      checkDesktopUseReadinessInBackground({
        onReady: () => handlers?.onReady?.(),
        onBlocked: (r) => openDesktopUseReadinessModal(r, source),
      });
    },
  );
}
