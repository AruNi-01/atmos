import { getAvailableSourceLocatorCapabilities, locateSourceForElement } from '../source-locators/registry';
import { createPreviewHelperBridge } from './bridge';
import { buildElementSelector, getPreviewElementRect, inspectPreviewElement } from './dom-inspector';
import { createPreviewOverlay } from './overlay';
import { createPreviewSelectionState } from './selection-state';
import type { PreviewHelperCapability, PreviewHelperPayload } from './types';

interface InstallPreviewHelperOptions {
  sessionId: string;
  onReady?: (capabilities: PreviewHelperCapability[]) => void;
  onSelected?: (payload: PreviewHelperPayload) => void;
  onCleared?: () => void;
  onError?: (message: string) => void;
}

export interface PreviewHelperController {
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

export function installPreviewHelper(
  win: Window,
  options: InstallPreviewHelperOptions,
): PreviewHelperController {
  const doc = win.document;
  const elementCtor = doc.defaultView?.Element ?? Element;
  const overlay = createPreviewOverlay(doc);
  const state = createPreviewSelectionState();
  const bridge = createPreviewHelperBridge(win, {
    sessionId: options.sessionId,
    pageUrl: win.location.href,
  });

  const clearSelection = (notifyHost: boolean = false) => {
    state.locked = null;
    overlay.clearLocked();
    overlay.clearHover();
    if (notifyHost) {
      options.onCleared?.();
      bridge.cleared();
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
    if (state.locked) return;
    const target = event.target;
    if (!isInspectableElement(target, elementCtor) || isIgnoredElement(target)) return;
    event.preventDefault();
    event.stopPropagation();
    state.locked = target;
    overlay.clearHover();
    emitSelection(target);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    clearSelection(true);
  };

  doc.addEventListener('mousemove', handleMouseMove, true);
  doc.addEventListener('click', handleClick, true);
  win.addEventListener('keydown', handleKeyDown, true);

  const capabilities: PreviewHelperCapability[] = [
    'dom-inspection',
    'element-selection',
    ...getAvailableSourceLocatorCapabilities(win) as PreviewHelperCapability[],
  ];
  options.onReady?.(capabilities);
  bridge.ready(capabilities);

  return {
    clearSelection,
    destroy() {
      doc.removeEventListener('mousemove', handleMouseMove, true);
      doc.removeEventListener('click', handleClick, true);
      win.removeEventListener('keydown', handleKeyDown, true);
      overlay.destroy();
    },
  };
}
