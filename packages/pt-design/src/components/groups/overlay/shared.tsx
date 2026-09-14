import { type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { PtNode } from "../../../protocol";
import { SKETCH_FONT, SKETCH_INK, SKETCH_PAPER, SKETCH_RADIUS } from "../../sketch";
import { overlayModuleOf } from "./catalog";
import type { PtRendererProps } from "./contract";

export const overlayTokens = {
  bg: SKETCH_PAPER,
  fg: SKETCH_INK,
  muted: "color-mix(in srgb, var(--pt-ink, #1e1e1e) 62%, transparent)",
  mutedBg: "color-mix(in srgb, var(--pt-ink, #1e1e1e) 8%, var(--pt-paper, #fffef7))",
  border: SKETCH_INK,
  primary: SKETCH_INK,
  primaryFg: SKETCH_PAPER,
  destructive: "#dc2626",
  destructiveFg: SKETCH_PAPER,
  radius: SKETCH_RADIUS,
  font: SKETCH_FONT,
  shadow: "2px 3px 0 color-mix(in srgb, var(--pt-ink, #1e1e1e) 18%, transparent)",
} as const;

export const rootStyle = (_node: PtNode, mode: "edit" | "interact"): CSSProperties => ({
  pointerEvents: mode === "edit" ? "none" : "auto",
  position: "relative",
  boxSizing: "border-box",
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  color: overlayTokens.fg,
  background: overlayTokens.bg,
  border: "none",
  borderRadius: 0,
  boxShadow: "none",
  fontFamily: overlayTokens.font,
  overflow: "hidden",
});

export function emitValue(
  node: PtNode,
  value: string,
  onCommit: PtRendererProps["onCommit"],
  onAction: PtRendererProps["onAction"],
  event: "click" | "change" = "click",
): void {
  onCommit({ value });
  const handler = node.events?.find((item) => item.event === event);
  if (!handler || !onAction) return;
  for (const action of handler.actions) {
    onAction({ nodeId: node.id, event, action });
  }
}

function commitChild(
  parent: PtNode,
  childId: string,
  patch: Parameters<PtRendererProps["onCommit"]>[0],
  onCommit: PtRendererProps["onCommit"],
): void {
  const children = (parent.children ?? []).map((child) => {
    if (child.id !== childId) return child;
    return {
      ...child,
      ...patch,
      props: patch.props ? { ...child.props, ...patch.props } : child.props,
    };
  });
  onCommit({ children });
}

export function OverlayChildren(props: PtRendererProps): ReactElement | null {
  const kids = props.node.children;
  if (!kids || kids.length === 0) return null;
  return (
    <>
      {kids.map((child) => {
        const mod = overlayModuleOf(child.type);
        const body = !mod ? (
          <div data-pt-unresolved-type={child.type} />
        ) : (
          <mod.Renderer
            node={child}
            mode={props.mode}
            onCommit={(patch) => commitChild(props.node, child.id, patch, props.onCommit)}
            onAction={props.onAction}
          />
        );
        return (
          <div
            key={child.id}
            data-pt-child={child.id}
            style={{
              position: "absolute",
              left: child.x,
              top: child.y,
              width: child.width,
              height: child.height,
              boxSizing: "border-box",
            }}
          >
            {body}
          </div>
        );
      })}
    </>
  );
}

export function OverlayFrame(props: {
  node: PtNode;
  mode: "edit" | "interact";
  onCommit: PtRendererProps["onCommit"];
  onAction?: PtRendererProps["onAction"];
  role?: string;
  style?: CSSProperties;
  children: ReactNode;
}): ReactElement {
  const edit = props.mode === "edit";
  return (
    <div
      data-pt-type={props.node.type}
      data-pt-id={props.node.id}
      data-pt-mode={props.mode}
      data-pt-overlay="in-place"
      role={props.role}
      inert={edit ? true : undefined}
      style={{ ...rootStyle(props.node, props.mode), ...props.style }}
    >
      {props.children}
      <OverlayChildren
        node={props.node}
        mode={props.mode}
        onCommit={props.onCommit}
        onAction={props.onAction}
      />
    </div>
  );
}
