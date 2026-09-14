import type { RequiredBlockId, ShadcnBasicId } from "../catalog/shadcn-list";

export type PtNodeType = ShadcnBasicId | RequiredBlockId;

export type PtOption = { value: string; label: string };
export type PtAction = { type: "agent"; name: string };
export type PtHandler = { event: "click" | "change"; actions: PtAction[] };

export type PtNode = {
  id: string;
  type: PtNodeType;
  props: Record<string, string | number | boolean | null>;
  value?: string;
  checked?: boolean;
  options?: PtOption[];
  events?: PtHandler[];
  children?: PtNode[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export type PtDocument = {
  version: "ptx/1";
  pages: [{ id: string; nodes: PtNode[] }];
};

export type PtNodePayload = Pick<
  PtNode,
  "id" | "type" | "props" | "value" | "checked" | "options" | "events" | "children"
>;

export type HandleElement = {
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  isDeleted?: boolean;
  customData?: { pt?: PtNodePayload };
  backgroundColor?: string;
  strokeWidth?: number;
};
