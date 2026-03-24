import { getAvailableSourceLocatorCapabilities, locateSourceForElement } from '../source-locators/registry';
import { createPreviewHelperBridge } from './bridge';
import { buildElementSelector, getPreviewElementRect, inspectPreviewElement } from './dom-inspector';
import { createPreviewOverlay } from './overlay';
import { createPreviewSelectionState } from './selection-state';
import type { PreviewHelperCapability, PreviewHelperPayload } from './types';

interface InstallPreviewHelperOptions {
  sessionId: string;
  onReady?: (
    capabilities: PreviewHelperCapability[],
    extensionVersion?: string,
    pageTitle?: string,
  ) => void;
  onSelected?: (payload: PreviewHelperPayload) => void;
  onCleared?: () => void;
  onError?: (message: string) => void;
  onNavigationChanged?: (url: string, pageTitle?: string) => void;
  onTitleChanged?: (pageTitle: string) => void;
}

export interface PreviewHelperController {
  enterPickMode: () => void;
  exitPickMode: () => void;
  clearSelection: (notifyHost?: boolean) => void;
  destroy: () => void;
}

function isInspectableElement(
  value: EventTarget | null,
  elementCtor: typeof Element,
): value is Element {
  return value instanceof elementCtor;
}

function isIgnoredElement(element: Element): boolean {
  if (element.closest('[data-atmos-preview-overlay="true"]')) return true;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'html' || tagName === 'body') return true;
  const rect = element.getBoundingClientRect();
  return rect.width < 4 || rect.height < 4;
}

function getPageTitle(win: Window): string {
  return win.document.title?.trim() ?? '';
}

export function installPreviewHelper(
  win: Window,
  options: InstallPreviewHelperOptions,
): PreviewHelperController {
  const doc = win.document;
  const elementCtor = doc.defaultView?.Element ?? Element;
  const overlay = createPreviewOverlay(doc);
  const state = createPreviewSelectionState();
  let parentOrigin = '*';
  try {
    parentOrigin = win.parent.location.origin;
  } catch {
    // Cross-origin — parentOrigin stays as '*', but same-origin callers get a restricted target.
  }
  const bridge = createPreviewHelperBridge(win, {
    sessionId: options.sessionId,
    pageUrl: win.location.href,
    parentOrigin,
  });

  const clearSelection = (notifyHost: boolean = false) => {
    state.locked = null;
    overlay.clearLocked();
    overlay.clearHover();
    if (notifyHost) {
      options.onCleared?.();
      bridge.cleared();
    } else {
      // Host-initiated clear also disables pick mode so hover
      // overlays do not reappear after the selection is removed.
      state.enabled = false;
      state.hovered = null;
    }
  };

  const emitSelection = (element: Element) => {
    const rect = getPreviewElementRect(element);
    const elementContext = inspectPreviewElement(element);
    const sourceLocation = locateSourceForElement(element, win);
    overlay.lock(rect, sourceLocation?.componentName || buildElementSelector(element));
    const payload = {
      pageUrl: win.location.href,
      rect,
      elementContext,
      sourceLocation,
    };
    options.onSelected?.(payload);
    bridge.selected(payload);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!state.enabled) return;
    if (state.locked) {
      overlay.clearHover();
      return;
    }
    const target = event.target;
    if (!isInspectableElement(target, elementCtor) || isIgnoredElement(target)) {
      overlay.clearHover();
      state.hovered = null;
      return;
    }
    state.hovered = target;
    const rect = getPreviewElementRect(target);
    overlay.updateHover(rect, buildElementSelector(target));
    bridge.hover(rect);
  };

  const handleClick = (event: MouseEvent) => {
    if (!state.enabled) return;
    if (state.locked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    if (!isInspectableElement(target, elementCtor) || isIgnoredElement(target)) return;
    event.preventDefault();
    event.stopPropagation();
    state.locked = target;
    overlay.clearHover();
    emitSelection(target);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!state.enabled || event.key !== 'Escape') return;
    clearSelection(true);
  };

  doc.addEventListener('mousemove', handleMouseMove, true);
  doc.addEventListener('click', handleClick, true);
  win.addEventListener('keydown', handleKeyDown, true);

  let lastKnownPath = win.location.pathname + win.location.hash;
  let lastKnownTitle = getPageTitle(win);
  const originalPushState = win.history.pushState.bind(win.history);
  const originalReplaceState = win.history.replaceState.bind(win.history);
  const emitTitleChange = (pageTitle: string) => {
    options.onTitleChanged?.(pageTitle);
    bridge.titleChanged(pageTitle);
  };

  const checkUrlChange = () => {
    const currentPath = win.location.pathname + win.location.hash;
    if (currentPath !== lastKnownPath) {
      lastKnownPath = currentPath;
      const currentUrl = win.location.href;
      const currentTitle = getPageTitle(win);
      lastKnownTitle = currentTitle;
      options.onNavigationChanged?.(currentUrl, currentTitle);
      bridge.navigationChanged(currentUrl, currentTitle);
    }
  };

  const handlePopState = () => checkUrlChange();
  win.addEventListener('popstate', handlePopState);
  const titleObserverTarget = doc.head ?? doc.documentElement;
  const titleObserver =
    titleObserverTarget && typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          const nextTitle = getPageTitle(win);
          if (nextTitle === lastKnownTitle) return;
          lastKnownTitle = nextTitle;
          emitTitleChange(nextTitle);
        })
      : null;
  titleObserver?.observe(titleObserverTarget, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  win.history.pushState = function (...args: Parameters<typeof originalPushState>) {
    originalPushState(...args);
    checkUrlChange();
  };
  win.history.replaceState = function (...args: Parameters<typeof originalReplaceState>) {
    originalReplaceState(...args);
    checkUrlChange();
  };

  const capabilities: PreviewHelperCapability[] = [
    'dom-inspection',
    'element-selection',
    ...getAvailableSourceLocatorCapabilities(win) as PreviewHelperCapability[],
  ];
  const initialTitle = getPageTitle(win);
  lastKnownTitle = initialTitle;
  options.onReady?.(capabilities, undefined, initialTitle);
  bridge.ready(capabilities, initialTitle);

  return {
    enterPickMode() {
      state.enabled = true;
    },
    exitPickMode() {
      state.enabled = false;
      state.locked = null;
      state.hovered = null;
      overlay.clearLocked();
      overlay.clearHover();
    },
    clearSelection,
    destroy() {
      doc.removeEventListener('mousemove', handleMouseMove, true);
      doc.removeEventListener('click', handleClick, true);
      win.removeEventListener('keydown', handleKeyDown, true);
      win.removeEventListener('popstate', handlePopState);
      titleObserver?.disconnect();
      win.history.pushState = originalPushState;
      win.history.replaceState = originalReplaceState;
      overlay.destroy();
    },
  };
}
