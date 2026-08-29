/**
 * Enter or Tab confirms the highlighted `/` or `@` popover row.
 * Shift/Alt/Meta/Ctrl are ignored so Tab-with-modifiers can still reverse-tab.
 */
export function isPopoverConfirmKey(event: KeyboardEvent): boolean {
  if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return false;
  return event.key === "Enter" || event.key === "Tab";
}

/**
 * Scroll the active popover row into view while keeping `paddingItems` extra
 * rows visible past it (both directions). When arrowing down, the selection
 * sits about 4th-from-bottom so the next few results stay readable.
 *
 * Shared by composer `@` mentions and `/` slash menus (including Terminal AI input).
 */
export function scrollActiveListItemIntoView(
  container: HTMLElement,
  itemEls: Array<HTMLElement | null>,
  activeIndex: number,
  paddingItems = 3,
): void {
  const activeItem = itemEls[activeIndex];
  if (!activeItem) return;

  const lastIndex = itemEls.length - 1;
  let lookAheadIndex = Math.min(activeIndex + paddingItems, lastIndex);
  let lookBehindIndex = Math.max(activeIndex - paddingItems, 0);
  while (lookAheadIndex > activeIndex && !itemEls[lookAheadIndex]) lookAheadIndex -= 1;
  while (lookBehindIndex < activeIndex && !itemEls[lookBehindIndex]) lookBehindIndex += 1;

  const lookAhead = itemEls[lookAheadIndex] ?? activeItem;
  const lookBehind = itemEls[lookBehindIndex] ?? activeItem;

  const containerRect = container.getBoundingClientRect();
  const aheadBottom = lookAhead.getBoundingClientRect().bottom;
  if (aheadBottom > containerRect.bottom) {
    container.scrollTop += aheadBottom - containerRect.bottom;
  }

  const behindTop = lookBehind.getBoundingClientRect().top;
  const containerTop = container.getBoundingClientRect().top;
  if (behindTop < containerTop) {
    container.scrollTop += behindTop - containerTop;
  }

  // Guarantee the active row itself is fully visible (tall rows / edge cases).
  const activeRect = activeItem.getBoundingClientRect();
  const nextContainerRect = container.getBoundingClientRect();
  if (activeRect.top < nextContainerRect.top) {
    container.scrollTop += activeRect.top - nextContainerRect.top;
  } else if (activeRect.bottom > nextContainerRect.bottom) {
    container.scrollTop += activeRect.bottom - nextContainerRect.bottom;
  }
}
