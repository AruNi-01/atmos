import { EASE_OUT } from "@workspace/ui/lib/ease";

/** Center → dock. Critically damped feel, no bounce. */
export const COMPOSER_DOCK_MS = 420;
/** Dock → center. Slightly longer so chrome leaves first. */
export const COMPOSER_UNDOCK_MS = 470;
export const COMPOSER_DOCK_EASE = EASE_OUT;
/** Hero rest is a few pixels below true center. */
export const COMPOSER_HERO_Y_BIAS = 8;

/** Dock progress 0..1 windows for staged chrome (send / center → bottom). */
export const DOCK_TRANSCRIPT = { start: 0.2, end: 0.65 } as const;
export const DOCK_LOGO = { start: 0.55, end: 0.78 } as const;
/** Return trip windows (bottom → center). */
export const UNDOCK_TRANSCRIPT = { start: 0, end: 0.25 } as const;
export const UNDOCK_LOGO = { start: 0.5, end: 0.95 } as const;

export type ComposerDockChrome = {
  opacity: number;
  y: number;
  delay: number;
  duration: number;
};

function rangeTween(
  range: { start: number; end: number },
  durationMs: number,
): { delay: number; duration: number } {
  const span = Math.max(0, range.end - range.start);
  return {
    delay: (range.start * durationMs) / 1000,
    duration: (span * durationMs) / 1000,
  };
}

/**
 * TranslateY that lifts a bottom-docked composer stack to vertical center.
 * Negative moves up. Layout slot stays the docked bottom; only paint origin changes.
 */
export function heroComposerOffset(
  columnHeight: number,
  stackHeight: number,
  bias = COMPOSER_HERO_Y_BIAS,
): number {
  if (columnHeight <= 0 || stackHeight <= 0) return 0;
  if (stackHeight >= columnHeight) return 0;
  const dockedTop = columnHeight - stackHeight;
  const heroTop = (columnHeight - stackHeight) / 2 + bias;
  return heroTop - dockedTop;
}

export function composerDockDurationMs(docked: boolean): number {
  return docked ? COMPOSER_DOCK_MS : COMPOSER_UNDOCK_MS;
}

export function composerDockMotion(docked: boolean, reduceMotion: boolean): {
  yKey: "hero" | "dock";
  duration: number;
  ease: typeof COMPOSER_DOCK_EASE;
} {
  return {
    yKey: docked ? "dock" : "hero",
    duration: reduceMotion ? 0 : composerDockDurationMs(docked) / 1000,
    ease: COMPOSER_DOCK_EASE,
  };
}

export function composerLogoChrome(docked: boolean, reduceMotion: boolean): ComposerDockChrome {
  if (reduceMotion) {
    return { opacity: docked ? 0 : 1, y: 0, delay: 0, duration: 0 };
  }
  const tween = docked
    ? rangeTween(DOCK_LOGO, COMPOSER_DOCK_MS)
    : rangeTween(UNDOCK_LOGO, COMPOSER_UNDOCK_MS);
  return {
    opacity: docked ? 0 : 1,
    y: docked ? -8 : 0,
    delay: tween.delay,
    duration: tween.duration,
  };
}

export function composerTranscriptChrome(docked: boolean, reduceMotion: boolean): ComposerDockChrome {
  if (reduceMotion) {
    return { opacity: docked ? 1 : 0, y: 0, delay: 0, duration: 0 };
  }
  const tween = docked
    ? rangeTween(DOCK_TRANSCRIPT, COMPOSER_DOCK_MS)
    : rangeTween(UNDOCK_TRANSCRIPT, COMPOSER_UNDOCK_MS);
  return {
    opacity: docked ? 1 : 0,
    y: docked ? 0 : 8,
    delay: tween.delay,
    duration: tween.duration,
  };
}
