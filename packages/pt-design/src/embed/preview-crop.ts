import { sceneToViewport } from "../excalidraw-bridge";

export function boardCropFromScene(
  origin: { left: number; top: number },
  scene: { x: number; y: number; w: number; h: number },
  appState: { scrollX: number; scrollY: number; zoom: { value: number } },
  pad = 16,
): { x: number; y: number; w: number; h: number } {
  const view = sceneToViewport(
    { x: scene.x, y: scene.y, width: scene.w, height: scene.h },
    appState,
  );
  return {
    x: origin.left + view.x - pad,
    y: origin.top + view.y - pad,
    w: view.width + pad * 2,
    h: view.height + pad * 2,
  };
}
