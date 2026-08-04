/**
 * Host-side elevation runtime state (APP-052).
 * Used by FloatingElevationProvider and Preview occlusion suspend gate.
 */

import { create } from "zustand";
import {
  computeElevationHealthy,
  type OverlayPointerMode,
} from "./elevation-policy";

type ElevationState = {
  capability: boolean;
  /** Derived: true when at least one desktop-native preview surface is active. */
  nativePreviewPresent: boolean;
  /** Refcount of concurrent desktop-native Preview instances on this host. */
  nativePreviewSurfaceCount: number;
  surfaceReady: boolean;
  ensureFailed: boolean;
  elevatedLayerCount: number;
  portalContainer: HTMLElement | null;
  pointerMode: OverlayPointerMode;
  setCapability: (v: boolean) => void;
  /**
   * Acquire/release a native preview surface presence slot.
   * Multi-Preview hosts must not clear present while another surface remains.
   */
  acquireNativePreviewSurface: () => void;
  releaseNativePreviewSurface: () => void;
  setSurfaceReady: (v: boolean) => void;
  setEnsureFailed: (v: boolean) => void;
  setPortalContainer: (el: HTMLElement | null) => void;
  setPointerMode: (m: OverlayPointerMode) => void;
  setElevatedLayerCount: (n: number) => void;
  resetElevationRuntime: () => void;
  elevationHealthy: () => boolean;
};

export const useDesktopElevationStore = create<ElevationState>((set, get) => ({
  capability: false,
  nativePreviewPresent: false,
  nativePreviewSurfaceCount: 0,
  surfaceReady: false,
  ensureFailed: false,
  elevatedLayerCount: 0,
  portalContainer: null,
  pointerMode: "pass-through",
  setCapability: (v) => set({ capability: v }),
  acquireNativePreviewSurface: () =>
    set((s) => {
      const nativePreviewSurfaceCount = s.nativePreviewSurfaceCount + 1;
      return {
        nativePreviewSurfaceCount,
        nativePreviewPresent: nativePreviewSurfaceCount > 0,
      };
    }),
  releaseNativePreviewSurface: () =>
    set((s) => {
      const nativePreviewSurfaceCount = Math.max(
        0,
        s.nativePreviewSurfaceCount - 1,
      );
      return {
        nativePreviewSurfaceCount,
        nativePreviewPresent: nativePreviewSurfaceCount > 0,
      };
    }),
  setSurfaceReady: (v) => set({ surfaceReady: v }),
  setEnsureFailed: (v) => set({ ensureFailed: v }),
  setPortalContainer: (el) => set({ portalContainer: el }),
  setPointerMode: (m) => set({ pointerMode: m }),
  setElevatedLayerCount: (n) =>
    set({ elevatedLayerCount: Math.max(0, Math.floor(n)) }),
  resetElevationRuntime: () =>
    set({
      surfaceReady: false,
      ensureFailed: false,
      elevatedLayerCount: 0,
      portalContainer: null,
      pointerMode: "pass-through",
      // Do not reset nativePreviewSurfaceCount — Preview instances own that.
    }),
  elevationHealthy: () => {
    const s = get();
    return (
      computeElevationHealthy({
        capability: s.capability,
        surfaceReady: s.surfaceReady,
        ensureFailed: s.ensureFailed,
      }) && s.portalContainer != null
    );
  },
}));
