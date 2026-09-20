import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { PtNode } from "../../../protocol";
import type { PtRendererProps } from "./contract";
import { FILL, FONT, T } from "./node";

export function propText(node: PtNode, key: string, fallback = ""): string {
  const value = node.props[key];
  if (value === null || value === undefined) return fallback;
  return String(value);
}

const rootStyle = (mode: PtRendererProps["mode"]): CSSProperties => ({
  ...FILL,
  position: "relative",
  pointerEvents: mode === "edit" ? "none" : "auto",
  fontFamily: FONT,
  fontSize: 14,
  color: T.fg,
  overflow: "hidden",
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
