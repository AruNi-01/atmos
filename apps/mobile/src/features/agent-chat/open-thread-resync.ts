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
 * `overflowed` clears only when `overflowGen` is unchanged during that get.
 */
export async function applyOpenThreadResync<T>(input: {
  ctrl: OpenThreadResyncCtrl;
  incoming: T;
  fetchReplacement: () => Promise<T>;
  publish: (snapshot: T) => void;
}): Promise<OpenThreadResyncResult> {
  const { ctrl } = input;
  const gen = ++ctrl.resyncFetchGen;
  if (!ctrl.overflowed) {
    input.publish(input.incoming);
    return "applied-incoming";
  }
  const overflowGen = ctrl.overflowGen;
  try {
    const snapshot = await input.fetchReplacement();
    if (ctrl.cancelled || gen !== ctrl.resyncFetchGen) return "held";
    if (ctrl.overflowGen === overflowGen) ctrl.overflowed = false;
    input.publish(snapshot);
    return "applied-replacement";
  } catch {
    return "held";
  }
}
