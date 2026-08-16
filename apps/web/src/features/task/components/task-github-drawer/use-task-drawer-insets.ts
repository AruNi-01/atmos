"use client";

import React from "react";
import { APP_FOOTER_HEIGHT_PX } from "@/app-shell/sidebar-layout-constants";

const GAP_PX = 8;

export type TaskDrawerInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  gap: number;
};

/**
 * Keep the Task GitHub drawer inside the center stage only:
 * never cover the app header, footer, or sidebars.
 *
 * Geometry is measured from `[data-panel-id="root-center-stage"]` (with a
 * small outer gap), so the sheet tracks the live center panel bounds.
 */
export function useTaskDrawerInsets(): TaskDrawerInsets {
  const [insets, setInsets] = React.useState<TaskDrawerInsets>({
    left: GAP_PX,
    top: GAP_PX,
    right: GAP_PX,
    bottom: GAP_PX,
    gap: GAP_PX,
  });

  React.useEffect(() => {
    let frame = 0;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const center =
          document.querySelector<HTMLElement>('[data-panel-id="root-center-stage"]') ??
          document.querySelector<HTMLElement>("#root-center-stage");

        if (!center) {
          // Fallback: header h-12 (48) + shared app footer + gap.
          setInsets({
            left: GAP_PX,
            top: 48 + GAP_PX,
            right: GAP_PX,
            bottom: APP_FOOTER_HEIGHT_PX + GAP_PX,
            gap: GAP_PX,
          });
          return;
        }

        const rect = center.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        setInsets({
          left: Math.max(GAP_PX, Math.round(rect.left) + GAP_PX),
          top: Math.max(GAP_PX, Math.round(rect.top) + GAP_PX),
          right: Math.max(GAP_PX, Math.round(vw - rect.right) + GAP_PX),
          bottom: Math.max(GAP_PX, Math.round(vh - rect.bottom) + GAP_PX),
          gap: GAP_PX,
        });
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    const center =
      document.querySelector<HTMLElement>('[data-panel-id="root-center-stage"]') ??
      document.querySelector<HTMLElement>("#root-center-stage");
    if (center) observer.observe(center);

    // Side panels / layout root reflow change center bounds.
    const layoutRoot = document.querySelector<HTMLElement>("[data-panel-group]");
    if (layoutRoot) observer.observe(layoutRoot);

    const left =
      document.querySelector<HTMLElement>('[data-panel-id="root-left-sidebar"]') ??
      document.querySelector<HTMLElement>("#root-left-sidebar");
    if (left) observer.observe(left);

    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return insets;
}
