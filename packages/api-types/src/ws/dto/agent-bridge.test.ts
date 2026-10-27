import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentBridgeListRequest, AgentBridgeListResponse } from "./agent-bridge";

const dto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "agent-bridge.ts"), "utf8");

describe("agent-bridge list session directory contract", () => {
  it("pages chat sessions instead of provider install rows", () => {
    expect(dto).toContain("provider_id?: string | null");
    expect(dto).toContain("agent?: string | null");
    expect(dto).toContain("next_cursor?: string | null");
    expect(dto).toContain("has_more: boolean");
    expect(dto).toContain("last_activity_at?: string | null");
    const req: AgentBridgeListRequest = {
      provider_id: "claude",
      workspace_id: "ws-1",
      limit: 20,
    };
    const res: AgentBridgeListResponse = {
      server_id: "srv",
      entries: [
        {
          kind: "chat",
          provider_id: "claude",
          display_name: "Fix login",
          title: "Fix login",
          server_id: "srv",
          chat_id: "c1",
          workspace_id: "ws-1",
          occupancy: "idle",
          updated_at: "2026-10-27T12:00:00Z",
          last_activity_at: "2026-10-27T12:00:00Z",
        },
      ],
      next_cursor: "2026-10-27T12:00:00Z\nc1",
      has_more: true,
    };
    expect(req.agent).toBeUndefined();
    expect(res.entries[0]?.kind).toBe("chat");
    expect(res.entries[0]?.display_name.startsWith("chat ")).toBe(false);
  });
});
