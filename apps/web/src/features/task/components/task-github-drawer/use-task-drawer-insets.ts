"use client";

import React from "react";
import {
  APP_FOOTER_HEIGHT_PX,
  APP_HEADER_HEIGHT_PX,
  CENTER_STAGE_BODY_ATTR,
  CENTER_STAGE_CARD_ATTR,
  CENTER_STAGE_GUTTER_X_PX,
  CENTER_STAGE_GUTTER_Y_PX,
} from "@/app-shell/sidebar-layout-constants";

const GAP_PX = 8;
const CARD_SELECTOR = `[${CENTER_STAGE_CARD_ATTR}]`;
const BODY_SELECTOR = `[${CENTER_STAGE_BODY_ATTR}]`;

export type TaskDrawerInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  gap: number;
};

function queryCenterStageCard(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CARD_SELECTOR);
}

function queryCenterStageBody(): HTMLElement | null {
  return document.querySelector<HTMLElement>(BODY_SELECTOR);
}

function queryCenterStagePanel(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-panel-id="root-center-stage"]') ??
    document.querySelector<HTMLElement>("#root-center-stage")
  );
}

function insetsFromRect(
  rect: DOMRect,
  pad: { left?: number; top?: number; right?: number; bottom?: number } = {},
): TaskDrawerInsets {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: Math.max(0, Math.round(rect.left) + (pad.left ?? 0)),
    top: Math.max(0, Math.round(rect.top) + (pad.top ?? 0)),
    right: Math.max(0, Math.round(vw - rect.right) + (pad.right ?? 0)),
    bottom: Math.max(0, Math.round(vh - rect.bottom) + (pad.bottom ?? 0)),
    gap: GAP_PX,
  };
}

function fallbackInsets(): TaskDrawerInsets {
  return {
    left: CENTER_STAGE_GUTTER_X_PX,
    top: APP_HEADER_HEIGHT_PX + CENTER_STAGE_GUTTER_Y_PX,
    right: CENTER_STAGE_GUTTER_X_PX,
    bottom: APP_FOOTER_HEIGHT_PX + CENTER_STAGE_GUTTER_Y_PX,
    gap: GAP_PX,
  };
}

/**
 * Keep task / GitHub drawers inside the floating center-stage card.
 *
 * After the shell split, `root-center-stage` also contains the app footer.
 * Measuring the panel made the sheet overflow the card and cover the footer.
 * Prefer the visual card, then the column above the footer.
 */
export function useTaskDrawerInsets(): TaskDrawerInsets {
  const [insets, setInsets] = React.useState<TaskDrawerInsets>(fallbackInsets);

  React.useLayoutEffect(() => {
    let frame = 0;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = queryCenterStageCard();
        if (card) {
          setInsets(insetsFromRect(card.getBoundingClientRect()));
          return;
        }

        const body = queryCenterStageBody();
        if (body) {
          setInsets(
            insetsFromRect(body.getBoundingClientRect(), {
              left: CENTER_STAGE_GUTTER_X_PX,
              top: CENTER_STAGE_GUTTER_Y_PX,
              right: CENTER_STAGE_GUTTER_X_PX,
              bottom: CENTER_STAGE_GUTTER_Y_PX,
            }),
          );
          return;
        }

        const panel = queryCenterStagePanel();
        if (!panel) {
          setInsets(fallbackInsets());
          return;
        }

        setInsets(
          insetsFromRect(panel.getBoundingClientRect(), {
            left: CENTER_STAGE_GUTTER_X_PX,
            top: CENTER_STAGE_GUTTER_Y_PX,
            right: CENTER_STAGE_GUTTER_X_PX,
            bottom: APP_FOOTER_HEIGHT_PX + CENTER_STAGE_GUTTER_Y_PX,
          }),
        );
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    const card = queryCenterStageCard();
    const body = queryCenterStageBody();
    const panel = queryCenterStagePanel();
    if (card) observer.observe(card);
    if (body) observer.observe(body);
    if (panel) observer.observe(panel);

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
