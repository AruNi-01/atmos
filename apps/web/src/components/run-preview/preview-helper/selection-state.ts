export interface PreviewSelectionState {
  hovered: Element | null;
  locked: Element | null;
}

export function createPreviewSelectionState(): PreviewSelectionState {
  return {
    hovered: null,
    locked: null,
  };
}
