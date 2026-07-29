import { describe, expect, it } from "bun:test";
import { isDevToolsToggleShortcut } from "./devtools-policy.ts";

function keyDown(
  partial: Partial<{
    key: string;
    meta: boolean;
    alt: boolean;
    control: boolean;
    shift: boolean;
  }>,
) {
  return {
    type: "keyDown" as const,
    key: partial.key ?? "",
    meta: partial.meta ?? false,
    alt: partial.alt ?? false,
    control: partial.control ?? false,
    shift: partial.shift ?? false,
  };
}

describe("isDevToolsToggleShortcut", () => {
  it("matches macOS Option+Cmd+I / J / C", () => {
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "i", meta: true, alt: true }),
        "darwin",
      ),
    ).toBe(true);
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "I", meta: true, alt: true }),
        "darwin",
      ),
    ).toBe(true);
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "j", meta: true, alt: true }),
        "darwin",
      ),
    ).toBe(true);
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "c", meta: true, alt: true }),
        "darwin",
      ),
    ).toBe(true);
  });

  it("does not match plain Cmd+I on macOS", () => {
    expect(
      isDevToolsToggleShortcut(keyDown({ key: "i", meta: true }), "darwin"),
    ).toBe(false);
  });

  it("matches Windows/Linux Ctrl+Shift+I / J / C", () => {
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "i", control: true, shift: true }),
        "win32",
      ),
    ).toBe(true);
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "j", control: true, shift: true }),
        "linux",
      ),
    ).toBe(true);
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "c", control: true, shift: true }),
        "win32",
      ),
    ).toBe(true);
  });

  it("matches F12 on all platforms", () => {
    expect(isDevToolsToggleShortcut(keyDown({ key: "F12" }), "darwin")).toBe(
      true,
    );
    expect(isDevToolsToggleShortcut(keyDown({ key: "F12" }), "win32")).toBe(
      true,
    );
  });

  it("ignores keyUp", () => {
    expect(
      isDevToolsToggleShortcut(
        {
          type: "keyUp",
          key: "i",
          meta: true,
          alt: true,
          control: false,
          shift: false,
        },
        "darwin",
      ),
    ).toBe(false);
  });

  it("does not treat macOS Option+Cmd+I as a win32 match", () => {
    expect(
      isDevToolsToggleShortcut(
        keyDown({ key: "i", meta: true, alt: true }),
        "win32",
      ),
    ).toBe(false);
  });
});
