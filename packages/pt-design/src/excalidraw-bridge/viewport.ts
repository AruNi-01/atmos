export type SceneBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type ViewportAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
};

export type ViewportBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, passed through for overlay CSS `rotate()`. */
  rotation: number;
};

/** Scene → viewport: `x' = (x + scrollX) * zoom.value` (same for y); size scales by zoom. */
export function sceneToViewport(box: SceneBox, appState: ViewportAppState): ViewportBox {
  const zoom = appState.zoom.value;
  return {
    x: (box.x + appState.scrollX) * zoom,
    y: (box.y + appState.scrollY) * zoom,
    width: box.width * zoom,
    height: box.height * zoom,
    rotation: box.rotation ?? 0,
  };
}
