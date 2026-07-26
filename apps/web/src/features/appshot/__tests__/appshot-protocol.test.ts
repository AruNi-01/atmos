// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  formatAppshotTimestamp,
  formatAppshotPrompt,
  parseAppshotProtocol,
} from "../lib/appshot-protocol";

describe("appshot protocol", () => {
  it("accepts first-line Appshot protocol text", () => {
    const parsed = parseAppshotProtocol(
      "atmos://appshots/1760000000000\r\nAppshot record is stored locally...",
    );

    expect(parsed?.timestamp).toBe("1760000000000");
    expect(parsed?.promptText).toBe(formatAppshotPrompt("1760000000000"));
  });

  it("formats Appshot prompt with local record path and read instructions", () => {
    const prompt = formatAppshotPrompt("1760000000000");

    expect(prompt.startsWith("atmos://appshots/1760000000000\n")).toBe(true);
    expect(prompt).toContain("~/.atmos/appshots/records/1760000000000/");
    expect(prompt).toContain("metadata.json");
    expect(prompt).toContain("context.md");
    expect(prompt).toContain("snapshot.png");
    // Must not depend on short UI-only labels that omit the record path.
    expect(prompt).not.toContain("Appshot captured at");
  });

  it("rejects malformed timestamps", () => {
    expect(parseAppshotProtocol("atmos://appshots/176000000000")).toBeNull();
    expect(parseAppshotProtocol("atmos://appshots/17600000000000")).toBeNull();
    expect(parseAppshotProtocol("atmos://appshots/17600000000aa")).toBeNull();
  });

  it("does not parse Appshot URLs that are not the first line", () => {
    expect(
      parseAppshotProtocol(
        "Please inspect this:\natmos://appshots/1760000000000",
      ),
    ).toBeNull();
  });

  it("formats Appshot timestamps as MM-dd HH:mm", () => {
    const localDate = new Date(2026, 0, 2, 3, 4);

    expect(formatAppshotTimestamp(localDate.toISOString())).toBe("01-02 03:04");
    expect(formatAppshotTimestamp(String(localDate.getTime()))).toBe("01-02 03:04");
  });
});
