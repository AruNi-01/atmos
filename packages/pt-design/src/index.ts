export { PtDesignApp } from "./embed/PtDesignApp";
export type { AgentBridge, AgentBridgeDispatch, PtDesignAppProps, ShareCopy } from "./embed/PtDesignApp";
export { runSessionTool } from "./agent/session-tools";
export { createPtDesignSession } from "./core/session";
export type { PtDesignSession, PtDesignCommand, PtDesignSnapshot } from "./core/session";
export type { DesignIR, DesignNode, DesignFrame } from "./ir/schema";
export { encodeDesignIR, normalizeIR } from "./ir/encode";
export { applyDesignIR } from "./ir/apply";
export { buildHandoffPayload, HANDOFF_INSTRUCTIONS } from "./ir/handoff";
export { listComponentTypes, getComponentTemplate } from "./catalog/registry";
export { SHADCN_BASIC_IDS, REQUIRED_BLOCKS, CATALOG_VERSION } from "./catalog/shadcn-list";
export { PT_DESIGN_TOOL_DEFS } from "./agent/tool-defs";
export { PtDesignError, PT_ERROR_CODES } from "./agent/errors";
export type {
  PersistenceAdapter,
  DesignLibrary,
  DesignLibraryItem,
  HandoffSink,
  PtTheme,
} from "./host/adapters";
export { memoryPersistence, localStoragePersistence } from "./host/adapters";
