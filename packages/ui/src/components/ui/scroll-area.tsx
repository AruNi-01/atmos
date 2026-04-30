"use client";

import * as React from "react";
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentProps,
  type OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import type {
  EventListenerArgs,
  EventListeners,
  PartialOptions,
} from "overlayscrollbars";
import "overlayscrollbars/overlayscrollbars.css";

import { cn } from "../../lib/utils";

function invokeListener<K extends keyof EventListenerArgs>(
  listener: EventListeners[K] | undefined,
  args: EventListenerArgs[K],
) {
  if (!listener) return;
  const listeners = (Array.isArray(listener)
    ? listener
    : [listener]) as Array<
    (...listenerArgs: EventListenerArgs[K]) => void
  >;
  for (const fn of listeners) {
    fn(...args);
  }
}

/**
 * Default OverlayScrollbars options shared by every scrollable surface in the
 * web app. Individual call-sites can extend / override via the `options` prop.
 */
const DEFAULT_OS_OPTIONS: PartialOptions = {
  paddingAbsolute: true,
  scrollbars: {
    theme: "os-theme-atmos",
    visibility: "auto",
    autoHide: "leave",
    autoHideDelay: 800,
    dragScroll: true,
    clickScroll: true,
    pointers: ["mouse", "touch", "pen"],
  },
  overflow: {
    x: "scroll",
    y: "scroll",
  },
};

function mergeOptions(custom?: PartialOptions): PartialOptions {
  if (!custom) return DEFAULT_OS_OPTIONS;
  return {
    ...DEFAULT_OS_OPTIONS,
    ...custom,
    scrollbars: {
      ...DEFAULT_OS_OPTIONS.scrollbars,
      ...(custom.scrollbars ?? {}),
    },
    overflow: {
      ...DEFAULT_OS_OPTIONS.overflow,
      ...(custom.overflow ?? {}),
    },
  };
}

type CommonOverlayProps = Omit<
  OverlayScrollbarsComponentProps,
  "options" | "events" | "element" | "ref"
>;

interface OverlayScrollExtraProps {
  /** Tag of the root element. Defaults to `div`. */
  as?: OverlayScrollbarsComponentProps["element"];
  /** Override / extend OverlayScrollbars options. */
  options?: PartialOptions;
  /** OverlayScrollbars events. `initialized`/`destroyed` are composed with
   *  internal viewport ref-tracking, so consumers can still hook in. */
  events?: OverlayScrollbarsComponentProps["events"];
  /** Defer initialization to a browser idle period. Defaults to true. */
  defer?: OverlayScrollbarsComponentProps["defer"];
  /** Receives the OverlayScrollbarsComponent imperative ref. */
  componentRef?: React.Ref<OverlayScrollbarsComponentRef>;
  /** Receives the underlying scrollable viewport element. Useful for code
   *  that needs to read `scrollTop` / call `scrollIntoView` on the actual
   *  scroll container produced by OverlayScrollbars. */
  viewportRef?: React.Ref<HTMLElement | null>;
}

/* ----------------------------- ScrollArea ----------------------------- */

export interface ScrollAreaProps
  extends CommonOverlayProps,
    OverlayScrollExtraProps {
  className?: string;
  children?: React.ReactNode;
  /** Apply a soft mask fade on the edges where content overflows. Kept for
   *  API compatibility with the previous base-ui ScrollArea. */
  scrollFade?: boolean;
  /** Reserve gutter space for the scrollbar so content doesn't shift. Kept
   *  for API compatibility with the previous base-ui ScrollArea. */
  scrollbarGutter?: boolean;
}

function useViewportRefSync(
  ref: React.Ref<HTMLElement | null> | undefined,
) {
  const lastViewportRef = React.useRef<HTMLElement | null>(null);

  return React.useCallback(
    (value: HTMLElement | null) => {
      if (value === lastViewportRef.current) return;
      lastViewportRef.current = value;
      if (typeof ref === "function") {
        ref(value);
      } else if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<HTMLElement | null>).current = value;
      }
    },
    [ref],
  );
}

/**
 * Drop-in replacement for the old `ScrollArea` that renders OverlayScrollbars
 * under the hood so every scrollable surface in the app shares one consistent
 * scrollbar style. The component preserves the previous public API
 * (className, children, `scrollFade`, `scrollbarGutter`).
 */
