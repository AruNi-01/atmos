import { describe, expect, mock, test } from "bun:test";

mock.module("cloudflare:workers", () => ({
  DurableObject: class {},
}));

function envWithoutDbAccess() {
  return {
    RELAY_SECRET_KEY: "private-relay-secret",
    DB: {
      prepare() {
        throw new Error("DB should not be touched for setup completion redirects");
      },
    },
    SERVER_HUB: {
      idFromName: () => "server_1",
      get: () => ({ fetch: async () => new Response(null) }),
    },
  };
}

describe("GitHub setup completion redirect", () => {
  test("redirects the legacy relay completion path to the hosted completion page", async () => {
    const { default: worker } = await import("../src/index");

    const response = await worker.fetch(
      new Request(
        "https://relay.atmos.land/github/setup/complete?github_setup=connected&installation_id=142082310",
      ),
      envWithoutDbAccess() as never,
      {} as never,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://app.atmos.land/github/setup/complete?github_setup=connected&installation_id=142082310",
    );
  });
});
