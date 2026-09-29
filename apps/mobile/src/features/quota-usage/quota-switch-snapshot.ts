export function mergeQuotaSwitchSnapshot<T extends { id: string; switch_enabled: boolean }>(
  current: readonly T[] | undefined,
  incoming: readonly T[],
  acceptIncoming: (providerId: string) => boolean,
): T[] {
  if (!current) return [...incoming];
  const local = new Map(current.map((provider) => [provider.id, provider.switch_enabled]));
  return incoming.map((provider) => {
    if (acceptIncoming(provider.id)) return provider;
    const enabled = local.get(provider.id);
    return enabled === undefined ? provider : { ...provider, switch_enabled: enabled };
  });
}
