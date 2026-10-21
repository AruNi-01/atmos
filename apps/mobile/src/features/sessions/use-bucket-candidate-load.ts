import { useEffect } from "react";
import type { SessionInboxSurface } from "./session-inbox-surface";

/**
 * Bucket terminal metadata loads after paint, then again when the sessions in
 * that bucket change or the candidate cache key changes. The render that opens
 * the bucket does not call `load`. Home keeps its own focused query.
 * `load` must be a stable callback; a new identity is another load.
 */
export function useBucketCandidateLoad(input: {
  surface: SessionInboxSurface;
  ready: boolean;
  sessionKey: string;
  reloadKey: string;
  load: () => void;
}): void {
  const { load, ready, reloadKey, sessionKey, surface } = input;
  useEffect(() => {
    if (surface !== "bucket" || !ready || sessionKey.length === 0) return;
    load();
  }, [load, ready, reloadKey, sessionKey, surface]);
}
