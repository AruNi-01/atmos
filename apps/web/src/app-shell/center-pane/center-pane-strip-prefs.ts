/**
 * Tab-strip prefs are per context. React `tabStripOrder` is only valid when it
 * is tagged with the same context being ensured/seeded; otherwise read that
 * context's stored pref. Untagged or cross-context React state must not migrate
 * or seed another workspace.
 */

const EMPTY_STRIP_ORDER: string[] = [];

export function resolveStripOrderForContext(input: {
  contextId: string | null | undefined;
  reactStripContextId: string | null | undefined;
  reactStripOrder: readonly string[];
  storedStripOrder: readonly string[];
}): readonly string[] {
  if (!input.contextId) return EMPTY_STRIP_ORDER;
  if (input.reactStripContextId === input.contextId) {
    return input.reactStripOrder;
  }
  return input.storedStripOrder;
}
