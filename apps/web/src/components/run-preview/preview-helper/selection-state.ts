export interface PreviewSelectionState {
  enabled: boolean;
  hovered: Element | null;
  locked: Element | null;
}

export function createPreviewSelectionState(): PreviewSelectionState {
  return {
    enabled: false,
    hovered: null,
    locked: null,
  };
}