export function ScrollArea({
  className,
  children,
  scrollFade = false,
  scrollbarGutter = false,
  options,
  events,
  defer = true,
  as = "div",
  componentRef,
  viewportRef,
  ...rest
}: ScrollAreaProps) {
  const setViewport = useViewportRefSync(viewportRef);

  const handleRef = React.useCallback(
    (value: OverlayScrollbarsComponentRef | null) => {
      if (typeof componentRef === "function") {
        componentRef(value);
      } else if (componentRef && typeof componentRef === "object") {
        (componentRef as React.MutableRefObject<OverlayScrollbarsComponentRef | null>).current =
          value;
      }
    },
    [componentRef],
  );

  const composedEvents = React.useMemo<OverlayScrollbarsComponentProps["events"]>(
    () => {
      const baseEvents: EventListeners | undefined =
        events && typeof events === "object" ? (events as EventListeners) : undefined;
      return {
        ...(baseEvents ?? {}),
        initialized: (instance) => {
          const viewport = instance.elements().viewport as HTMLElement | undefined;
          if (viewport) {
            // Maintain compatibility with code that selects the viewport via
            // [data-slot='scroll-area-viewport'] (e.g. WikiContent).
            viewport.dataset.slot = "scroll-area-viewport";
            setViewport(viewport);
          }
          invokeListener(baseEvents?.initialized, [instance]);
        },
        destroyed: (instance, canceled) => {
          setViewport(null);
          invokeListener(baseEvents?.destroyed, [instance, canceled]);
        },
      };
    },
    [events, setViewport],
  );

  return (
    <OverlayScrollbarsComponent
      ref={handleRef}
      element={as}
      defer={defer}
      data-slot="scroll-area"
      className={cn(
        "atmos-scroll-area size-full min-h-0",
        scrollFade && "atmos-scroll-area--fade",
        scrollbarGutter && "atmos-scroll-area--gutter",
        className,
      )}
      options={mergeOptions(options)}
      events={composedEvents}
      {...rest}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}

/* ----------------------------- ScrollBar ----------------------------- */

/**
 * Compatibility shim. The previous base-ui implementation rendered explicit
 * `ScrollBar` children; OverlayScrollbars renders its own scrollbars
 * automatically, so this is a no-op kept around to avoid breaking imports.
 */
export function ScrollBar(_props: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return null;
}

/* ----------------------------- OverlayScroll ----------------------------- */

export interface OverlayScrollProps
  extends CommonOverlayProps,
    OverlayScrollExtraProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Lightweight wrapper around OverlayScrollbarsComponent for places that used
 * raw `overflow-*-auto` divs. Unlike `ScrollArea`, this wrapper does not
 * enforce `size-full` or `min-h-0`, so it can be dropped into existing
 * layouts that already control sizing on the parent.
 */
export function OverlayScroll({
  className,
  children,
  options,
  events,
  defer = true,
  as = "div",
  componentRef,
  viewportRef,
  ...rest
}: OverlayScrollProps) {
  const setViewport = useViewportRefSync(viewportRef);

  const handleRef = React.useCallback(
    (value: OverlayScrollbarsComponentRef | null) => {
      if (typeof componentRef === "function") {
        componentRef(value);
      } else if (componentRef && typeof componentRef === "object") {
        (componentRef as React.MutableRefObject<OverlayScrollbarsComponentRef | null>).current =
          value;
      }
    },
    [componentRef],
  );

  const composedEvents = React.useMemo<OverlayScrollbarsComponentProps["events"]>(
    () => {
      const baseEvents: EventListeners | undefined =
        events && typeof events === "object" ? (events as EventListeners) : undefined;
      return {
        ...(baseEvents ?? {}),
        initialized: (instance) => {
          const viewport = instance.elements().viewport as HTMLElement | undefined;
          if (viewport) {
            viewport.dataset.slot = "scroll-area-viewport";
            setViewport(viewport);
          }
          invokeListener(baseEvents?.initialized, [instance]);
        },
        destroyed: (instance, canceled) => {
          setViewport(null);
          invokeListener(baseEvents?.destroyed, [instance, canceled]);
        },
      };
    },
    [events, setViewport],
  );

  return (
    <OverlayScrollbarsComponent
      ref={handleRef}
      element={as}
      defer={defer}
      data-slot="overlay-scroll"
      className={cn("atmos-scroll-area", className)}
      options={mergeOptions(options)}
      events={composedEvents}
      {...rest}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}

export type { OverlayScrollbarsComponentRef };
