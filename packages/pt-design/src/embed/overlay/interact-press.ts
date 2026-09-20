export const INTERACT_PRESS_NODE_TYPE = "button";

export function armInteractPress(target: HTMLElement): void {
  target.setAttribute("data-pt-pressed", "");
  const clear = () => {
    target.removeAttribute("data-pt-pressed");
    window.removeEventListener("pointerup", clear, true);
    window.removeEventListener("pointercancel", clear, true);
  };
  window.addEventListener("pointerup", clear, true);
  window.addEventListener("pointercancel", clear, true);
}

export function pressableButtonRoot(event: { button: number; target: EventTarget | null }): HTMLElement | null {
  if (event.button !== 0) return null;
  const node = event.target as { closest?: (selector: string) => Element | null } | null;
  if (!node || typeof node.closest !== "function") return null;
  const root = node.closest("[data-pt-type]") as HTMLElement | null;
  if (!root || root.getAttribute("data-pt-type") !== INTERACT_PRESS_NODE_TYPE) return null;
  return root;
}
