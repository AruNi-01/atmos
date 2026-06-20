// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { MobileTerminalEntry } from "@/stores/terminal-store";
import { nextActiveTerminalEntryId, resolveActiveTerminalEntry } from "./terminal-selection";

function entry(id: string): MobileTerminalEntry {
  return {
    id,
    workspaceId: "workspace",
    label: id,
  };
}

describe("terminal selection", () => {
  test("keeps an existing active terminal when it is still present", () => {
    expect(nextActiveTerminalEntryId([entry("one"), entry("two")], "two")).toBe("two");
    expect(resolveActiveTerminalEntry([entry("one"), entry("two")], "two")?.id).toBe("two");
  });

  test("selects the only terminal automatically", () => {
    expect(nextActiveTerminalEntryId([entry("only")], null)).toBe("only");
  });

  test("selects the first terminal when multiple terminals are available", () => {
    expect(nextActiveTerminalEntryId([entry("one"), entry("two")], null)).toBe("one");
    expect(resolveActiveTerminalEntry([entry("one"), entry("two")], null)?.id).toBe("one");
  });
});
