"use client";

import { useContextParams } from "@/shared/hooks/use-context-params";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import { resolveCenterOpenContextId } from "@/app-shell/center-space/center-open-context";

/** Live center paint id for the URL host (default space = host id). */
export function useCenterPaintContextId(): string | null {
  const { effectiveContextId: hostId } = useContextParams();
  const activeSpaceId = useCenterSpaceStore((state) =>
    hostId ? state.getActiveSpaceId(hostId) : "",
  );
  if (!hostId) return null;
  return makeCenterSpaceKey(hostId, activeSpaceId);
}

/** Paint context that should own a tab opened from the current center. */
export function useResolvedCenterOpenContextId(
  requested?: string | null,
): string | null {
  const { effectiveContextId: hostId } = useContextParams();
  const paintId = useCenterPaintContextId();
  return resolveCenterOpenContextId(requested, hostId, paintId);
}
