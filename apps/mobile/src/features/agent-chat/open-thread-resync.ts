export type OpenThreadResyncCtrl = {
  overflowed: boolean;
  overflowGen: number;
  resyncFetchGen: number;
  cancelled: boolean;
};

export type OpenThreadResyncResult = "applied-incoming" | "applied-replacement" | "held";

export function markOpenThreadOverflow(ctrl: OpenThreadResyncCtrl): void {
  ctrl.overflowed = true;
  ctrl.overflowGen += 1;
}

/**
 * Overflow keeps the current transcript until a replacement get succeeds.
 * A newer resync bumps `resyncFetchGen` so an older get cannot publish.
 * `overflowed` clears only after `publish` applies (not `false`) and
 * `overflowGen` is still unchanged. Failed get, cancelled, stale fetch, or
 * stale hydrate generation keep the flag.
 */
export async function applyOpenThreadResync<T>(input: {
  ctrl: OpenThreadResyncCtrl;
  incoming: T;
  fetchReplacement: () => Promise<T>;
  publish: (snapshot: T) => boolean | void;
}): Promise<OpenThreadResyncResult> {
  const { ctrl } = input;
  const gen = ++ctrl.resyncFetchGen;
  if (!ctrl.overflowed) {
    const applied = input.publish(input.incoming);
    return applied === false ? "held" : "applied-incoming";
  }
  const overflowGen = ctrl.overflowGen;
  try {
    const snapshot = await input.fetchReplacement();
    if (ctrl.cancelled || gen !== ctrl.resyncFetchGen) return "held";
    const applied = input.publish(snapshot);
    if (applied === false) return "held";
    if (ctrl.overflowGen === overflowGen) ctrl.overflowed = false;
    return "applied-replacement";
  } catch {
    return "held";
  }
}
