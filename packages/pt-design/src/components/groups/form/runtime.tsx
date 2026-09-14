import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { PtNode } from "../../../protocol";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { FILL, FONT } from "./node";

let formByType: ReadonlyMap<string, PtComponentModule> = new Map();

export function bindFormModules(modules: readonly PtComponentModule[]): void {
  formByType = new Map(modules.map((mod) => [mod.type, mod]));
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

const rootStyle = (mode: PtRendererProps["mode"]): CSSProperties => ({
  ...FILL,
  position: "relative",
  pointerEvents: mode === "edit" ? "none" : "auto",
  fontFamily: FONT,
  fontSize: 14,
  color: "var(--pt-ink, #1e1e1e)",
  overflow: "visible",
});

export function ControlRoot({
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

export function UnresolvedNode({ node }: { node: PtNode }): ReactElement {
  return (
    <div
      data-pt-unresolved-type={node.type}
      style={{
        ...FILL,
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        border: "1px dashed rgba(0,0,0,0.25)",
        borderRadius: 8,
        color: "#71717a",
        fontFamily: FONT,
        fontSize: 13,
      }}
    >
      {propText(node, "label", node.type)}
    </div>
  );
}

export function FormChild(props: PtRendererProps): ReactElement {
  const mod = formByType.get(props.node.type);
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
      <FormChild
        node={child}
        mode={mode}
        onCommit={(patch) => onCommit({ children: patchChild(node.children, child.id, patch) })}
        onAction={onAction}
      />
    </div>
  ));
}

export const clickRun = [{ event: "click" as const, actions: [{ type: "agent" as const, name: "run" }] }];
