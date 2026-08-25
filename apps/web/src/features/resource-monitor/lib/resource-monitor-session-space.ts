import { DEFAULT_CENTER_SPACE_ID } from "@/app-shell/center-space/center-space";

export type ResourceMonitorSpaceRecord = {
  id: string;
  name: string;
};

export type ResourceMonitorSessionSpaceBadge = {
  spaceId: string;
  name: string;
};

/**
 * Show a Space badge only when the host has more than one Center Space and
 * the live session can be placed in one of those spaces. A single default
 * Space stays unlabeled.
 */
export function resolveResourceMonitorSessionSpaceBadge(args: {
  spaces: readonly ResourceMonitorSpaceRecord[] | null | undefined;
  spaceId: string | null | undefined;
  defaultSpaceName: string;
}): ResourceMonitorSessionSpaceBadge | null {
  const spaces = args.spaces ?? [];
  if (spaces.length <= 1) return null;
  const spaceId = typeof args.spaceId === "string" ? args.spaceId.trim() : "";
  if (!spaceId) return null;
  const space = spaces.find((item) => item.id === spaceId);
  if (!space) return null;
  return {
    spaceId: space.id,
    name:
      space.id === DEFAULT_CENTER_SPACE_ID ? args.defaultSpaceName : space.name,
  };
}
