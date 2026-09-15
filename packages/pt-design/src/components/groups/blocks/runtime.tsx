import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { PtNode } from "../../../protocol";
import { SKETCH_INK, SKETCH_PAPER, SKETCH_RADIUS_CSS } from "../../sketch";
import { FORM_MODULES } from "../form";
import { OVERLAY_MODULES } from "../overlay";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { FILL, FONT } from "./node";

const formByType: ReadonlyMap<string, PtComponentModule> = new Map(
  FORM_MODULES.map((mod) => [mod.type, mod]),
);
const overlayByType: ReadonlyMap<string, PtComponentModule> = new Map(
  OVERLAY_MODULES.map((mod) => [mod.type, mod]),
);

let blockByType: ReadonlyMap<string, PtComponentModule> = new Map();

export function bindBlockModules(modules: readonly PtComponentModule[]): void {
  blockByType = new Map(modules.map((mod) => [mod.type, mod]));
}

export function moduleOf(type: string): PtComponentModule | undefined {
  return formByType.get(type) ?? overlayByType.get(type) ?? blockByType.get(type);
}

export function propText(node: PtNode, key: string, fallback = ""): string {
  const value = node.props[key];
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function patchChild(
  children: PtNode[] | undefined,
  childId: string,
  patch: Partial<Pick<PtNode, "value" | "checked" | "props" | "options" | "children">>,
): PtNode[] {
  return (children ?? []).map((child) => (child.id === childId ? { ...child, ...patch } : child));
}

const rootStyle = (mode: PtRendererProps["mode"]): CSSProperties => ({
  ...FILL,
  position: "relative",
  pointerEvents: mode === "edit" ? "none" : "auto",
  fontFamily: FONT,
  fontSize: 14,
  color: SKETCH_INK,
  background: SKETCH_PAPER,
  border: "none",
  borderRadius: 0,
  boxShadow: "none",
  overflow: "hidden",
});

/** Pad so a 4-side border is not full-bleed (Artist ink hides those). */
export const INSET_PAD = 8;

export function InsetSurface({
  children,
  style,
  border = `1px solid ${SKETCH_INK}`,
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
          borderRadius: SKETCH_RADIUS_CSS,
          background: SKETCH_PAPER,
          overflow: "hidden",
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function BlockRoot({
  node,
  mode,
  children,
}: {
  node: PtNode;
  mode: PtRendererProps["mode"];
  children: ReactNode;
}): ReactElement {
  return (
    <div
      data-pt-type={node.type}
      data-pt-id={node.id}
      data-pt-mode={mode}
      inert={mode === "edit" ? true : undefined}
      style={rootStyle(mode)}
    >
      {children}
    </div>
  );
}

function UnresolvedNode({ node }: { node: PtNode }): ReactElement {
  return (
    <div
      data-pt-unresolved-type={node.type}
      style={{
        ...FILL,
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        border: "1px dashed rgba(0,0,0,0.25)",
        borderRadius: SKETCH_RADIUS_CSS,
        color: "#71717a",
        fontFamily: FONT,
        fontSize: 13,
      }}
    >
      {propText(node, "label", node.type)}
    </div>
  );
}

function ChildRenderer(props: PtRendererProps): ReactElement {
  const mod = moduleOf(props.node.type);
  if (!mod) return <UnresolvedNode node={props.node} />;
  return <mod.Renderer {...props} />;
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
      <ChildRenderer
        node={child}
        mode={mode}
        onCommit={(patch) => onCommit({ children: patchChild(node.children, child.id, patch) })}
        onAction={onAction}
      />
    </div>
  ));
}

export function BlockPanel({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const title = propText(node, "title");
  const description = propText(node, "description");
  return (
    <BlockRoot node={node} mode={mode}>
      <InsetSurface>
        {title ? (
          <div
            style={{
              position: "absolute",
              left: 16,
              top: 16,
              right: 16,
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
        ) : null}
        {description ? (
          <div
            style={{
              position: "absolute",
              left: 16,
              top: 40,
              right: 16,
              fontSize: 13,
              lineHeight: 1.45,
              color: "#71717a",
            }}
          >
            {description}
          </div>
        ) : null}
        {renderTreeChildren(node, mode, onCommit, onAction)}
      </InsetSurface>
    </BlockRoot>
  );
}
