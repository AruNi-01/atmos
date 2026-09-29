import { describe, expect, test } from "bun:test";
import { deletionFailureMessage } from "./session-delete-failure";

describe("deletionFailureMessage", () => {
  test("ignores a fully successful delete", () => {
    expect(deletionFailureMessage([])).toBeNull();
  });

  test("keeps partial native failures visible", () => {
    expect(deletionFailureMessage(["claude: missing", "codex: busy"])).toBe(
      "claude: missing; codex: busy",
    );
  });
});
