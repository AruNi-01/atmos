import type { PreviewElementRect } from './types';

interface OverlayController {
  updateCursor: (x: number, y: number) => void;
  updateHover: (rect: PreviewElementRect, label?: string) => void;
  lock: (rect: PreviewElementRect, label?: string) => void;
  clearHover: () => void;
  clearLocked: () => void;
  setCursor: (cursor: string) => void;
  destroy: () => void;
}

export const PREVIEW_PICKER_HOVER_COLOR = '#4ade80';
export const PREVIEW_PICKER_HOVER_BORDER_COLOR = '#15803d';
export const PREVIEW_PICKER_LOCKED_COLOR = '#fde047';
export const PREVIEW_PICKER_LOCKED_BORDER_COLOR = '#ca8a04';

export function createPreviewPickerCursor(fillColor: string, borderColor: string): string {
  const cursorPath =
    'M17.4 10.6C16.1 9.8 14.6 10.9 15 12.4L25.3 49.1C25.8 50.8 28 51 28.7 49.4L34.8 36.2L48.8 33.1C50.5 32.7 50.9 30.5 49.4 29.6L17.4 10.6Z';
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 64 64" fill="none" shape-rendering="geometricPrecision">',
    '<defs><filter id="atmos_picker_cursor_shadow" x="-8" y="-8" width="80" height="80" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2" stdDeviation="1.25" flood-color="#0f172a" flood-opacity="0.24"/></filter></defs>',
    '<g filter="url(#atmos_picker_cursor_shadow)" stroke-linejoin="round">',
    `<path d="${cursorPath}" fill="${fillColor}" stroke="${borderColor}" stroke-width="5.5"/>`,
    `<path d="${cursorPath}" fill="none" stroke="#fff" stroke-opacity="0.26" stroke-width="1.4"/>`,
    '</g>',
    '</svg>',
  ].join('');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 7 5, auto`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function createOverlayBox(doc: Document, color: string): HTMLDivElement {
  const node = doc.createElement('div');
  node.setAttribute('data-atmos-preview-overlay', 'true');
  Object.assign(node.style, {
    position: 'fixed',
    pointerEvents: 'none',
    border: `2px solid ${color}`,
    background: `${color}22`,
    boxShadow: `0 0 0 1px ${color}33`,
    zIndex: '2147483646',
    display: 'none',
    borderRadius: '6px',
  });
  return node;
}

interface FollowCursorLabel {
  node: HTMLDivElement;
  updateCursor: (x: number, y: number) => void;
  show: (label: string | undefined, rect: PreviewElementRect) => void;
  hide: () => void;
  remove: () => void;
}

function createTextCharacters(value: string): Array<{ id: string; label: string }> {
  const charCounts: Record<string, number> = {};

  return value.split('').map((char) => {
    const lowerChar = char.toLowerCase();
    charCounts[lowerChar] = (charCounts[lowerChar] || 0) + 1;

    return {
      id: `${lowerChar}${charCounts[lowerChar]}`,
      label: char === ' ' ? '\u00A0' : char,
    };
  });
}

function truncateLabel(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 95).trimEnd()}…`;
}

