import type { CollabRoom } from "../collab/constants";

export const DEFAULT_AGENT_API_BASE = "http://127.0.0.1:30303";
export const MCP_NPX_PACKAGE = "@atmos/pt-design";
export const MCP_NPX_BIN = "pt-design-mcp";

export function roomEnvValue(room: CollabRoom): string {
  return `${room.roomId},${room.roomKey}`;
}

export function normalizeAgentApiBase(raw?: string | null): string {
  const trimmed = raw?.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_AGENT_API_BASE;
}

export function agentInvokeUrl(apiBase?: string | null): string {
  return `${normalizeAgentApiBase(apiBase)}/api/pt-design/agent/invoke`;
}

/** External-agent fallback only. Atmos itself does not ask users to paste this. */
export function buildMcpConfig(room: CollabRoom): string {
  return JSON.stringify(
    {
      mcpServers: {
        "pt-design": {
          command: "npx",
          args: ["-y", "-p", MCP_NPX_PACKAGE, MCP_NPX_BIN],
          env: {
            PT_DESIGN_COLLAB_ROOM: roomEnvValue(room),
          },
        },
      },
    },
    null,
    2,
  );
}

export function buildLocalAgentPrompt(room: CollabRoom, apiBase?: string | null): string {
  const invoke = agentInvokeUrl(apiBase);
  const roomValue = roomEnvValue(room);
  return [
    "The live Prototype Design board is already open on this computer.",
    "Do not start MCP. Do not install a CLI. Do not edit a separate .ptdesign.json.",
    `POST ${invoke}`,
    "Content-Type: application/json",
    JSON.stringify(
      {
        request_id: "<new-uuid>",
        tool: "pt_ir_get",
        args: {},
        room: roomValue,
      },
      null,
      2,
    ),
    "Call pt_catalog_list and pt_ir_get first, then pt_place / pt_update / pt_frame_create.",
    "Your collaborator name is Agent.",
  ].join("\n");
}
