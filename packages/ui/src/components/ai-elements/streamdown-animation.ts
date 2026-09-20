import type { AnimateOptions } from "streamdown";

/** Character-level reveal so large ACP chunks (including CJK) do not pop in as blocks. */
export const STREAMDOWN_STREAM_ANIMATION: AnimateOptions = {
  animation: "fadeIn",
  duration: 150,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  sep: "char",
  stagger: 12,
};

export function resolveStreamdownAnimated(
  animated: boolean | AnimateOptions | undefined,
  reducedMotion: boolean,
): false | AnimateOptions {
  if (reducedMotion || animated === false || animated == null) return false;
  if (animated === true) return STREAMDOWN_STREAM_ANIMATION;
  return { ...STREAMDOWN_STREAM_ANIMATION, ...animated };
}
