import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { normalizeFsPath, stripPathEchoFromToolHeading, toolTitleLooksLikePath } from "./index";

const NO_PATH = "__no_match__";

/** Independent of the production one-pass scanners. Collapses `//` by rewriting. */
function oracleNormalizeBody(path: string): string {
  let value = path.replaceAll("\\", "/");
  while (value.includes("//")) value = value.replaceAll("//", "/");
  if (value !== "/") {
    while (value.endsWith("/")) value = value.slice(0, -1);
  }
  return value;
}

function oraclePublicPath(path: string): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  return oracleNormalizeBody(trimmed) || null;
}

function isWs(char: string): boolean {
  return char !== "" && char.trim() === "";
}

function collapseWsRuns(value: string): string {
  const pieces: string[] = [];
  let buf = "";
  let inWs: boolean | null = null;
  const flush = () => {
    if (!buf) return;
    pieces.push(inWs ? (buf.length === 1 ? buf : " ") : buf);
    buf = "";
  };
  for (const char of value) {
    const ws = isWs(char);
    if (inWs === null) inWs = ws;
    if (ws !== inWs) {
      flush();
      inWs = ws;
    }
    buf += char;
  }
  flush();
  return pieces.join("");
}

/** Independent of the production index walk. Uses trimEnd/startsWith for one edge colon. */
function oracleStripHeading(value: string): string {
  let result = value;
  const noEndWs = result.trimEnd();
  if (noEndWs.endsWith(":") || noEndWs.endsWith("：")) {
    result = noEndWs.slice(0, -1).trimEnd();
  }
  const noStartWs = result.trimStart();
  if (noStartWs.startsWith(":") || noStartWs.startsWith("：")) {
    result = noStartWs.slice(1).trimStart();
  }
  return collapseWsRuns(result).trim();
}

/**
 * Outputs recorded from the pre-fix regular expressions:
 * `\\` → `/`, `/{2,}` → `/`, `/+$` unless the value is `/`;
 * then `\s*[:：]\s*$`, `^\s*[:：]\s*`, `\s{2,}` → one space, `trim`.
 */
const PATH_TABLE: Array<[string, string | null]> = [
  ["", null],
  ["   ", null],
  ["/", "/"],
  ["//", "/"],
  ["///", "/"],
  ["////", "/"],
  ["foo", "foo"],
  ["foo/", "foo"],
  ["foo//", "foo"],
  ["foo///", "foo"],
  ["/foo/", "/foo"],
  ["/foo//bar///", "/foo/bar"],
  ["a//b///c", "a/b/c"],
  ["a\\b\\\\c", "a/b/c"],
  ["C:\\\\Users\\\\foo\\\\", "C:/Users/foo"],
  ["C:/Users/foo/", "C:/Users/foo"],
  ["./rel//path/", "./rel/path"],
  ["file", "file"],
];

const HEADING_TABLE: Array<[string, string]> = [
  ["", ""],
  [":", ""],
  ["：", ""],
  ["::", ""],
  ["：：", ""],
  [" : ", ""],
  [" ： ", ""],
  ["  :  : foo", ": foo"],
  [":::foo:::", "::foo::"],
  ["Read: ", "Read"],
  [" : Read : ", "Read"],
  ["Write：  ", "Write"],
  ["  hello   world  ", "hello world"],
  ["a\t\tb", "a b"],
  ["a \t b", "a b"],
  ["foo:", "foo"],
  [":foo", "foo"],
  ["：foo：", "foo"],
  ["  ::  title  ::  ", ": title :"],
  ["tool:\tpath", "tool:\tpath"],
];

describe("normalizeFsPath linear slash scans", () => {
  it("matches the old slash-regex table and the independent oracle", () => {
    for (const [input, expected] of PATH_TABLE) {
      expect(normalizeFsPath(input), input).toBe(expected);
      expect(oraclePublicPath(input), input).toBe(expected);
    }
  });

  it("keeps file:// decoding before collapsing slashes", () => {
    expect(normalizeFsPath("file:///tmp//a///b/")).toBe("/tmp/a/b");
  });
});

describe("stripPathEchoFromToolHeading linear colon/space scans", () => {
  it("matches the old heading-regex table and the independent oracle", () => {
    for (const [input, expected] of HEADING_TABLE) {
      expect(stripPathEchoFromToolHeading(input, NO_PATH), input).toBe(expected);
      expect(oracleStripHeading(input), input).toBe(expected);
    }
  });

  it("still strips a path alias before the colon cleanup", () => {
    expect(stripPathEchoFromToolHeading("Read: /tmp/plan.md", "/tmp/plan.md")).toBe("Read");
  });
});

describe("pathological inputs stay linear", () => {
  it("finishes long slash and space/colon strings under 250ms", () => {
    const slashes = "/".repeat(20_000);
    const heading = `${" ".repeat(20_000)}:${" ".repeat(20_000)}`;
    const slashStart = performance.now();
    expect(normalizeFsPath(slashes)).toBe("/");
    expect(performance.now() - slashStart).toBeLessThan(250);
    const headingStart = performance.now();
    expect(stripPathEchoFromToolHeading(heading, NO_PATH)).toBe("");
    expect(performance.now() - headingStart).toBeLessThan(250);
  });
});

describe("toolTitleLooksLikePath prefix", () => {
  it("treats Tool: abs path and bare paths as the file", () => {
    const path = "/Users/me/app/Cargo.toml";
    expect(toolTitleLooksLikePath(path, path)).toBe(true);
    expect(toolTitleLooksLikePath(`Tool: ${path}`, path)).toBe(true);
    expect(toolTitleLooksLikePath("List apps, crates, packages layout", path)).toBe(false);
  });
});

describe("present.ts dropped the CodeQL-high regex literals", () => {
  it("does not contain the three quantified patterns", () => {
    const source = readFileSync(new URL("./present.ts", import.meta.url), "utf8");
    expect(source.includes("{2,}")).toBe(false);
    expect(source.includes("/+$")).toBe(false);
    expect(source.includes(String.raw`[:：]\s*$`)).toBe(false);
    expect(source.includes(String.raw`^\s*[:：]`)).toBe(false);
  });
});
