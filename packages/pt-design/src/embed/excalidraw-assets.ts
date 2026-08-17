export {};

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

/** Hand-drawn families (Excalifont / Virgil) load from this prefix. Component labels use local Helvetica. */
if (typeof window !== "undefined" && !window.EXCALIDRAW_ASSET_PATH) {
  window.EXCALIDRAW_ASSET_PATH = "https://unpkg.com/@excalidraw/excalidraw@0.18.1/dist/prod/";
}
