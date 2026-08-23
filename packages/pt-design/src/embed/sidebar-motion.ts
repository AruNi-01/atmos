export const SIDEBAR_ENTER_MS = 280;
export const SIDEBAR_EXIT_MS = 210;
export const SIDEBAR_EXIT_FALLBACK_MS = SIDEBAR_EXIT_MS + 80;

export type SidebarTarget = { name: string; tab?: string; force?: boolean };

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function isClosingToggle(
  current: { name: string; tab?: string } | null | undefined,
  next: SidebarTarget,
): boolean {
  if (next.force === true) return false;
  if (next.force === false) return Boolean(current);
  if (!current) return false;
  return current.name === next.name && (next.tab === undefined || current.tab === next.tab);
}

const EXIT_KEYFRAMES: Keyframe[] = [
  { transform: "translateX(0)", opacity: 1 },
  { transform: "translateX(100%)", opacity: 0 },
];

const EXIT_TIMING: KeyframeAnimationOptions = {
  duration: SIDEBAR_EXIT_MS,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
  fill: "forwards",
};

/** Keep the last painted frame after WAAPI ends so unmount cannot flash the rest pose. */
function freezeOffscreen(el: HTMLElement, animation?: Animation): void {
  try {
    animation?.commitStyles();
  } catch {
    /* commitStyles throws if the animation already cancelled */
  }
  el.style.opacity = "0";
  el.style.transform = "translateX(100%)";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  try {
    animation?.cancel();
  } catch {
    /* already finished */
  }
}

function afterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame !== "function") {
    fn();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

export function playLiveExit(sidebar: HTMLElement, onDone: () => void): void {
  if (sidebar.dataset.ptLeaving === "true") return;
  sidebar.dataset.ptLeaving = "true";
  sidebar.style.pointerEvents = "none";
  if (prefersReducedMotion() || typeof sidebar.animate !== "function") {
    onDone();
    return;
  }
  const animation = sidebar.animate(EXIT_KEYFRAMES, EXIT_TIMING);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    freezeOffscreen(sidebar, animation);
    afterPaint(onDone);
  };
  animation.addEventListener("finish", finish);
  window.setTimeout(finish, SIDEBAR_EXIT_FALLBACK_MS);
}

type Rect = { top: number; left: number; width: number; height: number };

function readRect(el: HTMLElement): Rect | null {
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function spawnFixedExitClone(host: Element, sidebar: HTMLElement, rect: Rect): void {
  if (prefersReducedMotion()) return;
  const clone = sidebar.cloneNode(true) as HTMLElement;
  clone.dataset.ptLeaving = "true";
  clone.classList.add("pt-design-sidebar-exit");
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;
  clone.style.position = "fixed";
  clone.style.top = `${rect.top}px`;
  clone.style.left = `${rect.left}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.right = "auto";
  clone.style.bottom = "auto";
  clone.style.margin = "0";
  clone.style.zIndex = "2147483000";
  clone.style.pointerEvents = "none";
  host.appendChild(clone);
  const cleanup = () => clone.remove();
  if (typeof clone.animate !== "function") {
    window.setTimeout(cleanup, SIDEBAR_EXIT_FALLBACK_MS);
    return;
  }
  const animation = clone.animate(EXIT_KEYFRAMES, EXIT_TIMING);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    freezeOffscreen(clone, animation);
    afterPaint(cleanup);
  };
  animation.addEventListener("finish", finish);
  window.setTimeout(finish, SIDEBAR_EXIT_FALLBACK_MS);
}

export type SidebarApi = {
  toggleSidebar: (next: SidebarTarget) => unknown;
  getAppState: () => { openSidebar?: { name: string; tab?: string } | null };
};

export function wrapToggleSidebar(
  api: SidebarApi,
  getRoot: () => HTMLElement | null,
): void {
  const tagged = api as SidebarApi & { __ptSidebarAnim?: boolean };
  if (tagged.__ptSidebarAnim) return;
  tagged.__ptSidebarAnim = true;
  const orig = api.toggleSidebar.bind(api);
  api.toggleSidebar = (next) => {
    const current = api.getAppState().openSidebar;
    if (!isClosingToggle(current, next)) return orig(next);
    const sidebar = getRoot()?.querySelector<HTMLElement>(
      ".excalidraw .sidebar:not([data-pt-leaving='true'])",
    );
    if (!sidebar) return orig(next);
    playLiveExit(sidebar, () => orig({ name: next.name, tab: next.tab, force: false }));
    return false;
  };
}

export function observeSidebarExit(
  root: HTMLElement,
  getApi: () => SidebarApi | null,
): () => void {
  let snapshot: { node: HTMLElement; rect: Rect } | null = null;
  let liveExiting = false;

  const capture = () => {
    const el = root.querySelector<HTMLElement>(
      ".excalidraw .sidebar:not([data-pt-leaving='true'])",
    );
    if (!el) return;
    const rect = readRect(el);
    if (!rect) return;
    snapshot = { node: el, rect };
  };

  const onPointerDown = (event: Event) => {
    capture();
    const target = event.target;
    if (!(target instanceof Element)) return;
    const live = root.querySelector<HTMLElement>(
      ".excalidraw .sidebar:not([data-pt-leaving='true'])",
    );
    if (!live) return;
    const onTrigger = target.closest(".sidebar-trigger");
    const onSidebar = target.closest(".sidebar");
    const onClose = target.closest("[data-testid='sidebar-close']");
    if (onTrigger) return;
    if (onSidebar && !onClose) return;
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    liveExiting = true;
    snapshot = null;
    const api = getApi();
    const current = api?.getAppState().openSidebar;
    playLiveExit(live, () => {
      if (current) api?.toggleSidebar({ name: current.name, tab: current.tab, force: false });
      liveExiting = false;
    });
  };

  const observer = new MutationObserver(() => {
    const live = root.querySelector<HTMLElement>(
      ".excalidraw .sidebar:not([data-pt-leaving='true'])",
    );
    if (live) {
      capture();
      return;
    }
    if (liveExiting) return;
    if (!snapshot || snapshot.node.isConnected) return;
    if (snapshot.node.dataset.ptLeaving === "true") {
      snapshot = null;
      return;
    }
    const host = root.querySelector(".excalidraw") ?? root;
    spawnFixedExitClone(host, snapshot.node, snapshot.rect);
    snapshot = null;
  });

  root.addEventListener("pointerdown", onPointerDown, true);
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    root.removeEventListener("pointerdown", onPointerDown, true);
    observer.disconnect();
  };
}
