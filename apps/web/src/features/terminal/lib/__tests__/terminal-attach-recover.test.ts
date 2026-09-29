// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecoverableTerminalAttachMiss } from "../terminal-attach-recover";

describe("isRecoverableTerminalAttachMiss", () => {
  it("recovers when attach misses a named window in a live session", () => {
    expect(
      isRecoverableTerminalAttachMiss("Tmux window with name '1' not found"),
    ).toBe(true);
    expect(
      isRecoverableTerminalAttachMiss("Tmux window does not exist at index 3"),
    ).toBe(true);
  });

  it("does not auto-create when the workspace tmux session is missing", () => {
    expect(
      isRecoverableTerminalAttachMiss(
        "Failed to attach existing terminal session after 3 attempts: Engine error: Tmux error: tmux error: can't find session: atmos_Main",
      ),
    ).toBe(false);
  });

  it("does not recover unrelated attach failures", () => {
    expect(isRecoverableTerminalAttachMiss("permission denied")).toBe(false);
    expect(
      isRecoverableTerminalAttachMiss("Failed to attach existing terminal session after 3 attempts: timeout"),
    ).toBe(false);
  });

  it("is wired into Terminal attach error recovery", () => {
    const source = readFileSync(join(import.meta.dir, "../../components/Terminal.tsx"), "utf8");
    expect(source).toContain("isRecoverableTerminalAttachMiss(error)");
  });
});
