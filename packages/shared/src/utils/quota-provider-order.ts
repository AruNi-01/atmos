export type QuotaSwitchListItem = {
  id: string;
  label: string;
  switch_enabled: boolean;
};

/**
 * Provider switch-sheet order shared by the web aggregate popover and mobile settings.
 * Switch-on providers first, then the saved `providerOrder`, then label.
 * Detection (`enabled`) is not a key. An empty saved order leaves alphabetical
 * order inside each switch group. `Array#sort` is stable.
 */
export function sortQuotaProvidersForSwitchList<T extends QuotaSwitchListItem>(
  providers: readonly T[],
  providerOrder: readonly string[] = [],
): T[] {
  const orderIndex = new Map(providerOrder.map((id, index) => [id, index]));
  return [...providers].sort((left, right) => {
    if (left.switch_enabled !== right.switch_enabled) return left.switch_enabled ? -1 : 1;
    const leftOrder = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.label.localeCompare(right.label);
  });
}
