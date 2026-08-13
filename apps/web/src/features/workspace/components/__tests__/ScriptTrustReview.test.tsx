// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { ScriptTrustReview } from "@/features/workspace/components/ScriptTrustReview";
import enMessages from "../../../../../messages/en.json";

/**
 * Trust is recorded for the whole `.atmos/scripts/atmos.json`, so this component
 * must render every command in it. Showing only the one about to run would let a
 * user accept commands they were never shown.
 */
function renderReview(
  scripts: Record<string, string>,
  highlightField?: string,
): HTMLElement {
  const windowRef = new Window({ url: "https://app.atmos.local/" });
  // Restore these afterwards, or a closed happy-dom window leaks into whatever
  // test runs next in the same process.
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { window: unknown }).window = windowRef;
  (globalThis as { document: unknown }).document = windowRef.document;
  (globalThis as { HTMLElement: unknown }).HTMLElement = windowRef.HTMLElement;
  (globalThis as { Node: unknown }).Node = windowRef.Node;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ScriptTrustReview scripts={scripts} highlightField={highlightField} />
      </NextIntlClientProvider>,
    );
  });

  const snapshot = container.cloneNode(true) as HTMLElement;

  act(() => {
    root.unmount();
  });
  container.remove();
  windowRef.close();

  globalThis.window = previous.window;
  globalThis.document = previous.document;
  globalThis.HTMLElement = previous.HTMLElement;
  globalThis.Node = previous.Node;

  return snapshot;
}

/**
 * Assertions target structure (`data-script-*`) rather than copy: another test
 * file in this suite calls `mock.module("next-intl", ...)`, and bun applies
 * module mocks process-wide, so translated strings are not reliable here.
 */
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
