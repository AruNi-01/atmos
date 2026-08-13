import { describe, expect, it } from "bun:test";
import { SimulatorControlPlane } from "./control-plane.ts";
import { CONTROL_PROTOCOL } from "./control-lease.ts";

describe("simulator control plane", () => {
  it("serves unauthenticated GET /v1/health and still gates invoke", async () => {
    const plane = new SimulatorControlPlane();
    const { port, token } = plane.start({
      lookupSession: () => null,
      invoke: async () => ({ ok: true }),
    });
    try {
      const health = await fetch(`http://127.0.0.1:${port}/v1/health`);
      expect(health.ok).toBe(true);
      expect(await health.json()).toEqual({ ok: true, protocol: CONTROL_PROTOCOL });

      const denied = await fetch(`http://127.0.0.1:${port}/v1/invoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(denied.status).toBe(403);

      const allowed = await fetch(`http://127.0.0.1:${port}/v1/invoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: "{}",
      });
      expect(allowed.ok).toBe(true);
      expect(await allowed.json()).toEqual({ ok: true });
    } finally {
      plane.stop();
    }
  });
});
