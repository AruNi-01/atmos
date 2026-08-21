// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { ScriptTrustReview } from "@/shared/components/ScriptTrustReview";
import enMessages from "../../../../messages/en.json";

/**
 * Trust is recorded for the whole `.atmos/scripts/atmos.json`, so this component
 * must render every command in it. Showing only the one about to run would let a
 * user accept commands they were never shown.
 *
 * Rendered to static markup and parsed in a standalone document: this neither
 * mutates global DOM state nor depends on what another test file in the same
 * process left behind. Assertions target `data-script-*` rather than copy,
 * because another test here calls `mock.module("next-intl", ...)` and bun applies
 * module mocks process-wide.
 */
function renderReview(
  scripts: Record<string, string>,
  highlightField?: string,
): HTMLElement {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <ScriptTrustReview scripts={scripts} highlightField={highlightField} />
    </NextIntlClientProvider>,
  );

  const doc = new Window({ url: "https://app.atmos.local/" }).document;
  doc.body.innerHTML = html;
  return doc.body as unknown as HTMLElement;
}

describe("ScriptTrustReview", () => {
  it("shows every command in the file, not just the one about to run", () => {
    const container = renderReview(
      {
        setup: "bun install",
        run: "just dev",
        purge: "rm -rf node_modules",
      },
      "setup",
    );

    const fields = [...container.querySelectorAll("[data-script-field]")].map(
      (node) => node.getAttribute("data-script-field"),
    );
    expect(fields.sort()).toEqual(["purge", "run", "setup"]);

    // Every command body is visible, not only the highlighted one.
    expect(container.textContent).toContain("bun install");
    expect(container.textContent).toContain("just dev");
    expect(container.textContent).toContain("rm -rf node_modules");
  });

  it("marks only the command that is about to run", () => {
    const container = renderReview(
      { setup: "bun install", run: "just dev" },
      "run",
    );

    const highlighted = [
      ...container.querySelectorAll("[data-script-highlighted='true']"),
    ].map((node) => node.getAttribute("data-script-field"));
    expect(highlighted).toEqual(["run"]);
  });

  it("skips fields with no command so blank entries are not shown as runnable", () => {
    const container = renderReview({
      setup: "bun install",
      run: "",
      purge: "   ",
    });

    const fields = [...container.querySelectorAll("[data-script-field]")].map(
      (node) => node.getAttribute("data-script-field"),
    );
    expect(fields).toEqual(["setup"]);
  });

  it("renders an explicit empty state rather than nothing at all", () => {
    const container = renderReview({});
    expect(container.querySelector("[data-script-review-empty]")).not.toBeNull();
    expect(container.querySelector("[data-script-field]")).toBeNull();
  });
});
