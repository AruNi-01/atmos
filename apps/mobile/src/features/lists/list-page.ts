/** Rows mounted for one filtered mobile list page. */
export const LIST_PAGE_SIZE = 20;

export type PagedBlock<T> = {
  key: string;
  items: readonly T[];
  /** Collapsed header. Emitted even when it has no row children. */
  keep?: boolean;
  /**
   * Closed section. The header (and any rows still mounted for the close
   * animation) stays, but those rows do not spend the window.
   */
  closed?: boolean;
};

export type StoredListWindow = {
  key: string;
  shown: number;
};

export function listWindow<T>(items: readonly T[], shown: number): T[] {
  if (shown <= 0) return [];
  return items.slice(0, shown);
}

export function openItemCount<T>(blocks: readonly PagedBlock<T>[]): number {
  return blocks.reduce((sum, block) => sum + (block.closed ? 0 : block.items.length), 0);
}

/**
 * A changed `resetKey` starts at one page, including a return to a key that
 * previously had a larger window. The same key keeps its stored size.
 */
export function reconcileListWindow(
  stored: StoredListWindow | undefined,
  resetKey: string,
): StoredListWindow {
  if (stored?.key === resetKey) return stored;
  return { key: resetKey, shown: LIST_PAGE_SIZE };
}

/**
 * Mount `shown` open rows. A kept empty block is a collapsed header and does
 * not spend the window. An open block past the window is omitted entirely.
 */
export function pageBlocks<T, B extends PagedBlock<T>>(blocks: readonly B[], shown: number): B[] {
  let remaining = Math.max(0, shown);
  const visible: B[] = [];
  for (const block of blocks) {
    if (block.closed) {
      visible.push(block);
      continue;
    }
    if (block.items.length === 0) {
      if (block.keep) visible.push(block);
      continue;
    }
    if (remaining <= 0) continue;
    const items = block.items.slice(0, remaining);
    remaining -= items.length;
    visible.push({ ...block, items });
  }
  return visible;
}

export function nextListWindow(input: {
  shown: number;
  loaded: number;
  hasNextPage: boolean;
  page?: number;
}): { shown: number; fetch: boolean } {
  const page = input.page ?? LIST_PAGE_SIZE;
  const shown = Math.max(0, input.shown);
  const loaded = Math.max(0, input.loaded);
  if (loaded > shown) {
    return { shown: Math.min(loaded, shown + page), fetch: false };
  }
  if (!input.hasNextPage) return { shown, fetch: false };
  if (loaded >= shown) return { shown: shown + page, fetch: true };
  return { shown, fetch: true };
}
