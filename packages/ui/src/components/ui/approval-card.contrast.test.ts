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

  it("caps card height and scrolls the body while keeping head/actions fixed", () => {
    expect(css).toMatch(/\.card\s*\{[\s\S]*?max-height:\s*var\(--approval-card-max-height,\s*50cqh\)/);
    expect(css).toMatch(/\.card\s*\{[\s\S]*?overflow:\s*hidden/);
    expect(css).toMatch(/\.body\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(css).toMatch(/\.head\s*\{[\s\S]*?flex:\s*none/);
    expect(css).toMatch(/\.actions\s*\{[\s\S]*?flex:\s*none/);
    expect(css).toMatch(/\.actions\s*\{[\s\S]*?padding-top:\s*4px/);
    expect(css).not.toContain("80cqh");
  });

  it("crossfades plan body ↔ todos with reduced-motion off", () => {
    expect(css).toContain(".planSwitch");
    expect(css).toContain(".planPane");
    expect(css).toMatch(
      /\.planSwitch\[data-animate="true"\] \.planPane[\s\S]*?opacity 280ms/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.planSwitch\[data-animate="true"\] \.planPane \{ transition: none; \}/,
    );
  });

  it("styles todo inline markdown (bold + code)", () => {
    expect(css).toContain(".todoStrong");
    expect(css).toContain(".todoCode");
  });

  it("action button labels truncate for long agent option names", () => {
    expect(css).toContain(".btnLabel");
    expect(css).toMatch(/\.btnLabel[\s\S]*?text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.btnGhost,\s*\n\.btnPrimary[\s\S]*?max-width:\s*min\(100%,\s*18rem\)/);
  });
});
