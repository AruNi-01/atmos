/**
 * Map guest CSS pixels (webview/iframe client coords) into host coordinates.
 */

export type GuestRect = { x: number; y: number; width: number; height: number };
export type GuestViewport = { width: number; height: number };

function resolveScale(
  frameEl: HTMLElement,
  targetBounds: DOMRect,
  guestViewport?: GuestViewport | null,
): { scaleX: number; scaleY: number } {
  const guestViewportW =
    guestViewport && guestViewport.width > 0
      ? guestViewport.width
      : frameEl.clientWidth > 0
        ? frameEl.clientWidth
        : targetBounds.width;
  const guestViewportH =
    guestViewport && guestViewport.height > 0
      ? guestViewport.height
      : frameEl.clientHeight > 0
        ? frameEl.clientHeight
        : targetBounds.height;
  return {
    scaleX: guestViewportW > 0 ? targetBounds.width / guestViewportW : 1,
    scaleY: guestViewportH > 0 ? targetBounds.height / guestViewportH : 1,
  };
}

/** Host viewport (fixed/popover) coords for a guest point or rect origin. */
export function mapGuestPointToViewport(
  point: { x: number; y: number },
  frameEl: HTMLElement | null | undefined,
  guestViewport?: GuestViewport | null,
): { x: number; y: number } {
  if (!frameEl) return { x: point.x, y: point.y };
  const targetBounds = frameEl.getBoundingClientRect();
  if (targetBounds.width <= 0 && targetBounds.height <= 0) {
    return { x: point.x, y: point.y };
  }
  const { scaleX, scaleY } = resolveScale(frameEl, targetBounds, guestViewport);
  return {
    x: targetBounds.left + point.x * scaleX,
    y: targetBounds.top + point.y * scaleY,
  };
}

/**
 * Map guest rect → coordinates relative to `shellEl` (for absolute overlays
 * stacked on the webview shell). When shellEl is omitted, returns scaled
 * guest-local coords (origin at frame top-left).
 */
export function mapGuestRectToShellLocal(
  rect: GuestRect,
  frameEl: HTMLElement | null | undefined,
  shellEl?: HTMLElement | null,
  guestViewport?: GuestViewport | null,
): GuestRect {
  if (!frameEl) return { ...rect };
  const targetBounds = frameEl.getBoundingClientRect();
  if (targetBounds.width <= 0 && targetBounds.height <= 0) {
    return { ...rect };
  }
  const { scaleX, scaleY } = resolveScale(frameEl, targetBounds, guestViewport);
  const width = rect.width * scaleX;
  const height = rect.height * scaleY;
  if (!shellEl) {
    return {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width,
      height,
    };
  }
  const shellBounds = shellEl.getBoundingClientRect();
  return {
    x: targetBounds.left - shellBounds.left + rect.x * scaleX,
    y: targetBounds.top - shellBounds.top + rect.y * scaleY,
    width,
    height,
  };
}
