/** Resolve the ServerHub stub, optionally pinning first-create placement. */

export const HUB_LOCATION_HINTS = [
  "wnam",
  "enam",
  "sam",
  "weur",
  "eeur",
  "apac",
  "oc",
  "afr",
  "me",
] as const;

export type HubLocationHint = (typeof HUB_LOCATION_HINTS)[number];

export type ServerHubBinding = {
  SERVER_HUB: DurableObjectNamespace;
  RELAY_HUB_LOCATION_HINT?: string;
};

export function parseHubLocationHint(raw: string | undefined | null): HubLocationHint | null {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  return (HUB_LOCATION_HINTS as readonly string[]).includes(value)
    ? (value as HubLocationHint)
    : null;
}

/** One hub instance per Computer id. The placement hint is used only on first create. */
export function getServerHub(env: ServerHubBinding, serverId: string) {
  const id = env.SERVER_HUB.idFromName(serverId);
  const raw = env.RELAY_HUB_LOCATION_HINT;
  const hint = parseHubLocationHint(raw);
  if (raw?.trim() && !hint) {
    console.warn(
      "RELAY_HUB_LOCATION_HINT ignored: unknown region token (use wnam, enam, sam, weur, eeur, apac, oc, afr, me)",
    );
  }
  if (hint) {
    return env.SERVER_HUB.get(id, { locationHint: hint });
  }
  return env.SERVER_HUB.get(id);
}
