import { useEffect } from "react";

/**
 * Home keeps its own candidate query. A bucket with no session ids has nothing
 * to decorate, so it does not fan out.
 */
export function shouldLoadBucketCandidates(input: {
  isBucket: boolean;
  ready: boolean;
  sessionKey: string;
}): boolean {
  return input.isBucket && input.ready && input.sessionKey.length > 0;
}

/** Stable set of session ids. Order changes do not look like a new terminal. */
export function bucketCandidateSessionKey(
  isBucket: boolean,
  sessionIds: readonly string[],
): string {
  if (!isBucket) return "";
  return sessionIds
    .filter((id) => id.length > 0)
    .sort()
    .join("\n");
}

/**
 * The first load may reuse the shared fresh window. A different nonempty
 * session set must reload even when that cache is still fresh.
 */
export function bucketCandidateStaleTime(input: {
  freshMs: number;
  previousSessionKey: string;
  sessionKey: string;
}): number {
  if (input.previousSessionKey.length > 0 && input.previousSessionKey !== input.sessionKey) {
    return 0;
  }
  return input.freshMs;
}

/**
 * Loads after paint. A new `load` identity, session set, or workspace key
 * loads again. The render that opens the bucket does not call `load`.
 * `load` must stay stable for a given session set; a new identity is another load.
 */
export function useBucketCandidateLoad(input: {
  isBucket: boolean;
  ready: boolean;
  sessionKey: string;
  reloadKey: string;
  load: () => void;
}): void {
  const { isBucket, load, ready, reloadKey, sessionKey } = input;
  useEffect(() => {
    if (!shouldLoadBucketCandidates({ isBucket, ready, sessionKey })) return;
    load();
  }, [isBucket, load, ready, reloadKey, sessionKey]);
}
