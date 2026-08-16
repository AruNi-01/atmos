import type { BBox, PtProps } from "../core/types";

export const DESIGN_IR_VERSION = "pt-design-ir/1" as const;
export type DesignIRVersion = typeof DESIGN_IR_VERSION;

export type DesignNode = {
  instanceId: string;
  componentType: string;
  variant?: string;
  size?: string;
  props: PtProps;
  bbox: BBox;
  zIndex?: number;
  children?: DesignNode[];
};

export type DesignFrame = {
  id: string;
  name: string;
  bbox: BBox;
  nodes: DesignNode[];
};

export type DesignIR = {
  version: DesignIRVersion;
  catalogVersion: string;
  meta: {
    title?: string;
    exportedAt: string;
    source: "pt-design";
  };
  frames: DesignFrame[];
  freeNodes: DesignNode[];
};
