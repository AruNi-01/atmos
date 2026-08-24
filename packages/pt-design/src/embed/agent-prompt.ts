export const DEFAULT_AGENT_API_BASE = "http://127.0.0.1:30303";
export const MCP_NPX_PACKAGE = "@atmos/pt-design";
export const MCP_NPX_BIN = "pt-design-mcp";

/** Synced to ~/.atmos/skills/.system/ on Atmos startup (same pattern as Canvas). */
export const PT_DESIGN_AGENT_SKILL_PATH =
  "~/.atmos/skills/.system/atmos-pt-design-agent/SKILL.md";

export const PT_DESIGN_AGENT_CONTEXT_KIND = "pt-design-agent";

export function normalizeAgentApiBase(raw?: string | null): string {
  const trimmed = raw?.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_AGENT_API_BASE;
}

export function agentInvokeUrl(apiBase?: string | null): string {
  return `${normalizeAgentApiBase(apiBase)}/api/pt-design/agent/invoke`;
}

/** External-agent fallback only. File documents, not the open Atmos tab. */
export function buildMcpConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        "pt-design": {
          command: "npx",
          args: ["-y", "-p", MCP_NPX_PACKAGE, MCP_NPX_BIN],
        },
      },
    },
    null,
    2,
  );
}

export function buildLocalAgentPrompt(clientId: string, apiBase?: string | null): string {
  const invoke = agentInvokeUrl(apiBase);
  return [
    `atmos://context/${PT_DESIGN_AGENT_CONTEXT_KIND}`,
    "The live Prototype Design board is already open on this computer.",
    `Read ${PT_DESIGN_AGENT_SKILL_PATH} and follow it.`,
    "Do not start MCP. Do not install a CLI. Do not edit a separate .ptdesign.json. Do not join a collaboration room.",
    `POST ${invoke}`,
    "Content-Type: application/json",
    JSON.stringify(
      {
        request_id: "<new-uuid>",
        tool: "pt_ir_get",
        args: {},
        client_id: clientId,
      },
      null,
      2,
    ),
  ].join("\n");
}
