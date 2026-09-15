import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { PtNode } from "../../../protocol";
import { FORM_MODULES } from "../form";
import { OVERLAY_MODULES } from "../overlay";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { FILL, FONT, T } from "./node";

const formByType = new Map(FORM_MODULES.map((mod) => [mod.type, mod]));
const overlayByType = new Map(OVERLAY_MODULES.map((mod) => [mod.type, mod]));

let displayByType: ReadonlyMap<string, PtComponentModule> = new Map();

export function bindDisplayModules(modules: readonly PtComponentModule[]): void {
  displayByType = new Map(modules.map((mod) => [mod.type, mod]));
}

export function propText(node: PtNode, key: string, fallback = ""): string {
  const value = node.props[key];
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function fireAgentActions(
  node: PtNode,
  event: "click" | "change",
  onAction: PtRendererProps["onAction"],
): void {
  if (!onAction) return;
  for (const handler of node.events ?? []) {
    if (handler.event !== event) continue;
    for (const action of handler.actions) {
      onAction({ nodeId: node.id, event, action });
    }
  }
}

export function patchChild(
  children: PtNode[] | undefined,
  childId: string,
  patch: Partial<Pick<PtNode, "value" | "checked" | "props" | "options" | "children">>,
): PtNode[] {
  return (children ?? []).map((child) => (child.id === childId ? { ...child, ...patch } : child));
}

export function emit(
  node: PtNode,
  patch: Parameters<PtRendererProps["onCommit"]>[0],
  onCommit: PtRendererProps["onCommit"],
  onAction: PtRendererProps["onAction"],
  event: "click" | "change" = "click",
): void {
  onCommit(patch);
  fireAgentActions(node, event, onAction);
}

const rootStyle = (mode: PtRendererProps["mode"]): CSSProperties => ({
  ...FILL,
  position: "relative",
  pointerEvents: mode === "edit" ? "none" : "auto",
  fontFamily: FONT,
  fontSize: 14,
  color: T.fg,
  overflow: "visible",
});

export function ControlRoot({
  node,
  mode,
  children,
  role,
}: {
  node: PtNode;
  mode: PtRendererProps["mode"];
  children: ReactNode;
  role?: string;
}): ReactElement {
  return (
    <div
      data-pt-type={node.type}
      data-pt-id={node.id}
      data-pt-mode={mode}
      role={role}
      inert={mode === "edit" ? true : undefined}
      style={rootStyle(mode)}
    >
      {children}
    </div>
  );
}

export function DisplayChild(props: PtRendererProps): ReactElement {
  const display = displayByType.get(props.node.type);
  if (display) return <display.Renderer {...props} />;
  const form = formByType.get(props.node.type);
  if (form) return <form.Renderer {...props} />;
  const overlay = overlayByType.get(props.node.type);
  if (overlay) return <overlay.Renderer {...props} />;
  return <div data-pt-unresolved-type={props.node.type} />;
}

export function renderTreeChildren(
  node: PtNode,
  mode: PtRendererProps["mode"],
  onCommit: PtRendererProps["onCommit"],
  onAction: PtRendererProps["onAction"],
): ReactElement[] {
  return (node.children ?? []).map((child) => (
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
      <DisplayChild
        node={child}
        mode={mode}
        onCommit={(patch) => onCommit({ children: patchChild(node.children, child.id, patch) })}
        onAction={onAction}
      />
    </div>
  ));
}

export function renderFlowChildren(
  node: PtNode,
  mode: PtRendererProps["mode"],
  onCommit: PtRendererProps["onCommit"],
  onAction: PtRendererProps["onAction"],
): ReactElement[] {
  return (node.children ?? []).map((child) => (
    <div key={child.id} data-pt-child={child.id} style={{ width: "100%", boxSizing: "border-box" }}>
      <DisplayChild
        node={child}
        mode={mode}
        onCommit={(patch) => onCommit({ children: patchChild(node.children, child.id, patch) })}
        onAction={onAction}
      />
    </div>
  ));
}

export const ghostBtn: CSSProperties = {
  appearance: "none",
  border: `1.5px solid ${T.border}`,
  background: T.bg,
  color: T.fg,
  borderRadius: T.radius,
  padding: "6px 10px",
  fontSize: 13,
  fontFamily: FONT,
  cursor: "pointer",
  lineHeight: 1.2,
};

export const primaryBtn: CSSProperties = {
  ...ghostBtn,
  border: `1.5px solid ${T.primary}`,
};

/** Pad so a 4-side border is not full-bleed (Artist ink hides those). */
export const INSET_PAD = 8;

export function InsetSurface({
  children,
  style,
  border = `1px solid ${T.border}`,
}: {
  children: ReactNode;
  style?: CSSProperties;
  border?: string;
}): ReactElement {
  return (
    <div style={{ ...FILL, padding: INSET_PAD, boxSizing: "border-box" }}>
      <div
        data-pt-inset=""
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          border,
          borderRadius: T.radius,
          background: T.bg,
          overflow: "hidden",
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}
