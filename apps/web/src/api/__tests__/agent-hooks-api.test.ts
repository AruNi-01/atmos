// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";
import { agentHooksApi } from "@/api/rest-api";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";

const originalFetch = globalThis.fetch;
const originalComputerState = useAtmosComputerStore.getState();

afterEach(() => {
  globalThis.fetch = originalFetch;
  useAtmosComputerStore.setState(originalComputerState, true);
});

describe("agentHooksApi relay transport", () => {
  it("targets the selected Computer gateway for status and mutations", async () => {
    useAtmosComputerStore.setState({
      ...originalComputerState,
      connectionMode: "relay",
      selectedServerId: "computer-b",
      relayGatewayHttpBase: "https://relay.example/v1/computers/computer-b/proxy",
      relayClientToken: "client-token-b",
    });

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ detected: true, installed: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }) as typeof fetch;

    await agentHooksApi.getStatus();
    await agentHooksApi.installAll();
    await agentHooksApi.uninstallAll();
    await agentHooksApi.installTool("grok_build");
    await agentHooksApi.uninstallTool("grok_build");
    await agentHooksApi.getCliIdentity("agent");

    expect(calls.map((call) => call.url)).toEqual([
      "https://relay.example/v1/computers/computer-b/proxy/hooks/status",
      "https://relay.example/v1/computers/computer-b/proxy/hooks/install",
      "https://relay.example/v1/computers/computer-b/proxy/hooks/uninstall",
      "https://relay.example/v1/computers/computer-b/proxy/hooks/grok_build/install",
      "https://relay.example/v1/computers/computer-b/proxy/hooks/grok_build/uninstall",
      "https://relay.example/v1/computers/computer-b/proxy/hooks/cli-identity?command=agent",
    ]);
    for (const call of calls) {
      expect(call.init?.headers).toMatchObject({
        Authorization: "Bearer client-token-b",
      });
    }
    expect(calls.slice(1, 5).map((call) => call.init?.method)).toEqual([
      "POST",
      "POST",
      "POST",
      "POST",
    ]);
    expect(calls[5]?.init?.method ?? "GET").toBe("GET");
  });
});
