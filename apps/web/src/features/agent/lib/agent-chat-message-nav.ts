export type UserMessageNavRect = {
  messageIndex: number;
  top: number;
  bottom: number;
};

/** Last user prompt in view. Jump targets are user rows, so the rail follows those. */
export function resolveActiveUserMessageIndex(
  items: readonly UserMessageNavRect[],
  view: { height: number; scrollTop: number; scrollHeight: number },
): number | null {
  if (items.length === 0) return null;
  const last = items[items.length - 1]!.messageIndex;
  if (view.scrollTop + view.height >= view.scrollHeight - 16) return last;

  let active = items[0]!.messageIndex;
  const viewBottom = view.height - 24;
  for (const item of items) {
    if (item.top < viewBottom && item.bottom > 0) {
      active = item.messageIndex;
    }
  }
  return active;
}
