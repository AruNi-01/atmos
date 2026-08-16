export { PtDesignApp } from "./embed/PtDesignApp";
export type { PtDesignAppProps } from "./embed/PtDesignApp";
export { createPtDesignSession } from "./core/session";
export type { PtDesignSession, PtDesignCommand } from "./core/session";
export {
  openDesignDocument,
  saveDesignDocument,
  initDesignDocument,
} from "./core/document";
export type { DesignIR } from "./ir/schema";
export { encodeDesignIR, normalizeIR } from "./ir/encode";
export { applyDesignIR } from "./ir/apply";
export { buildHandoffPayload } from "./ir/handoff";
export { listComponentTypes, getComponentTemplate } from "./catalog/registry";
export { PT_DESIGN_TOOL_DEFS } from "./agent/tool-defs";
export { SHADCN_BASIC_IDS, REQUIRED_BLOCKS } from "./catalog/shadcn-list";
export type { PersistenceAdapter, HandoffSink, PtTheme } from "./host/adapters";
