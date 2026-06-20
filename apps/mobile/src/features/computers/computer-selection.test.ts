// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { ComputerRow } from "@/api/types";
import { getAutoConnectComputerId, selectableOnlineComputers } from "@/features/computers/computer-selection";

describe("computer auto selection", () => {
  test("auto-connects the only online computer when none is selected", () => {
    expect(
      getAutoConnectComputerId({
        activeClientSession: null,
        computers: [
          computer({ server_id: "offline", online: false }),
          computer({ server_id: "online", online: true }),
        ],
        selectedServerId: null,
      }),
    ).toBe("online");
  });

  test("keeps the selected online computer even when another computer is online", () => {
    expect(
      getAutoConnectComputerId({
        activeClientSession: null,
        computers: [
          computer({ server_id: "selected", online: true }),
          computer({ server_id: "other", online: true }),
        ],
        selectedServerId: "selected",
      }),
    ).toBe("selected");
  });

  test("does not guess when multiple online computers are available", () => {
    expect(
      getAutoConnectComputerId({
        activeClientSession: null,
        computers: [
          computer({ server_id: "first", online: true }),
          computer({ server_id: "second", online: true }),
        ],
        selectedServerId: null,
      }),
    ).toBeNull();
  });

  test("does not reconnect when an active client session already exists", () => {
    expect(
      getAutoConnectComputerId({
        activeClientSession: { ws_url: "wss://relay.example/ws/client" },
        computers: [computer({ server_id: "online", online: true })],
        selectedServerId: null,
      }),
    ).toBeNull();
  });

  test("ignores revoked computers", () => {
    const computers = [
      computer({ server_id: "revoked", online: true, revoked: 1 }),
      computer({ server_id: "active", online: true }),
    ];

    expect(selectableOnlineComputers(computers).map((item) => item.server_id)).toEqual(["active"]);
  });
});

function computer(overrides: Partial<ComputerRow>): ComputerRow {
  return {
    created_at: 0,
    display_name: null,
    last_seen_at: null,
    online: false,
    registration_meta: null,
    revoked: 0,
    server_id: "computer",
    ...overrides,
  };
}
