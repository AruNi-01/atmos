export type QuotaSwitchListItem = {
  id: string;
  label: string;
  enabled: boolean;
  switch_enabled: boolean;
};

/**
 * Provider switch-sheet order shared by the web aggregate popover and mobile settings.
 * Detected providers first, then switch-enabled, then a saved drag order, then label.
 * An empty saved order leaves alphabetical order inside each group.
 */
export function sortQuotaProvidersForSwitchList<T extends QuotaSwitchListItem>(
  providers: readonly T[],
  providerOrder: readonly string[] = [],
): T[] {
  const orderIndex = new Map(providerOrder.map((id, index) => [id, index]));
  return [...providers].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    if (left.switch_enabled !== right.switch_enabled) return left.switch_enabled ? -1 : 1;
    const leftOrder = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.label.localeCompare(right.label);
  });
}
