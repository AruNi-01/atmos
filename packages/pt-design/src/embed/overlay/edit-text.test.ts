import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyTextHit,
  copyHostTextFromMarkup,
  fittedTextWidth,
  flattenedMarkupText,
  hugsText,
  isFlattenedCopy,
  patchNodeTree,
  sanitizeCollectedCopy,
  textFieldsOf,
} from "./edit-text";
import { parsePtx } from "../../protocol";
import { CHART_MODULES } from "../../components/groups/charts";

function chartOf(type: string) {
  const mod = CHART_MODULES.find((item) => item.type === type);
  if (!mod) throw new Error(`missing ${type}`);
  return mod;
}

function simulateChartTextCommit(type: string, key: "title" | "description" | "footer") {
  const mod = chartOf(type);
  const node = mod.defaultNode("chart");
  const html = renderToStaticMarkup(
    createElement(mod.Renderer, { node, mode: "edit", onCommit: () => {} }),
  );
  const hit = { nodeId: node.id, key, kind: "prop" as const };
  const collected = copyHostTextFromMarkup(html, key);
  const next = applyTextHit(node, hit, collected ?? flattenedMarkupText(html));
  return { node, html, collected, next };
}

describe("edit text", () => {
  test("button label is a text field and hugs width", () => {
    const node = parsePtx(`<page id="p"><button id="run" label="Run" x="0" y="0" width="100" height="40"/></page>`)
      .pages[0]!.nodes[0]!;
    expect(textFieldsOf(node).some((field) => field.key === "label" && field.value === "Run")).toBe(true);
    expect(hugsText("button")).toBe(true);
    expect(hugsText("input")).toBe(false);
    expect(hugsText("chart.bar-default")).toBe(false);
    expect(hugsText("chart")).toBe(false);
  });

  test("longer button copy grows the handle width", () => {
    const node = parsePtx(`<page id="p"><button id="run" label="Go" x="0" y="0" width="40" height="40"/></page>`)
      .pages[0]!.nodes[0]!;
    const next = applyTextHit(node, { nodeId: "run", key: "label", kind: "prop" }, "Save changes");
    expect(next.props.label).toBe("Save changes");
    expect(next.width).toBeGreaterThan(node.width);
    expect(next.width).toBe(fittedTextWidth("Save changes", 36));
  });

  test("nested button copy grows the child and parent", () => {
    const root = parsePtx(
      `<page id="p"><block-auth-form id="login" title="Sign in" x="0" y="0" width="200" height="120"><button id="go" label="Go" x="16" y="60" width="80" height="40"/></block-auth-form></page>`,
    ).pages[0]!.nodes[0]!;
    const next = applyTextHit(root, { nodeId: "go", key: "label", kind: "prop" }, "Create your account");
    const child = next.children?.[0];
    expect(child?.props.label).toBe("Create your account");
    expect(child?.width ?? 0).toBeGreaterThan(80);
    expect(next.width).toBeGreaterThanOrEqual((child?.x ?? 0) + (child?.width ?? 0) + 16);
  });

  test("patchNodeTree keeps sibling nodes", () => {
    const root = parsePtx(
      `<page id="p"><form id="box" label="Form" x="0" y="0" width="200" height="80"><button id="a" label="A" x="0" y="0" width="40" height="24"/><button id="b" label="B" x="50" y="0" width="40" height="24"/></form></page>`,
    ).pages[0]!.nodes[0]!;
    const next = patchNodeTree(root, "b", { props: { label: "Bee" } });
    expect(next.children?.map((child) => child.props.label)).toEqual(["A", "Bee"]);
  });

  test("chart text-edit collect does not flatten ticks and footer into the title", () => {
    for (const type of ["chart.bar-default", "chart.bar-horizontal"] as const) {
      const { node, html, collected, next } = simulateChartTextCommit(type, "title");
      const flattened = flattenedMarkupText(html);
      expect(flattened).toContain("Jan");
      expect(flattened).toContain("Feb");
      expect(flattened).toContain(String(node.props.footer));
      expect(copyHostTextFromMarkup(html, "title")).toBe(String(node.props.title));
      expect(copyHostTextFromMarkup(html, "description")).toBe(String(node.props.description));
      expect(copyHostTextFromMarkup(html, "footer")).toBe(String(node.props.footer));
      expect(collected).toBe(String(node.props.title));
      expect(collected).not.toContain("Jan");
      expect(collected).not.toContain("Feb");
      expect(collected).not.toContain(String(node.props.footer));
      expect(next.props.title).toBe(node.props.title);
      expect(String(next.props.title)).not.toContain("Jan");
      expect(String(next.props.title)).not.toContain("Feb");
      expect(String(next.props.title)).not.toContain(String(node.props.footer));
      expect(next.width).toBe(node.width);
      expect(next.height).toBe(node.height);
      const hit = { nodeId: node.id, key: "title", kind: "prop" as const };
      expect(isFlattenedCopy(node, hit, flattened)).toBe(true);
      expect(sanitizeCollectedCopy(node, hit, flattened)).toBeNull();
      const rejected = applyTextHit(node, hit, flattened);
      expect(rejected.props.title).toBe(node.props.title);
      expect(rejected.width).toBe(node.width);
    }
  });

  test("chart title edit keeps the default bbox", () => {
    const { node } = simulateChartTextCommit("chart.bar-default", "title");
    const next = applyTextHit(node, { nodeId: node.id, key: "title", kind: "prop" }, "Revenue");
    expect(next.props.title).toBe("Revenue");
    expect(next.width).toBe(node.width);
    expect(next.height).toBe(node.height);
  });
});
