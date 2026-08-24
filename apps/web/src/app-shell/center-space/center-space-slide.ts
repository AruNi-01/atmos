"use client";

import { flushSync } from "react-dom";

export const CENTER_SPACE_SLIDE_MS = 320;
export type CenterSpaceSlideDirection = "forward" | "back";

/** In-place hop (new space / delete) — same element, content swap. */
const CARD_VT_NAME = "center-space-card";
/** Clicked fan card (old) → center stage (new). */
const INCOMING_VT_NAME = "center-space-incoming";
/** Current center stage; exists only in the old snapshot so it can shrink out. */
const OUTGOING_VT_NAME = "center-space-outgoing";

type ViewTransitionLike = {
  finished: Promise<void>;
};

export type CenterSpaceSlideOptions = {
  /** Fan card the user clicked. Incoming space expands from this rect. */
  fromCard?: HTMLElement | null;
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

function setVtName(el: HTMLElement | null | undefined, name: string): void {
  if (!el) return;
  el.style.viewTransitionName = name;
}

function clearVtName(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.style.viewTransitionName = "";
}

/**
 * Shared-element hop: old center shrinks out; the new space grows from
 * `fromCard` (header fan) into the center stage.
 * `update` must synchronously commit the incoming space (Zustand + DOM).
 */
export function runCenterSpaceSlide(
  direction: CenterSpaceSlideDirection,
  update: () => void,
  options?: CenterSpaceSlideOptions,
): Promise<void> {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    update();
    return Promise.resolve();
  }

  const fromCard = options?.fromCard ?? null;
  const outgoing = visibleCenterCards()[0] ?? null;
  if (!fromCard && !outgoing) {
    update();
    return Promise.resolve();
  }

  if (fromCard) {
    setVtName(fromCard, INCOMING_VT_NAME);
    if (outgoing) setVtName(outgoing, OUTGOING_VT_NAME);
  } else if (outgoing) {
    setVtName(outgoing, CARD_VT_NAME);
  }

  document.documentElement.setAttribute(
    "data-center-space-slide",
    fromCard ? "from-card" : direction,
  );

  const tagged = [fromCard, outgoing].filter((el): el is HTMLElement => Boolean(el));

  const clear = () => {
    document.documentElement.removeAttribute("data-center-space-slide");
    for (const el of tagged) clearVtName(el);
    for (const el of visibleCenterCards()) clearVtName(el);
  };

  const apply = () => {
    clearVtName(fromCard);
    flushSync(update);
    const incoming = visibleCenterCards()[0] ?? null;
    if (fromCard) setVtName(incoming, INCOMING_VT_NAME);
    else setVtName(incoming, CARD_VT_NAME);
    if (incoming && !tagged.includes(incoming)) tagged.push(incoming);
  };

  const transition = startViewTransition(apply);
  if (!transition) {
    update();
    clear();
    return Promise.resolve();
  }
  return transition.finished.then(clear, clear);
}
