import { getAvailableSourceLocatorCapabilities, locateSourceForElement } from '../source-locators/registry';
import { createPreviewHelperBridge } from './bridge';
import { buildElementSelector, getPreviewElementRect, inspectPreviewElement } from './dom-inspector';
import {
  PREVIEW_PICKER_HOVER_COLOR,
  PREVIEW_PICKER_HOVER_BORDER_COLOR,
  PREVIEW_PICKER_LOCKED_COLOR,
  PREVIEW_PICKER_LOCKED_BORDER_COLOR,
  createPreviewOverlay,
  createPreviewPickerCursor,
} from './overlay';
import { createPreviewSelectionState } from './selection-state';
import type { PreviewHelperCapability, PreviewHelperPayload, PreviewHoverPayload } from './types';

interface InstallPreviewHelperOptions {
  sessionId: string;
  onReady?: (
    capabilities: PreviewHelperCapability[],
    extensionVersion?: string,
    pageTitle?: string,
    faviconUrl?: string,
    pageUrl?: string,
  ) => void;
  onSelected?: (payload: PreviewHelperPayload) => void;
  onHover?: (payload: PreviewHoverPayload | null) => void;
  onCleared?: () => void;
  onError?: (message: string) => void;
  onNavigationChanged?: (url: string, pageTitle?: string, faviconUrl?: string) => void;
  onTitleChanged?: (pageTitle: string, faviconUrl?: string, pageUrl?: string) => void;
  onOpenTab?: (targetUrl: string, sourceUrl?: string) => void;
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

function getPageFaviconUrl(win: Window): string {
  const selectors = [
    'link[rel~="icon"][href]',
    'link[rel="shortcut icon"][href]',
    'link[rel="apple-touch-icon"][href]',
    'link[rel="apple-touch-icon-precomposed"][href]',
  ];

  for (const selector of selectors) {
    const href = win.document.querySelector<HTMLLinkElement>(selector)?.href;
    if (!href) continue;
    try {
      return new URL(href, win.location.href).href;
    } catch {
      return href;
    }
  }

  try {
    return new URL('/favicon.ico', win.location.origin).href;
  } catch {
    return '';
  }
}

function resolvePreviewOpenTabUrl(win: Window, value: string | undefined | null): string | null {
  const rawValue = value?.trim();
  if (!rawValue) return null;

  try {
    const parsedUrl = new URL(rawValue, win.location.href);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
      ? parsedUrl.href
      : null;
  } catch {
    return null;
  }
}

function shouldOpenAnchorInNewTab(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  const target = anchor.getAttribute('target')?.trim().toLowerCase();
  const opensSeparateContext =
    Boolean(target) && target !== '_self' && target !== '_parent' && target !== '_top';
  return (
    event.button === 1 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    opensSeparateContext
  );
}

export function installPreviewHelper(
  win: Window,
  options: InstallPreviewHelperOptions,
): PreviewHelperController {
  const doc = win.document;
  const elementCtor = doc.defaultView?.Element ?? Element;
  const overlay = createPreviewOverlay(doc);
  const state = createPreviewSelectionState();
  const hoverCursor = createPreviewPickerCursor(
    PREVIEW_PICKER_HOVER_COLOR,
    PREVIEW_PICKER_HOVER_BORDER_COLOR,
  );
  const lockedCursor = createPreviewPickerCursor(
    PREVIEW_PICKER_LOCKED_COLOR,
    PREVIEW_PICKER_LOCKED_BORDER_COLOR,
  );
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
    options.onHover?.(null);
    bridge.hover(null);
    overlay.setCursor(state.enabled ? hoverCursor : 'default');
    if (notifyHost) {
      options.onCleared?.();
      bridge.cleared();
    } else {
      // Host-initiated clear also disables pick mode so hover
      // overlays do not reappear after the selection is removed.
      state.enabled = false;
      state.hovered = null;
      overlay.setCursor('default');
    }
  };

