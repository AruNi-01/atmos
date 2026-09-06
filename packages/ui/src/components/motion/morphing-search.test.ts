import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("MorphingSearch", () => {
  const source = readFileSync(
    join(import.meta.dir, "morphing-search.tsx"),
    "utf8",
  );

  it("vendors beui morphing search with overlay results scroll", () => {
    expect(source).toContain("beui.dev/components/blocks/morphing-search");
    expect(source).toContain("export function MorphingSearch");
    expect(source).toContain("overscroll-contain overflow-y-auto");
    expect(source).toContain("maxHeight: resultsHeight");
    expect(source).toContain("createPortal");
    expect(source).toContain("leading?: ReactNode");
  });

  it("can keep query after select while still closing the overlay", () => {
    expect(source).toContain("defaultQuery");
    expect(source).toContain("closeOnSelect");
    expect(source).toContain("clearOnSelect");
    expect(source).toContain("closeSearch({ clear: clearOnSelect })");
    expect(source).toContain('anchor.closest("[inert]")');
    expect(source).toContain("if (!wasOpenRef.current)");
    expect(source).toContain("notifyQuery.current?.(\"\")");
    expect(source).toContain("handleResultPointerDown");
    expect(source).toContain("onPointerDown={(event) =>");
    expect(source).toContain(
      'className="pointer-events-none absolute inset-0 rounded-lg bg-foreground/5"',
    );
  });
});
