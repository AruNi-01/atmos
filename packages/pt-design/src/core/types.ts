export type PtSize = "sm" | "default" | "lg" | string;

export type PtProps = Record<string, string | number | boolean | null>;

export type PtMeta = {
  schemaVersion: 1;
  instanceId: string;
  componentType: string;
  catalogVersion: string;
  variant?: string;
  size?: PtSize;
  props: PtProps;
};

export type PtElementType =
  | "rectangle"
  | "ellipse"
  | "text"
  | "line"
  | "arrow"
  | "frame"
  | "freedraw"
  | "diamond";

export type PtElement = {
  id: string;
  type: PtElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "solid" | "hachure";
  strokeWidth: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number } | null;
  seed: number;
  version?: number;
  versionNonce: number;
  index?: string | null;
  isDeleted: boolean;
  boundElements: { id: string; type: string }[] | null;
  updated: number;
  locked: boolean;
  link?: string | null;
  customData?: { pt?: Partial<PtMeta> & { schemaVersion?: 1 } };
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle";
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
  autoResize?: boolean;
  points?: [number, number][];
  name?: string;
  startBinding?: unknown | null;
  endBinding?: unknown | null;
};

export type PtScene = {
  elements: PtElement[];
  appState: {
    viewBackgroundColor: string;
  };
};

export function emptyScene(): PtScene {
  return {
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
  };
}

export type BBox = { x: number; y: number; w: number; h: number };
