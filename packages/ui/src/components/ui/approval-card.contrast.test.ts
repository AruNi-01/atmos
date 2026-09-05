import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "approval-card.module.css"), "utf8");

describe("approval-card selected contrast", () => {
  it("dark selected options keep light text on elevated background", () => {
    // Regression: selected rows used base .option color (#1a1a1a) on #1a1a1a bg.
    expect(css).toContain("html.dark) .option[data-selected=\"true\"]");
    expect(css).toMatch(
      /\.option\[data-selected="true"\][\s\S]*?background:\s*#2a2a2a[\s\S]*?color:\s*#f5f5f5/,
    );
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)[\s\S]*?\.option\[data-selected="true"\][\s\S]*?color:\s*#f5f5f5/,
    );
  });

  it("dark unselected options have no border (hover is background-only)", () => {
    expect(css).toMatch(
      /html\.dark\) \.option:not\(\[data-selected="true"\]\)[\s\S]*?border:\s*0/,
    );
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)[\s\S]*?\.option:not\(\[data-selected="true"\]\)[\s\S]*?border:\s*0/,
    );
    expect(css).not.toMatch(
      /html\.dark\) \.option:not\(\[data-selected="true"\]\)[\s\S]*?border-color:\s*rgba\(255,\s*255,\s*255/,
    );
  });
});
