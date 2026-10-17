/**
 * Web `UserMessageBody` and the user chrome listen for `pointerdown` on
 * `document`. A press outside the body collapses the expanded text and the
 * large attachment chips. A press outside the chrome also closes the time
 * row. A press on the time row is outside the body, so the chips shrink and
 * the time row stays. A press on another message closes this one.
 */

export type UserMessageOutsidePress = {
  bodyId: string | null;
  metaId: string | null;
};

export function userMessageOutsidePressCloses(
  id: string,
  press: UserMessageOutsidePress,
): { body: boolean; meta: boolean } {
  const inBody = press.bodyId === id;
  const inMeta = press.metaId === id;
  return {
    body: !inBody,
    meta: !inBody && !inMeta,
  };
}

type UserMessageOutsideHandler = (press: UserMessageOutsidePress) => void;

const handlers = new Set<UserMessageOutsideHandler>();
let bodyId: string | null = null;
let metaId: string | null = null;
let metaOwnsPress = false;
let scheduled = false;

export function subscribeUserMessageOutsidePress(handler: UserMessageOutsideHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function markUserMessageBodyPress(id: string): void {
  if (metaOwnsPress) return;
  bodyId = id;
}

export function markUserMessageMetaPress(id: string): void {
  metaId = id;
  metaOwnsPress = true;
}

/**
 * RN 0.85 emits `onTouchStartCapture`. The View props published to this
 * package omit that field, so callers spread this object onto the view.
 */
export function userMessageOutsidePressCapture(): object {
  return { onTouchStartCapture: beginUserMessageOutsidePress };
}

export function beginUserMessageOutsidePress(): void {
  if (scheduled) return;
  bodyId = null;
  metaId = null;
  metaOwnsPress = false;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const press = { bodyId, metaId };
    bodyId = null;
    metaId = null;
    metaOwnsPress = false;
    for (const handler of [...handlers]) handler(press);
  });
}
