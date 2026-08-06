/**
 * Tiny pub/sub so non-React entry points can open the Desktop Use readiness modal.
 */

import type { DesktopUseReadiness } from "./readiness";

export type DesktopUseReadinessModalSource =
  | "appshot"
  | "slash"
  | "browser"
  | "generic";

export type DesktopUseReadinessModalState = {
  open: boolean;
  readiness: DesktopUseReadiness | null;
  /** Optional label of the feature that triggered the gate (for copy). */
  source?: DesktopUseReadinessModalSource;
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

let openTimer: ReturnType<typeof setTimeout> | null = null;

function clearOpenTimer(): void {
  if (openTimer != null) {
    clearTimeout(openTimer);
    openTimer = null;
  }
}

export function openDesktopUseReadinessModal(
  readiness: DesktopUseReadiness,
  source: DesktopUseReadinessModalState["source"] = "generic",
): void {
  clearOpenTimer();
  state = { open: true, readiness, source };
  publish();
}

/**
 * Open after the current UI handoff finishes (e.g. Appshots Popover close).
 * Opening a Radix Dialog in the same tick as Popover dismiss often makes the
 * Dialog receive an immediate outside-dismiss and never stay open.
 */
export function openDesktopUseReadinessModalDeferred(
  readiness: DesktopUseReadiness,
  source: DesktopUseReadinessModalState["source"] = "generic",
  delayMs = 80,
): void {
  clearOpenTimer();
  // Publish closed first only if something else left us mid-flight open=false is fine
  openTimer = setTimeout(() => {
    openTimer = null;
    openDesktopUseReadinessModal(readiness, source);
  }, delayMs);
}

export function closeDesktopUseReadinessModal(): void {
  clearOpenTimer();
  if (!state.open) return;
  state = { open: false, readiness: state.readiness, source: state.source };
  publish();
}

/**
 * Entry helper: background readiness check → modal when not ready.
 * Does not block the caller.
 */
export function gateDesktopUseFeature(
  source: DesktopUseReadinessModalSource = "generic",
  handlers?: {
    onReady?: () => void;
    /** Called when blocked (before the modal opens). Use to close popovers first. */
    onBlocked?: () => void;
  },
): void {
  // Lazy import to avoid circular deps with readiness.ts call sites
  void import("./readiness")
    .then(({ checkDesktopUseReadinessInBackground }) => {
      checkDesktopUseReadinessInBackground({
        onReady: () => handlers?.onReady?.(),
        onBlocked: (r) => {
          // Close covering UI first, then open dialog on a later turn so Radix
          // does not treat the Popover dismiss as Dialog outside-click.
          handlers?.onBlocked?.();
          openDesktopUseReadinessModalDeferred(r, source);
        },
      });
    })
    .catch(() => {
      /* dynamic import failed — open a conservative blocked modal */
      handlers?.onBlocked?.();
      openDesktopUseReadinessModalDeferred(
        {
          ready: false,
          reason: "unknown",
          engineInstalled: false,
          engineReady: false,
          accessibility: null,
          screenRecording: null,
          checkedAt: Date.now(),
          fromCache: false,
        },
        source,
      );
    });
}
