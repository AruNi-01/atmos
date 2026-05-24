import type { PreviewElementRect } from './types';

interface OverlayController {
  updateHover: (rect: PreviewElementRect, label?: string) => void;
  lock: (rect: PreviewElementRect, label?: string) => void;
  clearHover: () => void;
  clearLocked: () => void;
  destroy: () => void;
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
  const hoverBox = createOverlayBox(doc, '#2563eb');
  const lockedBox = createOverlayBox(doc, '#f97316');
  const label = createOverlayLabel(doc);

  doc.body.append(hoverBox, lockedBox, label);

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
    destroy() {
      hoverBox.remove();
      lockedBox.remove();
      label.remove();
    },
  };
}
