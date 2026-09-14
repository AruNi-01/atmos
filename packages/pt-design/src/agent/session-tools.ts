import { getComponentModule, listComponentTypes } from "../components/registry";
import { PtDesignError } from "../protocol";
import {
  allToolDefs,
  liveBoardToolNames,
  unknownToolMessage,
  usageMessage,
  type ToolName,
} from "./tool-defs";

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type PtxSession = {
  getPtx(): string;
  applyPtx(xml: string): void;
};

export function catalogListFromRegistry(): {
  types: Array<{
    type: string;
    xmlExample: string;
    agentDescription: string;
    defaultBBox: { width: number; height: number };
  }>;
} {
  return {
    types: listComponentTypes().map((type) => {
      const mod = getComponentModule(type);
      return {
        type,
        xmlExample: mod.xmlExample,
        agentDescription: mod.agentDescription,
        defaultBBox: mod.defaultBBox,
      };
    }),
  };
}

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

const LIVE_ONLY = "pt_screenshot requires the open Prototype Design tab. POST /api/pt-design/agent/invoke.";
const DOC_FILE_ONLY =
  "Live board tools do not use .ptd files. Use Save/Open in the board, or pt_ptx_get / pt_ptx_apply.";

/** Browser-safe tool runner. No filesystem. Headless PTX + catalog. */
export function runSessionTool(session: PtxSession, call: ToolCall): unknown {
  const { name, args } = call;
  switch (name as ToolName | string) {
    case "pt_tools_list":
      return {
        tools: allToolDefs().map((def) => ({
          name: def.name,
          title: def.title,
          description: def.description,
          args: def.args,
          live: def.live !== false,
          readOnly: Boolean(def.readOnly),
        })),
        live: liveBoardToolNames(),
      };
    case "pt_catalog_list":
      return catalogListFromRegistry();
    case "pt_ptx_get":
      return { ptx: session.getPtx() };
    case "pt_ptx_apply": {
      const ptx = str(args, "ptx");
      if (ptx === undefined) {
        throw new PtDesignError("invalid_ptx", usageMessage("pt_ptx_apply", "ptx is required"));
      }
      session.applyPtx(ptx);
      return { ok: true };
    }
    case "pt_screenshot":
      throw new PtDesignError("path_denied", LIVE_ONLY);
    case "pt_doc_init":
    case "pt_doc_open":
    case "pt_doc_save":
      throw new PtDesignError("path_denied", DOC_FILE_ONLY);
    default:
      throw new PtDesignError("unknown_tool", unknownToolMessage(name));
  }
}
