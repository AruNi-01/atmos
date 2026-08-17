import { describe, expect, mock, test } from "bun:test";
import {
  isValidPtDesignRoomId,
  parseClientFrame,
  parsePtDesignRoomPath,
} from "../src/pt-design-room-protocol";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function envWithRoomStub(fetchImpl: (request: Request) => Promise<Response> | Response) {
  return {
    DB: {
      prepare() {
        throw new Error("PT Design rooms must not touch D1");
      },
    },
    SERVER_HUB: {
      idFromName: () => "unused",
      get: () => ({ fetch: async () => new Response(null) }),
    },
    PT_DESIGN_ROOM: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: fetchImpl }),
    },
  };
}

describe("PT Design room routing", () => {
  test("accepts hex room ids used by the board share link", () => {
    expect(isValidPtDesignRoomId("0123456789abcdef")).toBe(true);
    expect(isValidPtDesignRoomId("a".repeat(20))).toBe(true);
    expect(isValidPtDesignRoomId("short")).toBe(false);
    expect(isValidPtDesignRoomId("../etc/passwd")).toBe(false);
    expect(parsePtDesignRoomPath("/ws/pt-design/0123456789abcdef")).toBe("0123456789abcdef");
    expect(parsePtDesignRoomPath("/ws/pt-design/nope")).toBeNull();
  });

  test("accepts encrypted broadcast frames and rejects junk", () => {
    const ok = parseClientFrame(
      JSON.stringify({ t: "broadcast", payload: "aaa", iv: "bbb", volatile: true }),
    );
    expect(ok).toEqual({ t: "broadcast", payload: "aaa", iv: "bbb", volatile: true });
    expect(parseClientFrame("not-json")).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: "join" }))).toBeNull();
  });

  test("health check does not require a relay secret", async () => {
    const { default: worker } = await import("../src/index");
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/ws/pt-design"),
      envWithRoomStub(async () => new Response(null)) as never,
      {} as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "pt-design-collab",
    });
  });

  test("non-websocket room requests return 426 and never touch D1", async () => {
    const { default: worker } = await import("../src/index");
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/ws/pt-design/0123456789abcdef"),
      envWithRoomStub(async () => {
        throw new Error("DO should not be fetched without an Upgrade");
      }) as never,
      {} as never,
    );
    expect(response.status).toBe(426);
  });

  test("upgrades a valid room to the Durable Object", async () => {
    const { default: worker } = await import("../src/index");
    const response = await worker.fetch(
      new Request("https://relay.atmos.land/ws/pt-design/0123456789abcdef", {
        headers: { Upgrade: "websocket" },
      }),
      envWithRoomStub(async () => new Response("do-ok", { status: 101 })) as never,
      {} as never,
    );
    expect(response.status).toBe(101);
    expect(await response.text()).toBe("do-ok");
  });
});
