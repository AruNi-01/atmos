import type { ReactNode } from "react";

/** Critically damped present/dismiss (~350ms, no bounce) per apple-design. */
export const POPOVER_PRESENT_ANIMATION = {
  type: "spring" as const,
  duration: 350,
  bounce: 0,
};

export type IosPopoverDirection = "top" | "bottom" | "leading" | "trailing" | "any" | "none";
export type IosPopoverTriggerKind = "tap" | "longPress";

export type IosPopoverProps = {
  children: ReactNode;
  direction?: IosPopoverDirection;
  trigger?: IosPopoverTriggerKind;
};
