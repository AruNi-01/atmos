/**
 * Web opens an http address without expanding the bubble or toggling the
 * time row (`stopPropagation` on the anchor). A paste chip still expands a
 * collapsed body, and the chrome skips the time row (`[data-paste-chip]`).
 * A press on the rest of the body does both.
 *
 * The link or chip marks the press on release. The bubble reads that mark
 * on a microtask, so the order of the two `onPress` handlers does not matter.
 * A new touch starts a new epoch, so a cancelled press cannot swallow the next tap.
 */

export type UserMessageInnerPress = "link" | "paste";

export function userMessageBodyPressEffect(inner: UserMessageInnerPress | null): {
  expand: boolean;
  toggleMeta: boolean;
} {
  if (inner === "link") return { expand: false, toggleMeta: false };
  if (inner === "paste") return { expand: true, toggleMeta: false };
  return { expand: true, toggleMeta: true };
}

let epoch = 0;
let claimEpoch = -1;
let claimKind: UserMessageInnerPress | null = null;

export function beginUserMessageBodyPress(): number {
  epoch += 1;
  return epoch;
}

export function currentUserMessageBodyPress(): number {
  return epoch;
}

export function claimUserMessageInnerPress(kind: UserMessageInnerPress) {
  claimKind = kind;
  claimEpoch = epoch;
}

export function takeUserMessageInnerPress(pressEpoch: number): UserMessageInnerPress | null {
  if (claimEpoch !== pressEpoch) return null;
  const kind = claimKind;
  claimKind = null;
  claimEpoch = -1;
  return kind;
}

export function resetUserMessagePressForTests() {
  epoch = 0;
  claimEpoch = -1;
  claimKind = null;
}
