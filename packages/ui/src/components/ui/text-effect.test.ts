import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitTextEffectSegments } from "./text-effect";

const source = readFileSync(join(import.meta.dir, "text-effect.tsx"), "utf8");

describe("splitTextEffectSegments", () => {
  test("splits characters including spaces and CJK", () => {
    expect(splitTextEffectSegments("Hi!", "char")).toEqual(["H", "i", "!"]);
    expect(splitTextEffectSegments("a b", "char")).toEqual(["a", " ", "b"]);
    expect(splitTextEffectSegments("思考中", "char")).toEqual(["思", "考", "中"]);
  });

  test("keeps whitespace tokens when splitting words", () => {
    expect(splitTextEffectSegments("Creating session", "word")).toEqual([
      "Creating",
      " ",
      "session",
    ]);
  });

  test("splits lines on newline", () => {
    expect(splitTextEffectSegments("a\nb", "line")).toEqual(["a", "b"]);
  });
});

describe("TextEffect leading", () => {
  test("staggers a leading node with the same item variants as characters", () => {
    expect(source).toContain("leading?: React.ReactNode");
    expect(source).toContain("{leading ? (");
    expect(source).toContain("variants={computedVariants.item}");
  });
});