function createOverlayLabel(doc: Document): FollowCursorLabel {
  const win = doc.defaultView ?? window;
  const node = doc.createElement('div');
  node.setAttribute('data-atmos-preview-overlay', 'true');
  Object.assign(node.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    pointerEvents: 'none',
    zIndex: '2147483647',
    display: 'none',
    transform: 'translate3d(-9999px, -9999px, 0)',
    background: 'rgba(15, 23, 42, 0.92)',
    color: '#f8fafc',
    fontSize: '12px',
    lineHeight: '16px',
    padding: '5px 9px',
    borderRadius: '8px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    maxWidth: '320px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.24)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    willChange: 'transform',
  });

  const text = doc.createElement('span');
  Object.assign(text.style, {
    position: 'relative',
    display: 'inline-flex',
    maxWidth: '100%',
    overflow: 'hidden',
    verticalAlign: 'top',
  });
  node.appendChild(text);

  let currentText = '';
  let visible = false;
  let cursorKnown = false;
  let cursorX = 0;
  let cursorY = 0;
  let fallbackX = 8;
  let fallbackY = 8;
  let x = 0;
  let y = 0;
  let velocityX = 0;
  let velocityY = 0;
  let animationFrame = 0;

  const prefersReducedMotion = (() => {
    try {
      return Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  })();

  const textTransition = 'opacity 160ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1)';

  const styleCharacter = (span: HTMLSpanElement) => {
    Object.assign(span.style, {
      display: 'inline-block',
      whiteSpace: 'pre',
      willChange: 'transform, opacity',
      transition: textTransition,
    });
  };

  const morphText = (nextText: string) => {
    const previousSpans = new Map<string, HTMLSpanElement>();
    const previousRects = new Map<string, DOMRect>();

    Array.from(text.children).forEach((child) => {
      const span = child as HTMLSpanElement;
      const id = span.dataset.morphId;
      if (!id) return;
      previousSpans.set(id, span);
      previousRects.set(id, span.getBoundingClientRect());
    });

    const characters = createTextCharacters(nextText);
    const nextIds = new Set(characters.map((character) => character.id));
    const nextSpans = new Map<string, HTMLSpanElement>();
    const fragment = doc.createDocumentFragment();

    previousSpans.forEach((span, id) => {
      if (nextIds.has(id) || prefersReducedMotion) return;
      const rect = previousRects.get(id);
      if (!rect) return;
      const ghost = span.cloneNode(true) as HTMLSpanElement;
      styleCharacter(ghost);
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        pointerEvents: 'none',
        zIndex: '2147483647',
      });
      doc.documentElement.appendChild(ghost);
      win.requestAnimationFrame(() => {
        ghost.style.opacity = '0';
        ghost.style.transform = 'translateY(-6px)';
      });
      win.setTimeout(() => ghost.remove(), 190);
    });

    characters.forEach((character) => {
      const existing = previousSpans.get(character.id);
      const span = existing ?? doc.createElement('span');
      span.dataset.morphId = character.id;
      span.textContent = character.label;
      styleCharacter(span);
      if (!existing && !prefersReducedMotion) {
        span.style.opacity = '0';
        span.style.transform = 'translateY(6px)';
      } else {
        span.style.opacity = '1';
        span.style.transform = 'translate(0, 0)';
      }
      nextSpans.set(character.id, span);
      fragment.appendChild(span);
    });

    text.replaceChildren(fragment);

    if (prefersReducedMotion) return;

    win.requestAnimationFrame(() => {
      characters.forEach((character) => {
        const span = nextSpans.get(character.id);
        if (!span) return;
        const previousRect = previousRects.get(character.id);
        if (!previousRect) {
          span.style.opacity = '1';
          span.style.transform = 'translateY(0)';
          return;
        }

        const nextRect = span.getBoundingClientRect();
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

        span.style.transition = 'none';
        span.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        span.getBoundingClientRect();
        span.style.transition = textTransition;
        span.style.transform = 'translate(0, 0)';
      });
    });
  };

  const setText = (value: string | undefined) => {
    const nextText = truncateLabel(value ?? '');
    if (nextText === currentText) return;
    currentText = nextText;
    morphText(nextText);
  };

  const targetPosition = () => {
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const originX = cursorKnown ? cursorX : fallbackX;
    const originY = cursorKnown ? cursorY : fallbackY;
    let targetX = originX + 16;
    let targetY = originY + 18;

    if (targetX + width > win.innerWidth - 8) {
      targetX = originX - width - 12;
    }
    if (targetY + height > win.innerHeight - 8) {
      targetY = originY - height - 12;
    }

    return {
      x: clamp(targetX, 8, Math.max(8, win.innerWidth - width - 8)),
      y: clamp(targetY, 8, Math.max(8, win.innerHeight - height - 8)),
    };
  };

  const applyTransform = () => {
    node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  };

  const animate = () => {
    if (!visible) {
      animationFrame = 0;
      return;
    }

    const target = targetPosition();

    if (prefersReducedMotion) {
      x = target.x;
      y = target.y;
      applyTransform();
      animationFrame = 0;
      return;
    }

    velocityX = (velocityX + (target.x - x) * 0.24) * 0.68;
    velocityY = (velocityY + (target.y - y) * 0.24) * 0.68;
    x += velocityX;
    y += velocityY;
    applyTransform();

    const settled =
      Math.abs(target.x - x) < 0.2 &&
      Math.abs(target.y - y) < 0.2 &&
      Math.abs(velocityX) < 0.2 &&
      Math.abs(velocityY) < 0.2;

    if (settled) {
      x = target.x;
      y = target.y;
      velocityX = 0;
      velocityY = 0;
      applyTransform();
      animationFrame = 0;
      return;
    }

    animationFrame = win.requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (animationFrame) return;
    animationFrame = win.requestAnimationFrame(animate);
  };

  return {
    node,
    updateCursor(nextX, nextY) {
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
      cursorKnown = true;
      cursorX = nextX;
      cursorY = nextY;
      if (visible) startAnimation();
    },
    show(label, rect) {
      if (!label) {
        this.hide();
        return;
      }

      fallbackX = rect.x;
      fallbackY = Math.max(8, rect.y - 32);
      setText(label);
      node.style.display = 'block';

      if (!visible) {
        visible = true;
        const target = targetPosition();
        x = target.x;
        y = target.y;
        velocityX = 0;
        velocityY = 0;
        applyTransform();
      }

      startAnimation();
    },
    hide() {
      visible = false;
      node.style.display = 'none';
      velocityX = 0;
      velocityY = 0;
      if (animationFrame) {
        win.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    },
    remove() {
      this.hide();
      node.remove();
    },
  };
}

