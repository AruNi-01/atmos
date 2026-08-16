export { PtDesignApp } from "./embed/PtDesignApp";
export type { PtDesignAppProps } from "./embed/PtDesignApp";
export {
  createPtDesignSession,
  openDesignDocument,
  saveDesignDocument,
  initDesignDocument,
  encodeDesignIR,
  normalizeIR,
  applyDesignIR,
  buildHandoffPayload,
  listComponentTypes,
  getComponentTemplate,
  PT_DESIGN_TOOL_DEFS,
  SHADCN_BASIC_IDS,
  REQUIRED_BLOCKS,
} from "./headless";
export type {
  PtDesignSession,
  PtDesignCommand,
  DesignIR,
  PersistenceAdapter,
  HandoffSink,
  PtTheme,
} from "./headless";
