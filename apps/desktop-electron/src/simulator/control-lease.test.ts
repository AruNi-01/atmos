import { describe, expect, it } from "bun:test";
import {
  CONTROL_PROTOCOL,
  isProcessAlive,
  leaseBelongsToProcess,
  parseControlLease,
  probeControlHealth,
  shouldTakeOverLease,
} from "./control-lease.ts";

describe("control lease", () => {
  it("parses a lease and ignores unknown fields", () => {
    const lease = parseControlLease(
      JSON.stringify({
        protocol: CONTROL_PROTOCOL,
        base_url: "http://127.0.0.1:52413",
        port: 52413,
        token: "secret",
        pid: 4242,
        instance_id: "inst-1",
        updated_at: "2026-08-13T12:00:00Z",
        extra: true,
      }),
    );
    expect(lease).toEqual({
      protocol: CONTROL_PROTOCOL,
      base_url: "http://127.0.0.1:52413",
      port: 52413,
      token: "secret",
      pid: 4242,
      instance_id: "inst-1",
      updated_at: "2026-08-13T12:00:00Z",
    });
  });

  it("rejects malformed control files", () => {
    expect(parseControlLease("{")).toBeNull();
    expect(parseControlLease(JSON.stringify({ token: "x" }))).toBeNull();
    expect(parseControlLease(JSON.stringify({ base_url: "http://127.0.0.1:1" }))).toBeNull();
  });

  it("treats missing pid as not alive", () => {
    expect(isProcessAlive(undefined)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(2_147_483_647)).toBe(false);
  });

  it("takes over when the owner is missing, dead, or unhealthy", () => {
    const lease = parseControlLease(
      JSON.stringify({
        base_url: "http://127.0.0.1:9",
        token: "t",
        pid: 4242,
      }),
    );
    const alive = () => true;
    const dead = () => false;
    expect(shouldTakeOverLease(null, { isPidAlive: alive, healthOk: true })).toBe(true);
    expect(shouldTakeOverLease(lease, { isPidAlive: dead, healthOk: true })).toBe(true);
    expect(shouldTakeOverLease(lease, { isPidAlive: alive, healthOk: false })).toBe(true);
    expect(shouldTakeOverLease(lease, { isPidAlive: alive, healthOk: true })).toBe(false);
  });

  it("only treats a lease as ours when pid or instance_id matches", () => {
    const lease = parseControlLease(
      JSON.stringify({
        base_url: "http://127.0.0.1:9",
        token: "t",
        pid: 11,
        instance_id: "inst-a",
      }),
    );
    expect(leaseBelongsToProcess(lease, { pid: 11, instanceId: "inst-a" })).toBe(true);
    expect(leaseBelongsToProcess(lease, { pid: 99, instanceId: "inst-a" })).toBe(true);
    expect(leaseBelongsToProcess(lease, { pid: 11, instanceId: "inst-b" })).toBe(true);
    expect(leaseBelongsToProcess(lease, { pid: 99, instanceId: "inst-b" })).toBe(false);
    expect(leaseBelongsToProcess(null, { pid: 11, instanceId: "inst-a" })).toBe(false);
  });

  it("probes unauthenticated /v1/health", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      expect(String(input)).toBe("http://127.0.0.1:52413/v1/health");
      return new Response(JSON.stringify({ ok: true, protocol: CONTROL_PROTOCOL }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    expect(await probeControlHealth("http://127.0.0.1:52413/", { fetchImpl })).toBe(true);
    const missingProtocol: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 });
    expect(
      await probeControlHealth("http://127.0.0.1:52413", { fetchImpl: missingProtocol }),
    ).toBe(false);
    const bad: typeof fetch = async () =>
      new Response(JSON.stringify({ ok: false }), { status: 200 });
    expect(await probeControlHealth("http://127.0.0.1:52413", { fetchImpl: bad })).toBe(
      false,
    );
    expect(await probeControlHealth("http://example.com:9", { fetchImpl })).toBe(false);
  });
});
