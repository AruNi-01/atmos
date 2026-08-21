/**
 * Center spaces: named independent center mosaics inside one workspace/project.
 *
 * The default space keeps the host context id so existing keep-alive, terminal
 * persistence, and tab stores stay compatible. Extra spaces use a namespaced
 * paint id so their frames/tabs stay isolated and can remain mounted (warm).
 */

export const DEFAULT_CENTER_SPACE_ID = "main";
export const DEFAULT_CENTER_SPACE_NAME = "Default";
export const CENTER_SPACE_KEY_MARK = "::space::";
export const MAX_CENTER_SPACES_PER_HOST = 8;

const LEGACY_DEFAULT_SPACE_NAMES = new Set(["Space 1", "空间 1"]);

export function isExtraCenterSpaceKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.includes(CENTER_SPACE_KEY_MARK);
}

export function isLegacyDefaultSpaceName(name: string): boolean {
  return LEGACY_DEFAULT_SPACE_NAMES.has(name);
}

export type CenterSpaceRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** JPEG data URL captured from the center card. */
  thumbnailDataUrl?: string | null;
};

export type HostCenterSpaces = {
  spaces: CenterSpaceRecord[];
  activeSpaceId: string;
};

export function isDefaultCenterSpaceId(spaceId: string): boolean {
  return spaceId === DEFAULT_CENTER_SPACE_ID;
}

export function makeCenterSpaceKey(hostId: string, spaceId: string): string {
  if (!hostId) return spaceId;
  if (isDefaultCenterSpaceId(spaceId)) return hostId;
  return `${hostId}${CENTER_SPACE_KEY_MARK}${spaceId}`;
}

export function parseCenterSpaceKey(
  key: string,
): { hostId: string; spaceId: string } {
  const index = key.indexOf(CENTER_SPACE_KEY_MARK);
  if (index === -1) {
    return { hostId: key, spaceId: DEFAULT_CENTER_SPACE_ID };
  }
  return {
    hostId: key.slice(0, index),
    spaceId: key.slice(index + CENTER_SPACE_KEY_MARK.length) || DEFAULT_CENTER_SPACE_ID,
  };
}

export function hostIdFromCenterKey(key: string): string {
  return parseCenterSpaceKey(key).hostId;
}

export function createCenterSpaceId(): string {
  return `space-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultHostSpaces(): HostCenterSpaces {
  const now = Date.now();
  return {
    activeSpaceId: DEFAULT_CENTER_SPACE_ID,
    spaces: [
      {
        id: DEFAULT_CENTER_SPACE_ID,
        name: DEFAULT_CENTER_SPACE_NAME,
        createdAt: now,
        updatedAt: now,
        thumbnailDataUrl: null,
      },
    ],
  };
}

export function nextSpaceName(existing: readonly CenterSpaceRecord[]): string {
  const used = new Set(existing.map((space) => space.name));
  let n = 1;
  let name = `Space ${n}`;
  while (used.has(name)) {
    n += 1;
    name = `Space ${n}`;
  }
  return name;
}

export function normalizeHostCenterSpaces(raw: unknown): HostCenterSpaces {
  const fallback = defaultHostSpaces();
  if (!raw || typeof raw !== "object") return fallback;
  const row = raw as Partial<HostCenterSpaces>;
  const spaces: CenterSpaceRecord[] = [];
  if (Array.isArray(row.spaces)) {
    for (const item of row.spaces) {
      if (!item || typeof item !== "object") continue;
      const space = item as Partial<CenterSpaceRecord>;
      if (typeof space.id !== "string" || !space.id) continue;
      if (typeof space.name !== "string" || !space.name.trim()) continue;
      const storedName = space.name.trim();
      const name =
        space.id === DEFAULT_CENTER_SPACE_ID && isLegacyDefaultSpaceName(storedName)
          ? DEFAULT_CENTER_SPACE_NAME
          : storedName;
      spaces.push({
        id: space.id,
        name,
        createdAt: typeof space.createdAt === "number" ? space.createdAt : Date.now(),
        updatedAt: typeof space.updatedAt === "number" ? space.updatedAt : Date.now(),
        thumbnailDataUrl:
          typeof space.thumbnailDataUrl === "string" ? space.thumbnailDataUrl : null,
      });
      if (spaces.length >= MAX_CENTER_SPACES_PER_HOST) break;
    }
  }
  if (spaces.length === 0) return fallback;
  if (!spaces.some((space) => space.id === DEFAULT_CENTER_SPACE_ID)) {
    spaces.unshift(fallback.spaces[0]!);
  }
  const activeSpaceId =
    typeof row.activeSpaceId === "string" &&
    spaces.some((space) => space.id === row.activeSpaceId)
      ? row.activeSpaceId
      : DEFAULT_CENTER_SPACE_ID;
  return { spaces, activeSpaceId };
}

export function normalizeCenterSpacesByHost(
  raw: unknown,
): Record<string, HostCenterSpaces> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, HostCenterSpaces> = {};
  for (const [hostId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!hostId || hostId.includes(CENTER_SPACE_KEY_MARK)) continue;
    out[hostId] = normalizeHostCenterSpaces(value);
  }
  return out;
}
