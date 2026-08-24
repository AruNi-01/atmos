// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { ComputerRow } from "@atmos/relay-client";
import {
  ALL_COMPUTERS_VALUE,
  allComputersFetchTargets,
  computerScopeHintKind,
  shouldShowComputerSelect,
  uniqueComputers,
} from "@/features/token-usage/lib/unique-computers";

const APP_A = "aa".repeat(32);
const APP_B = "bb".repeat(32);

function row(partial: Partial<ComputerRow> & { server_id: string }): ComputerRow {
  return {
    display_name: partial.display_name ?? partial.server_id,
    revoked: 0,
    created_at: 1,
    last_seen_at: null,
    registration_meta: null,
    online: false,
    app_device_id: null,
    ...partial,
  };
}

describe("uniqueComputers", () => {
  it("collapses two server ids with the same app_device_id", () => {
    const devices = uniqueComputers(
      [
        row({
          server_id: "old",
          app_device_id: APP_A,
          online: false,
          last_seen_at: 10,
          created_at: 1,
        }),
        row({
          server_id: "new",
          app_device_id: APP_A,
          online: true,
          last_seen_at: 20,
          created_at: 2,
        }),
      ],
      null,
      "new",
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]?.key).toBe(`app:${APP_A}`);
    expect(devices[0]?.serverId).toBe("new");
    expect(devices[0]?.isCurrent).toBe(true);
    expect(allComputersFetchTargets(devices)).toHaveLength(1);
  });

  it("appends an unregistered local computer", () => {
    const devices = uniqueComputers(
      [row({ server_id: "vps", app_device_id: APP_B })],
      { serverId: null, appDeviceId: APP_A, displayName: "Laptop" },
      null,
    );
    expect(devices).toHaveLength(2);
    const local = devices.find((d) => d.key.startsWith("local:"));
    expect(local?.label).toBe("Laptop");
    expect(local?.serverId).toBeNull();
    expect(local?.isCurrent).toBe(true);
  });

  it("does not add a second local when app_device_id already matches the list", () => {
    const devices = uniqueComputers(
      [row({ server_id: "old", app_device_id: APP_A, display_name: "Studio" })],
      { serverId: "new", appDeviceId: APP_A, displayName: "Studio" },
      "new",
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]?.isCurrent).toBe(true);
    expect(devices[0]?.key).toBe(`app:${APP_A}`);
  });

  it("drops revoked rows", () => {
    const devices = uniqueComputers(
      [
        row({ server_id: "dead", revoked: 1, app_device_id: APP_A }),
        row({ server_id: "live", app_device_id: APP_B }),
      ],
      null,
      "live",
    );
    expect(devices.map((d) => d.serverId)).toEqual(["live"]);
  });

  it("suffixes colliding display names", () => {
    const devices = uniqueComputers(
      [
        row({ server_id: "aaaaaaa1-id", display_name: "Studio", app_device_id: APP_A }),
        row({ server_id: "bbbbbbb2-id", display_name: "Studio", app_device_id: APP_B }),
      ],
      null,
      "aaaaaaa1-id",
    );
    expect(devices.map((d) => d.label).sort()).toEqual([
      "Studio · aaaaaaa1",
      "Studio · bbbbbbb2",
    ]);
  });

  it("hides the select without sign-in or a second unique machine", () => {
    expect(shouldShowComputerSelect({ signedIn: false, uniqueCount: 4 })).toBe(false);
    expect(shouldShowComputerSelect({ signedIn: true, uniqueCount: 1 })).toBe(false);
    expect(shouldShowComputerSelect({ signedIn: true, uniqueCount: 2 })).toBe(true);
    expect(computerScopeHintKind({ signedIn: false, uniqueCount: 1 })).toBe("sign-in");
    expect(computerScopeHintKind({ signedIn: true, uniqueCount: 1 })).toBe(
      "add-computer",
    );
    expect(computerScopeHintKind({ signedIn: true, uniqueCount: 2 })).toBeNull();
    expect(ALL_COMPUTERS_VALUE).toBe("all");
  });
});
