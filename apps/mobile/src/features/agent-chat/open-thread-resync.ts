export type OpenThreadResyncCtrl = {
  overflowed: boolean;
  resyncFetchGen: number;
  cancelled: boolean;
};

export type OpenThreadResyncResult = "applied-incoming" | "applied-replacement" | "held";

/**
 * Overflow keeps the current transcript until a replacement get succeeds.
 * A newer resync bumps `resyncFetchGen` so an older get cannot publish.
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
  try {
    const snapshot = await input.fetchReplacement();
    if (ctrl.cancelled || gen !== ctrl.resyncFetchGen) return "held";
    ctrl.overflowed = false;
    input.publish(snapshot);
    return "applied-replacement";
  } catch {
    return "held";
  }
}