  const emitSelection = (element: Element) => {
    const rect = getPreviewElementRect(element);
    const elementContext = inspectPreviewElement(element);
    const sourceLocation = locateSourceForElement(element, win);
    overlay.lock(rect);
    overlay.setCursor(lockedCursor);
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
    overlay.updateCursor(event.clientX, event.clientY);
    if (state.locked) {
      overlay.clearHover();
      overlay.setCursor(lockedCursor);
      options.onHover?.(null);
      bridge.hover(null);
      return;
    }
    const target = event.target;
    if (!isInspectableElement(target, elementCtor) || isIgnoredElement(target)) {
      overlay.clearHover();
      overlay.setCursor(hoverCursor);
      state.hovered = null;
      options.onHover?.(null);
      bridge.hover(null);
      return;
    }
    state.hovered = target;
    overlay.setCursor(hoverCursor);
    const rect = getPreviewElementRect(target);
    const label = buildElementSelector(target);
    const hoverPayload = {
      label,
      rect,
      cursor: {
        x: event.clientX,
        y: event.clientY,
      },
    };
    overlay.updateHover(rect);
    options.onHover?.(hoverPayload);
    bridge.hover(hoverPayload);
  };

  const isOverlayTarget = (target: EventTarget | null) => {
    return isInspectableElement(target, elementCtor) && Boolean(target.closest('[data-atmos-preview-overlay="true"]'));
  };

