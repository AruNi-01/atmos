export { createPtDesignSession } from "./core/session";
export type { PtDesignSession, PtDesignCommand, PtDesignSnapshot } from "./core/session";
export {
  openDesignDocument,
  saveDesignDocument,
  initDesignDocument,
} from "./core/document";
export type { DesignIR, DesignNode, DesignFrame } from "./ir/schema";
export { encodeDesignIR, normalizeIR } from "./ir/encode";
export { applyDesignIR } from "./ir/apply";
export { buildHandoffPayload, HANDOFF_INSTRUCTIONS } from "./ir/handoff";
export { listComponentTypes, getComponentTemplate } from "./catalog/registry";
export { SHADCN_BASIC_IDS, REQUIRED_BLOCKS, CATALOG_VERSION } from "./catalog/shadcn-list";
export { PT_DESIGN_TOOL_DEFS } from "./agent/tool-defs";
export { openFileSession, runTool } from "./agent/api";
export { createMcpServer } from "./mcp/server";
export { runCli } from "./cli/bin";
export { PtDesignError, PT_ERROR_CODES } from "./agent/errors";
export type { PersistenceAdapter, HandoffSink, PtTheme } from "./host/adapters";
