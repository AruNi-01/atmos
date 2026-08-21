"use client";

import { flushSync } from "react-dom";

export const CENTER_SPACE_SLIDE_MS = 260;
export type CenterSpaceSlideDirection = "forward" | "back";

const CARD_VT_NAME = "center-space-card";

type ViewTransitionLike = {
  finished: Promise<void>;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function startViewTransition(update: () => void): ViewTransitionLike | null {
  if (typeof document === "undefined") return null;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => ViewTransitionLike;
  };
  if (typeof doc.startViewTransition !== "function") return null;
  return doc.startViewTransition(update);
}

function visibleCenterCards(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-center-stage-card]"),
  ).filter((card) => card.getClientRects().length > 0);
}

function markCenterCardForSlide(on: boolean): HTMLElement[] {
  const cards = visibleCenterCards().slice(0, 1);
  for (const card of cards) {
    if (on) card.style.viewTransitionName = CARD_VT_NAME;
    else card.style.viewTransitionName = "";
  }
  return cards;
}

/**
 * Snapshot the whole center card and crossfade it (shrink out / grow in).
 * `update` must synchronously commit the incoming space (use Zustand + DOM).
 */
export function runCenterSpaceSlide(
  direction: CenterSpaceSlideDirection,
  update: () => void,
): Promise<void> {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    update();
    return Promise.resolve();
  }

  const cards = markCenterCardForSlide(true);
  if (cards.length === 0) {
    update();
    return Promise.resolve();
  }
  document.documentElement.setAttribute("data-center-space-slide", direction);

  const clear = () => {
    document.documentElement.removeAttribute("data-center-space-slide");
    for (const card of cards) card.style.viewTransitionName = "";
  };

  const transition = startViewTransition(() => {
    flushSync(update);
  });
  if (!transition) {
    update();
    clear();
    return Promise.resolve();
  }
  return transition.finished.then(clear, clear);
}
