import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { getComponentModule } from "../../components/registry";
import { PT_RADIUS_DEFAULT, radiusHandlePx, radiusInnerPx, resolveRadiusChoice, type PtRadiusToken } from "../../components/radius";
import { HANDLE_STROKE_WIDTH, OVERLAY_Z_INDEX, sceneToViewport } from "../../excalidraw-bridge";
import type { PtDocument, PtNode } from "../../protocol";
import type { PtRendererProps } from "../../components/types";
import { ArtistInkHost } from "./artist-ink";
import { canvasOriginInBoard, findCanvasOriginNode, type OriginBox } from "./canvas-origin";
import {
  applyTextHit,
  findEditableHost,
  findNodeInTree,
  hitTextAtPoint,
  readPlainText,
  sanitizeCollectedCopy,
  stripInert,
  type TextHit,
} from "./edit-text";
import { armInteractPress, pressableButtonRoot } from "./interact-press";
import "./sketch-ui.css";

export type OverlayAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  viewModeEnabled?: boolean;
};

export type OverlayCommitCapture = "IMMEDIATELY" | "NEVER";

export type OverlayHostProps = {
  document: PtDocument;
  mode: "edit" | "interact";
  appState: OverlayAppState;
  onCommit: (doc: PtDocument, capture?: OverlayCommitCapture) => void;
  onAction?: PtRendererProps["onAction"];
  children?: ReactNode;
  globalRadius?: PtRadiusToken;
};

/** Edit: descendants must not hit-test (parent `none` does not stop child `auto`). */
export const EDIT_OVERLAY_POINTER_CSS =
  '[data-pt-overlay][data-pt-mode="edit"] [data-pt-overlay-id]:not([data-pt-text-editing]),[data-pt-overlay][data-pt-mode="edit"] [data-pt-overlay-id]:not([data-pt-text-editing]) *{pointer-events:none !important}[data-pt-overlay][data-pt-mode="edit"] [data-pt-overlay-id][data-pt-text-editing],[data-pt-overlay][data-pt-mode="edit"] [data-pt-overlay-id][data-pt-text-editing] *{pointer-events:auto !important}';

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

const LIST_OVERFLOW_VISIBLE_TYPES = new Set(["select", "combobox", "native-select"]);

