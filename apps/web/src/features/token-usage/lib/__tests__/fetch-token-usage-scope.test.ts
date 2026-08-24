// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { fetchAllComputersTokenUsage } from "@/features/token-usage/lib/fetch-all-token-usage";
import { fetchRemoteTokenUsageOverview } from "@/features/token-usage/lib/fetch-remote-token-usage";
import type { UniqueComputer } from "@/features/token-usage/lib/unique-computers";

function overview(total: number): TokenUsageOverviewResponse {
  return {
    query: { group_by: "model" },
    summary: {
      total_tokens: total,
      total_cost_usd: 1,
      total_messages: 1,
      active_days: 1,
      range_start: "2026-01-01",
      range_end: "2026-01-01",
      processing_time_ms: 1,
    },
    by_client: [],
    by_model: [],
    by_day: [
      {
        date: "2026-01-01",
        breakdown: {
          input_tokens: total,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          reasoning_tokens: 0,
          total_tokens: total,
        },
        total_tokens: total,
        total_cost_usd: 1,
        message_count: 1,
        by_client: [],
      },
    ],
    by_month: [],
    available_years: ["2026"],
    generated_at: 1,
    partial_warnings: [],
  };
}

const laptop: UniqueComputer = {
  key: "app:aa",
  serverId: "laptop",
  label: "Laptop",
  isCurrent: true,
};
const vps: UniqueComputer = {
  key: "app:bb",
  serverId: "vps",
  label: "VPS",
  isCurrent: false,
};

describe("fetchRemoteTokenUsageOverview", () => {
  it("requests a refresh without cookies and disconnects", async () => {
    const requests: unknown[] = [];
    let disconnected = false;
    const result = await fetchRemoteTokenUsageOverview("srv_other", {
      createClientSession: async (serverId) => {
        expect(serverId).toBe("srv_other");
        return { ws_url: "wss://relay.example/ws/client?server_id=srv_other" };
      },
      openSession: () => ({
        connect: async () => undefined,
        waitUntilConnected: async () => undefined,
        request: async (_action, data) => {
          requests.push(data);
          return overview(9);
        },
        disconnect: () => {
          disconnected = true;
        },
      }),
    });
    expect(result.summary.total_tokens).toBe(9);
    expect(requests).toEqual([
      {
        refresh: true,
        try_cookies: false,
        year: null,
        since: null,
        until: null,
        clients: null,
        group_by: null,
      },
    ]);
    expect(disconnected).toBe(true);
  });

  it("disconnects when the request fails", async () => {
    let disconnected = false;
    await expect(
      fetchRemoteTokenUsageOverview("srv_other", {
        createClientSession: async () => ({ ws_url: "wss://relay.example/ws" }),
        openSession: () => ({
          connect: async () => undefined,
          waitUntilConnected: async () => undefined,
          request: async () => {
            throw new Error("offline");
          },
          disconnect: () => {
            disconnected = true;
          },
        }),
      }),
    ).rejects.toThrow("offline");
    expect(disconnected).toBe(true);
  });
});

describe("fetchAllComputersTokenUsage", () => {
  it("uses current fetch for the workbench device and remote for others", async () => {
    const remoteIds: string[] = [];
    const merged = await fetchAllComputersTokenUsage([laptop, vps], {
      fetchCurrent: async () => overview(100),
      fetchRemote: async (serverId) => {
        remoteIds.push(serverId);
        return overview(50);
      },
      formatMissed: (label) => `${label} was not included`,
    });
    expect(remoteIds).toEqual(["vps"]);
    expect(merged.summary.total_tokens).toBe(150);
  });

  it("keeps successes and names misses", async () => {
    const merged = await fetchAllComputersTokenUsage([laptop, vps], {
      fetchCurrent: async () => overview(40),
      fetchRemote: async () => {
        throw new Error("offline");
      },
      formatMissed: (label) => `${label} was not included`,
    });
    expect(merged.summary.total_tokens).toBe(40);
    expect(merged.partial_warnings).toContain("VPS was not included");
  });

  it("errors when every computer fails", async () => {
    await expect(
      fetchAllComputersTokenUsage([laptop, vps], {
        fetchCurrent: async () => {
          throw new Error("down");
        },
        fetchRemote: async () => {
          throw new Error("down");
        },
        formatMissed: (label) => label,
      }),
    ).rejects.toThrow("none-reached");
  });
});
