const STUCK_EPS = 1.5;

export type StickyFadeRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type StickyFadeItem = StickyFadeRect & {
  stickyTop: number | null;
  stickyBottom: number | null;
  stickyLeft: number | null;
  stickyRight: number | null;
};

export type StickyFadeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

function parseStickyOffset(value: string): number | null {
  if (!value || value === "auto") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isStuck(edge: number, expected: number): boolean {
  return Math.abs(edge - expected) <= STUCK_EPS;
}

/** How far fade should start past stuck sticky descendants. */
export function measureStickyFadeInsets(
  view: StickyFadeRect,
  items: readonly StickyFadeItem[],
): StickyFadeInsets {
  const insets: StickyFadeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const item of items) {
    if (item.stickyTop != null && isStuck(item.top, view.top + item.stickyTop)) {
      insets.top = Math.max(insets.top, item.bottom - view.top);
    }
    if (
      item.stickyBottom != null &&
      isStuck(item.bottom, view.bottom - item.stickyBottom)
    ) {
      insets.bottom = Math.max(insets.bottom, view.bottom - item.top);
    }
    if (item.stickyLeft != null && isStuck(item.left, view.left + item.stickyLeft)) {
      insets.left = Math.max(insets.left, item.right - view.left);
    }
    if (
      item.stickyRight != null &&
      isStuck(item.right, view.right - item.stickyRight)
    ) {
      insets.right = Math.max(insets.right, view.right - item.left);
    }
  }
  return insets;
}

export function readStickyFadeItems(viewport: HTMLElement): StickyFadeItem[] {
  const items: StickyFadeItem[] = [];
  for (const element of viewport.querySelectorAll<HTMLElement>(".sticky")) {
    const owner = element.closest("[data-slot='scroll-area-viewport']");
    if (owner !== viewport) continue;
    const style = getComputedStyle(element);
    if (style.position !== "sticky") continue;
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    items.push({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      stickyTop: parseStickyOffset(style.top),
      stickyBottom: parseStickyOffset(style.bottom),
      stickyLeft: parseStickyOffset(style.left),
      stickyRight: parseStickyOffset(style.right),
    });
  }
  return items;
}

export function applyStickyFadeInsets(viewport: HTMLElement) {
  const view = viewport.getBoundingClientRect();
  const insets = measureStickyFadeInsets(view, readStickyFadeItems(viewport));
  viewport.style.setProperty("--fade-inset-top", `${insets.top}px`);
  viewport.style.setProperty("--fade-inset-bottom", `${insets.bottom}px`);
  viewport.style.setProperty("--fade-inset-left", `${insets.left}px`);
  viewport.style.setProperty("--fade-inset-right", `${insets.right}px`);
}
