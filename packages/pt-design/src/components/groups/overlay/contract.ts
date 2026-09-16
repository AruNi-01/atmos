import type { ReactElement } from "react";
import type { PtNode, PtNodeType } from "../../../protocol";

export type PtRendererProps = {
  node: PtNode;
  mode: "edit" | "interact";
  onCommit: (
    patch: Partial<Pick<PtNode, "value" | "checked" | "props" | "options" | "children">>,
  ) => void;
  onAction?: (payload: {
    nodeId: string;
    event: "click" | "change";
    action: { type: "agent"; name: string };
  }) => void;
};

export type PtInspectorField = { key: string; kind: "text" | "boolean" | "number" };

export type PtComponentModule = {
  type: PtNodeType;
  defaultNode: (id: string) => PtNode;
  Renderer: (props: PtRendererProps) => ReactElement;
  agentDescription: string;
  xmlExample: string;
  defaultBBox: { width: number; height: number };
  inspectorFields: PtInspectorField[];
};
