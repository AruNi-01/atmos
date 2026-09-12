"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { cn } from "@workspace/ui";

import {
  AUTOMATION_EDITOR_ZOOM_MS,
  applyRelativeEditorBox,
  automationEditorZoomTransition,
  boxRelativeToClip,
  fillVisibleClipBox,
  queryAutomationEditorExpandTarget,
  rectToEditorBox,
  type AutomationEditorBox,
} from "@/features/automations/lib/automation-editor-zoom";

type ExpandContextValue = {
  host: HTMLElement | null;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
};

type ExpandPhase = "idle" | "expanded" | "collapsing";

const AutomationEditorExpandContext = React.createContext<ExpandContextValue | null>(
  null,
);

function placeholderBox(placeholder: HTMLElement, clip: HTMLElement): AutomationEditorBox {
  return boxRelativeToClip(rectToEditorBox(placeholder.getBoundingClientRect()), clip);
}

export function AutomationEditorExpandHost({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  return (
    <div
      ref={setHost}
      data-automation-editor-expand-host=""
      className={cn("relative", className)}
    >
      <AutomationEditorExpandContext.Provider
        value={{ host, activeId, setActiveId }}
      >
        {children}
      </AutomationEditorExpandContext.Provider>
    </div>
  );
}

export function useAutomationEditorExpand(id: string, enabled: boolean) {
  const ctx = React.useContext(AutomationEditorExpandContext);
  const placeholderRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const originRef = React.useRef<AutomationEditorBox | null>(null);
  const expandPlayedRef = React.useRef(false);
  const collapsePlayedRef = React.useRef(false);
  const collapseTimerRef = React.useRef<number | null>(null);
  const [clip, setClip] = React.useState<HTMLElement | null>(null);
  const [phase, setPhase] = React.useState<ExpandPhase>("idle");
  const reduceMotion = Boolean(useReducedMotion());

  const host = ctx?.host ?? null;
  const activeId = ctx?.activeId ?? null;
  const presented = phase !== "idle";
  const collapsing = phase === "collapsing";

  const clearCollapseTimer = React.useCallback(() => {
    if (collapseTimerRef.current == null) return;
    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }, []);

  const finishCollapse = React.useCallback(() => {
    clearCollapseTimer();
    expandPlayedRef.current = false;
    collapsePlayedRef.current = false;
    originRef.current = null;
    setPhase("idle");
    if (ctx?.activeId === id) ctx.setActiveId(null);
  }, [clearCollapseTimer, ctx, id]);

  React.useLayoutEffect(() => {
    if (!enabled) return;
    const target = queryAutomationEditorExpandTarget(placeholderRef.current ?? host);
    if (target) setClip(target);
  }, [enabled, host]);

  const expand = React.useCallback(() => {
    if (!enabled || phase !== "idle" || !clip) return;
    const originEl = boxRef.current ?? placeholderRef.current;
    originRef.current = originEl
      ? rectToEditorBox(originEl.getBoundingClientRect())
      : null;
    expandPlayedRef.current = false;
    collapsePlayedRef.current = false;
    ctx?.setActiveId(id);
    setPhase("expanded");
  }, [clip, ctx, enabled, id, phase]);

  const collapse = React.useCallback(() => {
    if (!enabled || phase === "idle") return;
    if (reduceMotion || phase === "collapsing") {
      finishCollapse();
      return;
    }
    collapsePlayedRef.current = false;
    setPhase("collapsing");
  }, [enabled, finishCollapse, phase, reduceMotion]);

  React.useLayoutEffect(() => {
    if (phase !== "idle" || !clip) return;
    const box = boxRef.current;
    const placeholder = placeholderRef.current;
    if (!box || !placeholder) return;

    const sync = () => {
      const liveBox = boxRef.current;
      const livePlaceholder = placeholderRef.current;
      if (!liveBox || !livePlaceholder) return;
      liveBox.style.transition = "";
      liveBox.style.willChange = "";
      applyRelativeEditorBox(liveBox, placeholderBox(livePlaceholder, clip));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(placeholder);
    observer.observe(clip);
    clip.addEventListener("scroll", sync, true);
    host?.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      observer.disconnect();
      clip.removeEventListener("scroll", sync, true);
      host?.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [clip, host, phase]);

  React.useLayoutEffect(() => {
    if (phase === "idle") return;
    const box = boxRef.current;
    if (!box || !clip) return;

    if (reduceMotion) {
      if (phase === "expanded") applyRelativeEditorBox(box, fillVisibleClipBox(clip));
      return;
    }

    if (phase === "expanded") {
      if (expandPlayedRef.current || !originRef.current) return;
      expandPlayedRef.current = true;
      const from = boxRelativeToClip(originRef.current, clip);
      box.style.willChange = "top, left, width, height, border-color";
      box.style.transition = "none";
      applyRelativeEditorBox(box, from);
      void box.getBoundingClientRect();
      box.style.transition = automationEditorZoomTransition();
      applyRelativeEditorBox(box, fillVisibleClipBox(clip));
      return;
    }

    if (phase !== "collapsing" || collapsePlayedRef.current) return;
    collapsePlayedRef.current = true;
    const placeholder = placeholderRef.current;
    if (!placeholder) {
      finishCollapse();
      return;
    }
    const from = boxRelativeToClip(rectToEditorBox(box.getBoundingClientRect()), clip);
    const to = placeholderBox(placeholder, clip);
    box.style.willChange = "top, left, width, height, border-color";
    box.style.transition = "none";
    applyRelativeEditorBox(box, from);
    void box.getBoundingClientRect();
    box.style.transition = automationEditorZoomTransition();
    applyRelativeEditorBox(box, to);
    clearCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      finishCollapse();
    }, AUTOMATION_EDITOR_ZOOM_MS + 80);
  }, [clearCollapseTimer, clip, finishCollapse, phase, reduceMotion]);

  React.useEffect(() => {
    if (!enabled) return;
    if (activeId != null && activeId !== id && presented) {
      finishCollapse();
    }
  }, [activeId, enabled, finishCollapse, id, presented]);

  React.useEffect(() => {
    if (!presented || !host) return;
    const previous = host.style.overflow;
    host.style.overflow = "hidden";
    return () => {
      host.style.overflow = previous;
    };
  }, [host, presented]);

  React.useEffect(() => {
    if (!presented || !clip) return;
    const top = clip.scrollTop;
    const left = clip.scrollLeft;
    const freeze = () => {
      if (clip.scrollTop !== top) clip.scrollTop = top;
      if (clip.scrollLeft !== left) clip.scrollLeft = left;
    };
    clip.addEventListener("scroll", freeze);
    return () => clip.removeEventListener("scroll", freeze);
  }, [clip, presented]);

  React.useEffect(() => {
    if (!presented) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        collapse();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapse, presented]);

  React.useEffect(() => () => clearCollapseTimer(), [clearCollapseTimer]);

  const render = React.useCallback(
    (node: React.ReactNode) => {
      if (!enabled || !clip) return node;
      return createPortal(node, clip);
    },
    [clip, enabled],
  );

  return {
    placeholderRef,
    boxRef,
    clip,
    expanded: presented,
    collapsing,
    covered: Boolean(enabled && activeId != null && activeId !== id),
    expand,
    collapse,
    toggle: presented ? collapse : expand,
    render,
  };
}

export function useAutomationEditorExpandHost(): HTMLElement | null {
  return React.useContext(AutomationEditorExpandContext)?.host ?? null;
}
