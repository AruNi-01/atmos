// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { ComputerRow } from "@/api/types";
import { activeSettingsComputers } from "./computer-settings";

function computer(serverId: string, revoked: number): ComputerRow {
  return {
    server_id: serverId,
    display_name: serverId,
    revoked,
    created_at: 1,
    last_seen_at: 1,
    registration_meta: null,
    online: revoked === 0,
  };
}

describe("settings computers", () => {
  test("hides revoked computers from the settings list", () => {
    expect(activeSettingsComputers([computer("active", 0), computer("revoked", 1)]).map((row) => row.server_id)).toEqual([
      "active",
    ]);
  });
});
