"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const OVERLAY_CANDIDATE_SELECTOR = [
  "[data-atmos-native-surface-overlay]",
  "[data-slot=\"dialog-overlay\"]",
  "[data-slot=\"dialog-content\"]",
  "[data-slot=\"sheet-overlay\"]",
  "[data-slot=\"sheet-content\"]",
  "[data-slot=\"drawer-backdrop\"]",
  "[data-slot=\"drawer-content\"]",
  "[data-slot=\"drawer-popup\"]",
  "[data-slot=\"popover-content\"]",
  "[data-slot=\"dropdown-menu-content\"]",
  "[data-slot=\"context-menu-content\"]",
  "[data-slot=\"select-content\"]",
  "[data-radix-popper-content-wrapper]",
  "[role=\"dialog\"]",
  "[aria-modal=\"true\"]",
].join(", ");

const TOOLTIP_CANDIDATE_SELECTOR = [
  "[data-slot=\"tooltip-content\"]",
  "[role=\"tooltip\"]",
].join(", ");

const RESTORE_DELAY_MS = 140;
const MIN_RECT_SIZE = 2;

type UseNativePreviewOcclusionParams = {
  enabled: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  ignoredRootRef?: RefObject<HTMLElement | null>;
};

function hasVisibleRect(rect: DOMRect): boolean {
  return rect.width >= MIN_RECT_SIZE && rect.height >= MIN_RECT_SIZE;
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isTooltipCandidate(element: Element): boolean {
  if (element.matches(TOOLTIP_CANDIDATE_SELECTOR)) return true;
  return Boolean(element.querySelector(TOOLTIP_CANDIDATE_SELECTOR));
}

function isVisibleOverlayCandidate(element: Element, ignoredRoot: HTMLElement | null): boolean {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
  const isNativeSurfaceOverlay = element.hasAttribute("data-atmos-native-surface-overlay");
  if (ignoredRoot?.contains(element)) return false;
  if (element.closest("[data-atmos-ignore-native-surface-occlusion]")) return false;
  if (isTooltipCandidate(element)) return false;
  if (element.getAttribute("data-state") === "closed") return false;
  if (!isNativeSurfaceOverlay && element.getAttribute("aria-hidden") === "true") return false;

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (Number(style.opacity) <= 0) return false;

  return hasVisibleRect(element.getBoundingClientRect());
}

function getVisibleOverlayCandidates(ignoredRoot: HTMLElement | null): Element[] {
  return Array.from(document.querySelectorAll(OVERLAY_CANDIDATE_SELECTOR))
    .filter((element) => isVisibleOverlayCandidate(element, ignoredRoot));
}

type OcclusionSnapshot = {
  candidates: Element[];
  isOccluded: boolean;
};

export function useNativePreviewOcclusion({
  enabled,
  surfaceRef,
  ignoredRootRef,
}: UseNativePreviewOcclusionParams): boolean {
  const [isOccluded, setIsOccluded] = useState(false);
  const isOccludedRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let disposed = false;
    let rafId = 0;
    let restoreTimeoutId = 0;
    let currentOccluded = isOccludedRef.current;
    let isFirstCheck = true;
    const observedCandidates = new Set<Element>();
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => scheduleCheck())
      : null;

    const commitOcclusion = (nextOccluded: boolean) => {
      currentOccluded = nextOccluded;
      isOccludedRef.current = nextOccluded;
      setIsOccluded(nextOccluded);
    };

    const readOcclusionSnapshot = (): OcclusionSnapshot => {
      const surface = surfaceRef.current;
      const surfaceRect = surface?.getBoundingClientRect();
      if (!surface || !surfaceRect || !hasVisibleRect(surfaceRect)) {
        return { candidates: [], isOccluded: false };
      }

      const candidates = getVisibleOverlayCandidates(ignoredRootRef?.current ?? null);
      return {
        candidates,
        isOccluded: candidates.some((candidate) => rectsIntersect(surfaceRect, candidate.getBoundingClientRect())),
      };
    };

    const applyOcclusion = (nextOccluded: boolean, settleImmediately = false) => {
      if (nextOccluded) {
        window.clearTimeout(restoreTimeoutId);
        restoreTimeoutId = 0;
        if (!currentOccluded) {
          commitOcclusion(true);
        }
        return;
      }

      if (!currentOccluded || restoreTimeoutId) return;
      if (settleImmediately) {
        commitOcclusion(false);
        return;
      }
      restoreTimeoutId = window.setTimeout(() => {
        restoreTimeoutId = 0;
        if (disposed || !currentOccluded) return;
        const snapshot = readOcclusionSnapshot();
        syncCandidateResizeObservers(snapshot.candidates);
        if (snapshot.isOccluded) return;
        commitOcclusion(false);
      }, RESTORE_DELAY_MS);
    };

    const syncCandidateResizeObservers = (candidates: Element[]) => {
      if (!resizeObserver) return;

      const nextCandidates = new Set(candidates);
      observedCandidates.forEach((candidate) => {
        if (!nextCandidates.has(candidate)) {
          resizeObserver.unobserve(candidate);
          observedCandidates.delete(candidate);
        }
      });
      nextCandidates.forEach((candidate) => {
        if (!observedCandidates.has(candidate)) {
          resizeObserver.observe(candidate);
          observedCandidates.add(candidate);
        }
      });
    };

    const checkOcclusion = () => {
      rafId = 0;
      if (disposed) return;

      const settleImmediately = isFirstCheck;
      isFirstCheck = false;
      const snapshot = readOcclusionSnapshot();
      syncCandidateResizeObservers(snapshot.candidates);
      applyOcclusion(snapshot.isOccluded, settleImmediately);
    };

    function scheduleCheck() {
      if (disposed || rafId) return;
      rafId = window.requestAnimationFrame(checkOcclusion);
    }

    const surface = surfaceRef.current;
    if (surface && resizeObserver) {
      resizeObserver.observe(surface);
    }

    const mutationObserver = new MutationObserver(scheduleCheck);
    if (document.body) {
      mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: [
          "aria-hidden",
          "aria-modal",
          "class",
          "data-atmos-native-surface-overlay",
          "data-state",
          "data-slot",
          "hidden",
          "role",
          "style",
        ],
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("resize", scheduleCheck);
    window.addEventListener("scroll", scheduleCheck, true);
    window.addEventListener("pointermove", scheduleCheck, true);
    window.addEventListener("transitionend", scheduleCheck, true);
    window.addEventListener("animationend", scheduleCheck, true);
    scheduleCheck();

    return () => {
      disposed = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.clearTimeout(restoreTimeoutId);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleCheck);
      window.removeEventListener("scroll", scheduleCheck, true);
      window.removeEventListener("pointermove", scheduleCheck, true);
      window.removeEventListener("transitionend", scheduleCheck, true);
      window.removeEventListener("animationend", scheduleCheck, true);
    };
  }, [enabled, ignoredRootRef, surfaceRef]);

  return enabled ? isOccluded : false;
}
