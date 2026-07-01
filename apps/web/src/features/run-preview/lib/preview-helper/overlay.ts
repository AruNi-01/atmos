import type { PreviewElementRect } from './types';

interface OverlayController {
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

function createOverlayLabel(doc: Document): HTMLDivElement {
  const node = doc.createElement('div');
  node.setAttribute('data-atmos-preview-overlay', 'true');
  Object.assign(node.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    display: 'none',
    background: 'rgba(17, 24, 39, 0.92)',
    color: '#fff',
    fontSize: '11px',
    lineHeight: '1.3',
    padding: '4px 6px',
    borderRadius: '6px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    maxWidth: '360px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });
  return node;
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

function applyLabelPosition(node: HTMLElement, rect: PreviewElementRect, label?: string) {
  if (!label) {
    node.style.display = 'none';
    return;
  }

  node.textContent = label;
  node.style.display = 'block';
  node.style.left = `${Math.max(8, rect.x)}px`;
  node.style.top = `${Math.max(8, rect.y - 28)}px`;
}

export function createPreviewOverlay(doc: Document): OverlayController {
  const hoverBox = createOverlayBox(doc, PREVIEW_PICKER_HOVER_COLOR);
  const lockedBox = createOverlayBox(doc, PREVIEW_PICKER_LOCKED_COLOR);
  const label = createOverlayLabel(doc);
  const cursorStyle = doc.createElement('style');
  cursorStyle.setAttribute('data-atmos-preview-overlay', 'true');
  doc.head.append(cursorStyle);

  doc.body.append(hoverBox, lockedBox, label);

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
    updateHover(rect, overlayLabel) {
      applyRect(hoverBox, rect);
      applyLabelPosition(label, rect, overlayLabel);
    },
    lock(rect, overlayLabel) {
      applyRect(lockedBox, rect);
      applyLabelPosition(label, rect, overlayLabel);
    },
    clearHover() {
      hoverBox.style.display = 'none';
      if (lockedBox.style.display === 'none') {
        label.style.display = 'none';
      }
    },
    clearLocked() {
      lockedBox.style.display = 'none';
      label.style.display = 'none';
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
