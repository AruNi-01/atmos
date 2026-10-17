/**
 * TextMorph (`packages/ui/src/components/ui/text-morph.tsx`) fades each
 * character on this spring. The phone fades the whole plural unit instead.
 */
export const SCROLL_UNIT_SPRING = {
  damping: 18,
  mass: 0.3,
  stiffness: 280,
} as const;

/** Keep the previous unit so the two strings can cross-fade. A repeat holds. */
export function scrollUnitStack(
  next: string,
  previous: string,
): { current: string; outgoing: string | null } {
  if (next === previous) return { current: next, outgoing: null };
  return { current: next, outgoing: previous };
}
