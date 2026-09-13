"use client";

import { useLayoutEffect, useRef, type Ref } from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "../../lib/utils";
import { applyStickyFadeInsets } from "./scroll-area-fade";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

function ScrollArea({
  className,
  children,
  scrollFade = false,
  scrollbarGutter = false,
  viewportClassName,
  viewportRef,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  scrollFade?: boolean;
  scrollbarGutter?: boolean;
  viewportClassName?: string;
  viewportRef?: Ref<HTMLDivElement>;
}) {
  const fadeViewportRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!scrollFade) return;
    const viewport = fadeViewportRef.current;
    if (!viewport) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      applyStickyFadeInsets(viewport);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    viewport.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(viewport);
    const mutation = new MutationObserver(schedule);
    mutation.observe(viewport, { childList: true, subtree: true });
    return () => {
      viewport.removeEventListener("scroll", schedule);
      resize.disconnect();
      mutation.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollFade]);

  return (
    <ScrollAreaPrimitive.Root
      className={cn("flex size-full min-h-0 flex-col", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={(node) => {
          fadeViewportRef.current = node;
          assignRef(viewportRef, node);
        }}
        className={cn(
          "min-h-0 min-w-0 flex-1 rounded-[inherit] outline-none transition-shadows focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-has-overflow-x:overscroll-x-contain",
          scrollbarGutter &&
          "data-has-overflow-y:pe-2.5 data-has-overflow-x:pb-2.5",
          viewportClassName,
        )}
        data-scroll-fade={scrollFade ? "" : undefined}
        data-slot="scroll-area-viewport"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  style,
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  const horizontal = orientation === "horizontal";
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        "z-50 opacity-0 transition-opacity delay-300 pointer-events-none",
        "data-hovering:pointer-events-auto data-scrolling:pointer-events-auto",
        "data-hovering:opacity-100 data-scrolling:opacity-100",
        "data-hovering:delay-0 data-scrolling:delay-0",
        "data-hovering:duration-100 data-scrolling:duration-100",
        "hidden",
        horizontal
          ? "relative mx-1 mb-1 mt-0.5 h-1.5 w-auto flex-col data-[has-overflow-x]:flex"
          : "absolute m-1 w-1.5 data-[has-overflow-y]:flex",
        className,
      )}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
      style={
        horizontal
          ? {
              position: "relative",
              top: "auto",
              bottom: "auto",
              insetInlineStart: "auto",
              insetInlineEnd: "auto",
              ...style,
            }
          : style
      }
    >
      <ScrollAreaPrimitive.Thumb
        className="relative flex-1 rounded-full bg-foreground/20"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
