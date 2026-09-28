// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { deletionFailureMessage } from "./session-row-actions";

describe("deletionFailureMessage", () => {
  test("ignores a fully successful delete", () => {
    expect(deletionFailureMessage([])).toBeNull();
    expect(deletionFailureMessage(["  "])).toBeNull();
  });

  test("keeps partial native failures visible", () => {
    expect(deletionFailureMessage(["claude: missing", "  ", "codex: busy"])).toBe(
      "claude: missing; codex: busy",
    );
  });
});