  const blockPagePointerEvent = (event: Event) => {
    if (!state.enabled) return;
    if (isOverlayTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = (event: MouseEvent) => {
    if (!state.enabled) return;
    if (isOverlayTarget(event.target)) return;
    overlay.updateCursor(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
    if (state.locked) {
      return;
    }
    const target = event.target;
    if (!isInspectableElement(target, elementCtor) || isIgnoredElement(target)) return;
    state.locked = target;
    overlay.clearHover();
    options.onHover?.(null);
    bridge.hover(null);
    emitSelection(target);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!state.enabled || event.key !== 'Escape') return;
    clearSelection(true);
  };

  doc.addEventListener('mousemove', handleMouseMove, true);
  doc.addEventListener('pointerdown', blockPagePointerEvent, true);
  doc.addEventListener('mousedown', blockPagePointerEvent, true);
  doc.addEventListener('mouseup', blockPagePointerEvent, true);
  doc.addEventListener('click', handleClick, true);
  doc.addEventListener('dblclick', blockPagePointerEvent, true);
  doc.addEventListener('contextmenu', blockPagePointerEvent, true);
  win.addEventListener('keydown', handleKeyDown, true);

  let lastKnownPath = win.location.pathname + win.location.hash;
  let lastKnownTitle = getPageTitle(win);
  let lastKnownFaviconUrl = getPageFaviconUrl(win);
  const originalPushState = win.history.pushState.bind(win.history);
  const originalReplaceState = win.history.replaceState.bind(win.history);
  const emitTitleChange = (pageTitle: string) => {
    const faviconUrl = getPageFaviconUrl(win);
    options.onTitleChanged?.(pageTitle, faviconUrl, win.location.href);
    bridge.titleChanged(pageTitle, faviconUrl);
  };
  const emitOpenTab = (targetUrl: string) => {
    options.onOpenTab?.(targetUrl, win.location.href);
    bridge.openTab(targetUrl);
  };

  const handleOpenTabClick = (event: MouseEvent) => {
    if (state.enabled || event.defaultPrevented) return;
    if (event.button !== 0 && event.button !== 1) return;

    const target = event.target;
    if (!isInspectableElement(target, elementCtor)) return;

    const anchor = target.closest('a[href]');
    if (!anchor || anchor.tagName.toLowerCase() !== 'a') return;
    const link = anchor as HTMLAnchorElement;
    if (!shouldOpenAnchorInNewTab(link, event)) return;

    const targetUrl = resolvePreviewOpenTabUrl(win, link.href);
    if (!targetUrl) return;

    event.preventDefault();
    event.stopPropagation();
    emitOpenTab(targetUrl);
  };

  const checkUrlChange = () => {
    const currentPath = win.location.pathname + win.location.hash;
    if (currentPath !== lastKnownPath) {
      lastKnownPath = currentPath;
      const currentUrl = win.location.href;
      const currentTitle = getPageTitle(win);
      const currentFaviconUrl = getPageFaviconUrl(win);
      lastKnownTitle = currentTitle;
      lastKnownFaviconUrl = currentFaviconUrl;
      options.onNavigationChanged?.(currentUrl, currentTitle, currentFaviconUrl);
      bridge.navigationChanged(currentUrl, currentTitle, currentFaviconUrl);
    }
  };

  const handlePopState = () => checkUrlChange();
  doc.addEventListener('click', handleOpenTabClick, true);
  doc.addEventListener('auxclick', handleOpenTabClick, true);
  win.addEventListener('popstate', handlePopState);
  const titleObserverTarget = doc.head ?? doc.documentElement;
  const titleObserver =
    titleObserverTarget && typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
        const nextTitle = getPageTitle(win);
          const nextFaviconUrl = getPageFaviconUrl(win);
          if (nextTitle === lastKnownTitle && nextFaviconUrl === lastKnownFaviconUrl) return;
          lastKnownTitle = nextTitle;
          lastKnownFaviconUrl = nextFaviconUrl;
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
  const originalOpen = win.open.bind(win);
  win.open = function (
    url?: string | URL,
    target?: string,
    features?: string,
  ): WindowProxy | null {
    const targetName = target?.trim().toLowerCase() ?? '';
    const targetUrl = resolvePreviewOpenTabUrl(win, url == null ? null : String(url));
    if (targetUrl && targetName !== '_self' && targetName !== '_parent' && targetName !== '_top') {
      emitOpenTab(targetUrl);
      return null;
    }
    return originalOpen(url, target, features);
  };

  const capabilities: PreviewHelperCapability[] = [
    'dom-inspection',
    'element-selection',
    ...getAvailableSourceLocatorCapabilities(win) as PreviewHelperCapability[],
  ];
  const initialTitle = getPageTitle(win);
  const initialFaviconUrl = getPageFaviconUrl(win);
  lastKnownTitle = initialTitle;
  lastKnownFaviconUrl = initialFaviconUrl;
  options.onReady?.(capabilities, undefined, initialTitle, initialFaviconUrl, win.location.href);
  bridge.ready(capabilities, initialTitle, initialFaviconUrl);

  return {
    enterPickMode() {
      state.enabled = true;
      overlay.setCursor(hoverCursor);
    },
    exitPickMode() {
      state.enabled = false;
      state.locked = null;
      state.hovered = null;
      overlay.clearLocked();
      overlay.clearHover();
      overlay.setCursor('default');
    },
    clearSelection,
    destroy() {
      doc.removeEventListener('mousemove', handleMouseMove, true);
      doc.removeEventListener('pointerdown', blockPagePointerEvent, true);
      doc.removeEventListener('mousedown', blockPagePointerEvent, true);
      doc.removeEventListener('mouseup', blockPagePointerEvent, true);
      doc.removeEventListener('click', handleClick, true);
      doc.removeEventListener('dblclick', blockPagePointerEvent, true);
      doc.removeEventListener('contextmenu', blockPagePointerEvent, true);
      doc.removeEventListener('click', handleOpenTabClick, true);
      doc.removeEventListener('auxclick', handleOpenTabClick, true);
      win.removeEventListener('keydown', handleKeyDown, true);
      win.removeEventListener('popstate', handlePopState);
      titleObserver?.disconnect();
      win.history.pushState = originalPushState;
      win.history.replaceState = originalReplaceState;
      win.open = originalOpen;
      overlay.destroy();
    },
  };
}
