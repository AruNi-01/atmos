/** The scroll pill and card pills fade, and their slot width, over this long. Reduced Motion snaps. */
export const SCROLL_PILL_SLOT_MS = 180;

/**
 * Space after a pill. It lives inside that pill's slot, so the next control
 * slides with the width and a closed slot leaves no gap.
 */
export const SCROLL_PILL_SLOT_GAP = 8;

/** Open slot width. A hidden pill is 0. Pass `0` for the last card so it has no trailing hole. */
export function scrollPillSlotWidth(pillWidth: number, gap = SCROLL_PILL_SLOT_GAP): number {
  if (pillWidth <= 0) return 0;
  return pillWidth + gap;
}

export type PillPresence<T extends { id: string }> = T & { visible: boolean };

/**
 * Keep exiting pills mounted, in place, until their width animation finishes.
 * Incoming order wins. A pill that left the list stays where it was and is marked hidden.
 */
export function reconcilePillPresence<T extends { id: string }>(
  current: readonly PillPresence<T>[],
  incoming: readonly T[],
): PillPresence<T>[] {
  const incomingIds = new Set(incoming.map((pill) => pill.id));
  const result: PillPresence<T>[] = incoming.map((pill) => ({ ...pill, visible: true }));
  const indexById = new Map(result.map((pill, index) => [pill.id, index]));
  let cursor = 0;
  for (const pill of current) {
    if (incomingIds.has(pill.id)) {
      cursor = (indexById.get(pill.id) ?? cursor) + 1;
      continue;
    }
    result.splice(cursor, 0, { ...pill, visible: false });
    for (const [id, index] of indexById) {
      if (index >= cursor) indexById.set(id, index + 1);
    }
    indexById.set(pill.id, cursor);
    cursor += 1;
  }
  return result;
}

/** Drop a pill after its close animation. A pill that came back (`visible`) stays. */
export function dropClosedPill<T extends { id: string }>(
  current: readonly PillPresence<T>[],
  id: string,
): readonly PillPresence<T>[] {
  const target = current.find((pill) => pill.id === id);
  if (!target || target.visible) return current;
  return current.filter((pill) => pill.id !== id);
}
