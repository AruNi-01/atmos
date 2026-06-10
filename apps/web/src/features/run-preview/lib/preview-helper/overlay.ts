import type { PreviewElementRect } from './types';

interface OverlayController {
  updateHover: (rect: PreviewElementRect, label?: string) => void;
  lock: (rect: PreviewElementRect, label?: string) => void;
  clearHover: () => void;
  clearLocked: () => void;
  setCursor: (cursor: string) => void;
  destroy: () => void;
}

export const PREVIEW_PICKER_HOVER_COLOR = '#2563eb';
export const PREVIEW_PICKER_LOCKED_COLOR = '#f97316';

export function createPreviewPickerCursor(color: string): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="27" viewBox="0 0 50 54" fill="none">',
    '<g filter="url(#atmos_picker_cursor_shadow)">',
    `<path d="M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z" fill="${color}"/>`,
    '</g>',
    '<defs><filter id="atmos_picker_cursor_shadow" x="0.602397" y="0.952444" width="49.0584" height="52.428" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="2.25825"/><feGaussianBlur stdDeviation="2.25825"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/></filter></defs>',
    '</svg>',
  ].join('');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 13 14, auto`;
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
        cursor: revert !important;
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
