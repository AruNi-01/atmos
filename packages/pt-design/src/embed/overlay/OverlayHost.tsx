import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { getComponentModule } from "../../components/registry";
import { HANDLE_ROUNDNESS, HANDLE_STROKE_WIDTH, OVERLAY_Z_INDEX, sceneToViewport } from "../../excalidraw-bridge";
import type { PtDocument, PtNode } from "../../protocol";
import type { PtRendererProps } from "../../components/types";
import { ArtistInkHost } from "./artist-ink";
import { canvasOriginInBoard, findCanvasOriginNode, type OriginBox } from "./canvas-origin";
import { armInteractPress, pressableButtonRoot } from "./interact-press";
import "./sketch-ui.css";

export type OverlayAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  viewModeEnabled?: boolean;
};

export type OverlayHostProps = {
  document: PtDocument;
  mode: "edit" | "interact";
  appState: OverlayAppState;
  onCommit: (doc: PtDocument) => void;
  onAction?: PtRendererProps["onAction"];
};

/** Edit: descendants must not hit-test (parent `none` does not stop child `auto`). */
export const EDIT_OVERLAY_POINTER_CSS =
  '[data-pt-overlay][data-pt-mode="edit"] [data-pt-overlay-id],[data-pt-overlay][data-pt-mode="edit"] [data-pt-overlay-id] *{pointer-events:none !important}';

function patchPageNode(
  document: PtDocument,
  nodeId: string,
  patch: Parameters<PtRendererProps["onCommit"]>[0],
): PtDocument {
  const page = document.pages[0];
  if (!page) return document;
  return {
    version: document.version,
    pages: [
      {
        id: page.id,
        nodes: page.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
      },
    ],
  };
}

/**
 * Sit inside Excalidraw's Artist multi-stroke (roughness 1, 2px, two paths).
 * A 2px inset covers the inner offset path and the frame looks geometrically straight.
 */
export function overlayArtistInset(view: { width: number; height: number }, zoom: number): number {
  const pad = HANDLE_STROKE_WIDTH * 2 * Math.max(0.0001, zoom);
  const cap = Math.min(view.width, view.height) * 0.1;
  return Math.round(Math.min(pad, cap) * 100) / 100;
}

function overlayRootStyle(origin: OriginBox | null): CSSProperties {
  return {
    position: "absolute",
    pointerEvents: "none",
    overflow: "visible",
    ...(origin
      ? { left: origin.left, top: origin.top, width: origin.width, height: origin.height }
      : { inset: 0 }),
  };
}

function layerStyle(node: PtNode, appState: OverlayAppState, mode: OverlayHostProps["mode"]): CSSProperties {
  const view = sceneToViewport(node, appState);
  const inset = overlayArtistInset(view, appState.zoom.value);
  return {
    position: "absolute",
    left: view.x + inset,
    top: view.y + inset,
    width: Math.max(1, view.width - inset * 2),
    height: Math.max(1, view.height - inset * 2),
    boxSizing: "border-box",
    transform: `rotate(${view.rotation}deg)`,
    transformOrigin: "center center",
    pointerEvents: mode === "interact" ? "auto" : "none",
    zIndex: OVERLAY_Z_INDEX,
    overflow: "hidden",
    background: "transparent",
    border: "none",
    borderRadius: Math.max(0, HANDLE_ROUNDNESS.value * Math.max(0.0001, appState.zoom.value) - inset),
  };
}

export function overlayFitStyle(
  view: { width: number; height: number },
  defaultBBox: { width: number; height: number },
): CSSProperties {
  const dw = Math.max(1, defaultBBox.width);
  const dh = Math.max(1, defaultBBox.height);
  return {
    width: dw,
    height: dh,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    transform: `scale(${view.width / dw}, ${view.height / dh})`,
    transformOrigin: "top left",
  };
}

export function OverlayHost({
  document,
  mode,
  appState,
  onCommit,
  onAction,
}: OverlayHostProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<OriginBox | null>(null);
  const nodes = document.pages[0]?.nodes ?? [];

  useLayoutEffect(() => {
    const layer = rootRef.current;
    const board = layer?.closest("[data-testid='pt-design-board']");
    if (!(board instanceof HTMLElement)) return;

    const sync = () => {
      const canvas = findCanvasOriginNode(board);
      if (!canvas) return;
      const next = canvasOriginInBoard(board, canvas);
      setOrigin((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next,
      );
    };

    sync();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(sync) : null;
    ro?.observe(board);
    const canvas = findCanvasOriginNode(board);
    if (canvas && ro) ro.observe(canvas);
    const mo = typeof MutationObserver === "function" ? new MutationObserver(sync) : null;
    mo?.observe(board, { childList: true, subtree: true });
    window.addEventListener("resize", sync);
    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-pt-overlay=""
      data-pt-overlay-origin="canvas"
      data-pt-mode={mode}
      style={overlayRootStyle(origin)}
      onPointerDownCapture={
        mode === "interact"
          ? (event) => {
              const root = pressableButtonRoot(event);
              if (root) armInteractPress(root);
            }
          : undefined
      }
    >
      {mode === "edit" ? <style>{EDIT_OVERLAY_POINTER_CSS}</style> : null}
      {nodes.map((node) => {
        const mod = getComponentModule(node.type);
        const view = sceneToViewport(node, appState);
        const inset = overlayArtistInset(view, appState.zoom.value);
        const box = {
          width: Math.max(1, view.width - inset * 2),
          height: Math.max(1, view.height - inset * 2),
        };
        return (
          <div
            key={node.id}
            data-pt-overlay-id={node.id}
            data-pt-node-type={node.type}
            inert={mode === "edit" ? true : undefined}
            style={layerStyle(node, appState, mode)}
          >
            <div data-pt-overlay-fit="" style={overlayFitStyle(box, mod.defaultBBox)}>
              <ArtistInkHost seed={node.id}>
                <mod.Renderer
                  node={node}
                  mode={mode}
                  onCommit={(patch) => onCommit(patchPageNode(document, node.id, patch))}
                  onAction={onAction}
                />
              </ArtistInkHost>
            </div>
          </div>
        );
      })}
    </div>
  );
}