function overlayOverflow(type: string): "hidden" | "visible" {
  return LIST_OVERFLOW_VISIBLE_TYPES.has(type) ? "visible" : "hidden";
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

function overlayRadiusVars(token: PtRadiusToken): CSSProperties {
  return {
    ["--pt-radius"]: `${radiusInnerPx(token)}px`,
    ["--pt-handle-radius"]: `${radiusHandlePx(token)}px`,
  } as CSSProperties;
}

function layerStyle(
  node: PtNode,
  appState: OverlayAppState,
  mode: OverlayHostProps["mode"],
  editing: boolean,
  globalRadius: PtRadiusToken,
): CSSProperties {
  const view = sceneToViewport(node, appState);
  const inset = overlayArtistInset(view, appState.zoom.value);
  const token = resolveRadiusChoice(node.props.radius, globalRadius);
  const clip = Math.max(0, radiusHandlePx(token) * Math.max(0.0001, appState.zoom.value) - inset);
  return {
    position: "absolute",
    left: view.x + inset,
    top: view.y + inset,
    width: Math.max(1, view.width - inset * 2),
    height: Math.max(1, view.height - inset * 2),
    boxSizing: "border-box",
    transform: `rotate(${view.rotation}deg)`,
    transformOrigin: "center center",
    pointerEvents: mode === "interact" || editing ? "auto" : "none",
    zIndex: OVERLAY_Z_INDEX,
    overflow: overlayOverflow(node.type),
    background: "transparent",
    border: "none",
    borderRadius: clip,
    ...overlayRadiusVars(token),
  };
}

export function overlayFitStyle(
  view: { width: number; height: number },
  layout: { width: number; height: number },
  overflow: "hidden" | "visible" = "hidden",
): CSSProperties {
  const dw = Math.max(1, layout.width);
  const dh = Math.max(1, layout.height);
  return {
    width: dw,
    height: dh,
    minWidth: 0,
    minHeight: 0,
    overflow,
    transform: `scale(${view.width / dw}, ${view.height / dh})`,
    transformOrigin: "top left",
  };
}

type EditSession = { rootId: string; hit: TextHit; original: string };

export function OverlayHost({
  document,
  mode,
  appState,
  onCommit,
  onAction,
  children,
  globalRadius = PT_RADIUS_DEFAULT,
}: OverlayHostProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef(document);
  const onCommitRef = useRef(onCommit);
  const [origin, setOrigin] = useState<OriginBox | null>(null);
  const [edit, setEdit] = useState<EditSession | null>(null);
  const nodes = document.pages[0]?.nodes ?? [];
  documentRef.current = document;
  onCommitRef.current = onCommit;

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

  useEffect(() => {
    if (mode !== "edit") {
      setEdit(null);
      return;
    }
    const onDblClick = (event: MouseEvent) => {
      const overlay = rootRef.current;
      if (!overlay) return;
      const layers = [...overlay.querySelectorAll<HTMLElement>("[data-pt-overlay-id]")];
      const layer = layers.find((el) => containsClientPoint(el, event.clientX, event.clientY));
      if (!layer) return;
      const rootId = layer.getAttribute("data-pt-overlay-id");
      const root = documentRef.current.pages[0]?.nodes.find((node) => node.id === rootId);
      if (!rootId || !root) return;
      const hit = hitTextAtPoint(layer, event.clientX, event.clientY, root);
      if (!hit) return;
      const targetNode = findNodeInTree(root, hit.nodeId);
      const original =
        hit.kind === "option"
          ? (targetNode?.options?.find((option) => option.value === hit.optionValue)?.label ?? "")
          : String(targetNode?.props[hit.key] ?? "");
      event.preventDefault();
      event.stopPropagation();
      setEdit({ rootId, hit, original });
    };

    window.addEventListener("dblclick", onDblClick, true);
    return () => window.removeEventListener("dblclick", onDblClick, true);
  }, [mode]);

  useLayoutEffect(() => {
    if (!edit) return;
    const overlay = rootRef.current;
    const layer = overlay?.querySelector(`[data-pt-overlay-id="${edit.rootId}"]`);
    if (!(layer instanceof HTMLElement)) return;
    stripInert(layer);
    const target = findEditableHost(layer, edit.hit, edit.original);
    if (!target) return;
    target.setAttribute("contenteditable", "plaintext-only");
    if (target.getAttribute("contenteditable") !== "plaintext-only") {
      target.setAttribute("contenteditable", "true");
    }
    target.focus();
    let done = false;
    const finish = (next: string | null) => {
      if (done) return;
      done = true;
      target.removeAttribute("contenteditable");
      setEdit(null);
      if (next === null) return;
      const page = documentRef.current.pages[0];
      if (!page) return;
      const root = page.nodes.find((node) => node.id === edit.rootId);
      if (!root) return;
      const targetNode = findNodeInTree(root, edit.hit.nodeId) ?? root;
      const committed = sanitizeCollectedCopy(targetNode, edit.hit, next);
      if (committed === null) return;
      const patched = applyTextHit(root, edit.hit, committed);
      onCommitRef.current(
        {
          version: documentRef.current.version,
          pages: [{ id: page.id, nodes: page.nodes.map((node) => (node.id === patched.id ? patched : node)) }],
        },
        "IMMEDIATELY",
      );
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        finish(readPlainText(target));
      }
    };
    const onBlur = () => finish(readPlainText(target));
    target.addEventListener("keydown", onKey);
    target.addEventListener("blur", onBlur);
    return () => {
      target.removeEventListener("keydown", onKey);
      target.removeEventListener("blur", onBlur);
    };
  }, [edit]);

  return (
    <div
      ref={rootRef}
      data-pt-overlay=""
      data-pt-overlay-origin="canvas"
      data-pt-mode={mode}
      data-pt-global-radius={globalRadius}
      style={{ ...overlayRootStyle(origin), ...overlayRadiusVars(globalRadius) }}
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
        const editing = edit?.rootId === node.id;
        return (
          <div
            key={node.id}
            data-pt-overlay-id={node.id}
            data-pt-node-type={node.type}
            data-pt-radius={resolveRadiusChoice(node.props.radius, globalRadius)}
            data-pt-text-editing={editing ? "" : undefined}
            inert={mode === "edit" && !editing ? true : undefined}
            style={layerStyle(node, appState, mode, editing, globalRadius)}
            onPointerDownCapture={
              editing
                ? (event) => {
                    event.stopPropagation();
                  }
                : undefined
            }
          >
            <div
              data-pt-overlay-fit=""
              style={overlayFitStyle(box, { width: node.width, height: node.height }, overlayOverflow(node.type))}
            >
              <ArtistInkHost seed={node.id} inkKey={resolveRadiusChoice(node.props.radius, globalRadius)}>
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
      {children}
    </div>
  );
}

function containsClientPoint(el: Element, x: number, y: number): boolean {
  const box = el.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}
