"use client";

import { useLayoutEffect, useState } from "react";
import {
  applyStickyFadeInsets,
  stickyFadeItemFromElement,
  type StickyFadeItem,
} from "@workspace/ui";

function syncOverflowVars(element: HTMLElement) {
  const yStart = Math.max(0, element.scrollTop);
  const yEnd = Math.max(
    0,
    element.scrollHeight - element.clientHeight - element.scrollTop,
  );
  const xStart = Math.max(0, element.scrollLeft);
  const xEnd = Math.max(
    0,
    element.scrollWidth - element.clientWidth - element.scrollLeft,
  );
  element.style.setProperty("--scroll-area-overflow-y-start", `${yStart}px`);
  element.style.setProperty("--scroll-area-overflow-y-end", `${yEnd}px`);
  element.style.setProperty("--scroll-area-overflow-x-start", `${xStart}px`);
  element.style.setProperty("--scroll-area-overflow-x-end", `${xEnd}px`);
}

function readDiffStickyHeaders(viewport: HTMLElement): StickyFadeItem[] {
  const extras: StickyFadeItem[] = [];
  for (const host of viewport.querySelectorAll("diffs-container")) {
    const header = host.shadowRoot?.querySelector<HTMLElement>(
      "[data-diffs-header][data-sticky]",
    );
    const item = header ? stickyFadeItemFromElement(header) : null;
    if (item) extras.push(item);
  }
  for (const child of viewport.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains("sticky")) continue;
    if (getComputedStyle(child).position !== "sticky") continue;
    const item = stickyFadeItemFromElement(child);
    if (item) extras.push(item);
  }
  return extras;
}

export function attachScrollFade(element: HTMLElement): () => void {
  element.setAttribute("data-scroll-fade", "");
  let frame = 0;
  const update = () => {
    frame = 0;
    syncOverflowVars(element);
    applyStickyFadeInsets(element, readDiffStickyHeaders(element));
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(update);
  };
  update();
  element.addEventListener("scroll", schedule, { passive: true });
  const resize = new ResizeObserver(schedule);
  resize.observe(element);
  const mutation = new MutationObserver(schedule);
  mutation.observe(element, { childList: true, subtree: true });
  return () => {
    element.removeEventListener("scroll", schedule);
    resize.disconnect();
    mutation.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}

export function useScrollFadeRef<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  useLayoutEffect(() => {
    if (!element) return;
    return attachScrollFade(element);
  }, [element]);
  return setElement;
}
