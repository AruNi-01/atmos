// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import type { ComputerRow } from "@/api/types";
import {
  activeSettingsComputers,
  formatComputerOnlineCount,
  runComputerSelection,
} from "./computer-settings";

const here = dirname(fileURLToPath(import.meta.url));

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
    expect(
      activeSettingsComputers([computer("active", 0), computer("revoked", 1)]).map(
        (row) => row.server_id,
      ),
    ).toEqual(["active"]);
  });
});

describe("formatComputerOnlineCount", () => {
  test("shows online/total and keeps the spoken online label", () => {
    expect(formatComputerOnlineCount(1, 2)).toEqual({
      accessibilityLabel: "1 of 2 online",
      kind: "ratio",
      online: 1,
      total: 2,
    });
    expect(formatComputerOnlineCount(2, 2)).toEqual({
      accessibilityLabel: "2 of 2 online",
      kind: "ratio",
      online: 2,
      total: 2,
    });
    expect(formatComputerOnlineCount(0, 2)).toEqual({
      accessibilityLabel: "0 of 2 online",
      kind: "ratio",
      online: 0,
      total: 2,
    });
  });

  test("keeps an empty list as None", () => {
    expect(formatComputerOnlineCount(0, 0)).toEqual({
      accessibilityLabel: "No computers",
      kind: "empty",
      label: "None",
    });
  });

  test("clamps a count that is outside the list", () => {
    const high = formatComputerOnlineCount(5, 2);
    const low = formatComputerOnlineCount(-1, 2);
    expect(high.kind).toBe("ratio");
    expect(low.kind).toBe("ratio");
    if (high.kind === "ratio") expect(high.online).toBe(2);
    if (low.kind === "ratio") expect(low.online).toBe(0);
  });
});

describe("runComputerSelection", () => {
  test("closes immediately after an offline selection", () => {
    const calls: string[] = [];
    runComputerSelection({
      dismissSheet: () => calls.push("dismiss"),
      online: false,
      selectOffline: () => calls.push("select"),
      switchOnline: () => calls.push("switch"),
    });
    expect(calls).toEqual(["select", "dismiss"]);
  });

  test("closes an online switch only after the session is created", () => {
    const calls: string[] = [];
    let onSuccess: (() => void) | undefined;
    runComputerSelection({
      dismissSheet: () => calls.push("dismiss"),
      online: true,
      selectOffline: () => calls.push("select"),
      switchOnline: (dismiss) => {
        calls.push("switch");
        onSuccess = dismiss;
      },
    });
    expect(calls).toEqual(["switch"]);
    onSuccess?.();
    expect(calls).toEqual(["switch", "dismiss"]);
  });
});

describe("computer list source", () => {
  test("rows keep a check and do not drill into rename or revoke", () => {
    const picker = readFileSync(join(here, "../computers/ComputerPicker.tsx"), "utf8");
    const screen = readFileSync(join(here, "SettingsComputersScreen.tsx"), "utf8");
    for (const source of [picker, screen]) {
      expect(source).not.toContain("ChevronRightIcon");
      expect(source).not.toContain("onManage");
      expect(source).not.toContain("/settings/computer");
    }
    expect(picker).toContain("CheckIcon");
    expect(picker).toContain("onlineStatusColor");
  });

  test("selection dismisses the settings sheet from the controller", () => {
    const controller = readFileSync(join(here, "use-mobile-settings-controller.ts"), "utf8");
    expect(controller).toContain("runComputerSelection");
    expect(controller).toContain('router.dismissTo("/")');
    expect(controller).toContain("switchComputer.mutate(computer.server_id, { onSuccess })");
  });
});
