import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyGlobalSearchTypedKey,
  isGlobalSearchShortcutKey,
  resolveGlobalSearchTypeahead,
} from "@/app-shell/global-search-focus";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("global search focus", () => {
  it("keeps navigation keys on the dialog, not the query", () => {
    expect(isGlobalSearchShortcutKey("Tab")).toBe(true);
    expect(isGlobalSearchShortcutKey("Enter")).toBe(true);
    expect(isGlobalSearchShortcutKey("Escape")).toBe(true);
    expect(isGlobalSearchShortcutKey("ArrowDown")).toBe(true);
    expect(isGlobalSearchShortcutKey("a")).toBe(false);
  });

  it("appends printable keys and backspaces the query", () => {
    expect(applyGlobalSearchTypedKey("", "f")).toBe("f");
    expect(applyGlobalSearchTypedKey("fi", " ")).toBe("fi ");
    expect(applyGlobalSearchTypedKey("file", "Backspace")).toBe("fil");
    expect(applyGlobalSearchTypedKey("file", "Delete")).toBe("file");
  });

  it("refocuses the input for typing when another chrome control is focused", () => {
    const input = { tagName: "INPUT" } as HTMLInputElement;
    const tab = { tagName: "BUTTON" } as HTMLButtonElement;

    expect(
      resolveGlobalSearchTypeahead(
        { key: "f", metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target: tab },
        input,
        "",
      ),
    ).toEqual({ focus: true, preventDefault: true, query: "f" });

    expect(
      resolveGlobalSearchTypeahead(
        { key: "Backspace", metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target: tab },
        input,
        "ab",
      ),
    ).toEqual({ focus: true, preventDefault: true, query: "a" });
  });

  it("leaves reserved shortcuts and already-focused typing alone", () => {
    const input = { tagName: "INPUT" } as HTMLInputElement;
    const tab = { tagName: "BUTTON" } as HTMLButtonElement;

    expect(
      resolveGlobalSearchTypeahead(
        { key: "ArrowDown", metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target: tab },
        input,
        "q",
      ),
    ).toBeNull();

    expect(
      resolveGlobalSearchTypeahead(
        { key: "f", metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target: input },
        input,
        "",
      ),
    ).toBeNull();

    expect(
      resolveGlobalSearchTypeahead(
        { key: "k", metaKey: true, ctrlKey: false, altKey: false, isComposing: false, target: tab },
        input,
        "",
      ),
    ).toBeNull();

    expect(
      resolveGlobalSearchTypeahead(
        { key: "f", metaKey: false, ctrlKey: false, altKey: false, isComposing: true, target: tab },
        input,
        "q",
      ),
    ).toEqual({ focus: true, preventDefault: false, query: "q" });
  });

  it("opens onto the command input and typeahead-focuses it while the palette is open", () => {
    const search = read("../GlobalSearch.tsx");
    expect(search).toContain("onOpenAutoFocus");
    expect(search).toContain("resolveGlobalSearchTypeahead");
    expect(search).toContain("inputRef.current?.focus()");

    const content = read("../global-search-content.tsx");
    expect(content).toContain("tabIndex={-1}");

    const command = readFileSync(
      join(import.meta.dir, "../../../../../packages/ui/src/components/ui/command.tsx"),
      "utf8",
    );
    expect(command).toContain("onOpenAutoFocus");
    expect(command).toContain("ref={ref}");
  });
});
