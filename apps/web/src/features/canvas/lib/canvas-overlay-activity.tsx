"use client";

import React from "react";

/**
 * True while the Canvas overlay is visible (open / entering / closing).
 * Keep-alive-hidden boards stay mounted but must not autosave or poll.
 * Default true so a CanvasView outside the overlay still persists.
 */
export const CanvasOverlayActiveContext = React.createContext(true);

export function useCanvasOverlayActive(): boolean {
  return React.useContext(CanvasOverlayActiveContext);
}
