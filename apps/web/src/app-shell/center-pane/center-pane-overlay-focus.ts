/**
 * Overlay panels live in a sibling of SplitLeaf, so pane chrome `onFocus`
 * never sees content clicks. Map a pointer/focus target to the owning pane.
 *
 * Browser guest documents (iframe / Electron `<webview>` contents) do not
 * bubble pointer or focus events to the host page. Host chrome, the iframe
 * or `<webview>` *element*, and `[data-atmos-browser-surface]` can: overlay
 * capture plus document capture (custom elements and maximized portals)
 * focus the owning pane before a later content-triggered `openTab`.
 */

export function resolveOverlayOwnerPaneId(input: {
  isActiveFrame: boolean;
  isInert: boolean;
  ownerPaneId: string | null | undefined;
}): string | null {
  if (!input.isActiveFrame || input.isInert) return null;
  return input.ownerPaneId ? input.ownerPaneId : null;
}

/**
 * Wiki overlay is a host sibling of workspace frames (no `data-workspace-frame`).
 * Treat that as live chrome. Warm/inert frames never steal focus.
 */
export function resolveOverlayOwnerFromAncestors(input: {
  ownerPaneId: string | null | undefined;
  frame: { tier: string | null; inert: boolean } | null;
}): string | null {
  if (!input.ownerPaneId) return null;
  if (!input.frame) {
    return resolveOverlayOwnerPaneId({
      isActiveFrame: true,
      isInert: false,
      ownerPaneId: input.ownerPaneId,
    });
  }
  return resolveOverlayOwnerPaneId({
    isActiveFrame: input.frame.tier === "active",
    isInert: input.frame.inert,
    ownerPaneId: input.ownerPaneId,
  });
}

export function paneIdFromOverlayEventTarget(target: EventTarget | null): string | null {
  if (!target || typeof (target as Element).closest !== "function") return null;
  const el = target as Element;
  const ownerPaneId = el
    .closest("[data-center-pane-owner]")
    ?.getAttribute("data-center-pane-owner");
  const frame = el.closest("[data-workspace-frame]");
  return resolveOverlayOwnerFromAncestors({
    ownerPaneId,
    frame: frame
      ? {
          tier: frame.getAttribute("data-tier"),
          inert: frame.hasAttribute("inert"),
        }
      : null,
  });
}

/**
 * Host-page elements that can receive pointer/focus when browser events
 * permit it. Guest document internals never appear as `event.target` here.
 */
export function isBrowserHostFocusTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as Element;
  const tag = el.tagName;
  if (tag === "IFRAME" || tag === "WEBVIEW") return true;
  return Boolean(el.closest("[data-atmos-browser-surface]"));
}

export function shouldFocusOwningPane(input: {
  paneId: string | null;
  focusedPaneId: string | null | undefined;
}): boolean {
  return Boolean(input.paneId && input.paneId !== input.focusedPaneId);
}