function applyRect(node: HTMLElement, rect: PreviewElementRect) {
  Object.assign(node.style, {
    display: 'block',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${Math.max(0, rect.width)}px`,
    height: `${Math.max(0, rect.height)}px`,
  });
}

export function createPreviewOverlay(doc: Document): OverlayController {
  const hoverBox = createOverlayBox(doc, PREVIEW_PICKER_HOVER_COLOR);
  const lockedBox = createOverlayBox(doc, PREVIEW_PICKER_LOCKED_COLOR);
  const label = createOverlayLabel(doc);
  const cursorStyle = doc.createElement('style');
  cursorStyle.setAttribute('data-atmos-preview-overlay', 'true');
  doc.head.append(cursorStyle);

  doc.body.append(hoverBox, lockedBox, label.node);

  let labelMode: 'hover' | 'locked' | null = null;

  function setCursor(cursor: string) {
    if (!cursor || cursor === 'default') {
      cursorStyle.textContent = '';
      return;
    }

    cursorStyle.textContent = `
      html, body, body * {
        cursor: ${cursor} !important;
      }
      [data-atmos-preview-overlay="true"],
      [data-atmos-preview-overlay="true"] * {
        cursor: default !important;
      }
      [data-atmos-preview-overlay="true"] button,
      [data-atmos-preview-overlay="true"] button * {
        cursor: pointer !important;
      }
      [data-atmos-preview-overlay="true"] input,
      [data-atmos-preview-overlay="true"] textarea,
      [data-atmos-preview-overlay="true"] [contenteditable="true"] {
        cursor: text !important;
      }
    `;
  }

  return {
    updateCursor(x, y) {
      label.updateCursor(x, y);
    },
    updateHover(rect, overlayLabel) {
      applyRect(hoverBox, rect);
      labelMode = 'hover';
      label.show(overlayLabel, rect);
    },
    lock(rect, overlayLabel) {
      applyRect(lockedBox, rect);
      labelMode = 'locked';
      label.show(overlayLabel, rect);
    },
    clearHover() {
      hoverBox.style.display = 'none';
      if (labelMode === 'hover' && lockedBox.style.display === 'none') {
        label.hide();
        labelMode = null;
      }
    },
    clearLocked() {
      lockedBox.style.display = 'none';
      if (labelMode === 'locked') {
        label.hide();
        labelMode = null;
      }
    },
    setCursor,
    destroy() {
      cursorStyle.remove();
      hoverBox.remove();
      lockedBox.remove();
      label.remove();
    },
  };
}
