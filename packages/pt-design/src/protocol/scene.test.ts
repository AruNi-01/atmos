import { describe, expect, test } from "bun:test";
import { parsePtx } from "./index";
import { extractDocument, projectDocument } from "./scene";
import type { HandleElement, PtDocument } from "./schema";

function twoNodeDoc(): PtDocument {
  return parsePtx(`<page id="p">
  <button id="a" x="1" y="2" width="3" height="4"/>
  <button id="run" x="300" y="260" width="100" height="40" rotation="90"/>
</page>`);
}

describe("S2 extract/project", () => {
  test("project onto empty then extract; second project keeps handle ids", () => {
    const doc = twoNodeDoc();
    const first = projectDocument(doc, []);
    expect(first).toHaveLength(2);
    expect(first[0]!.id).toBe("el_a");
    expect(first[1]!.id).toBe("el_run");
    expect(first[0]!.type).toBe("rectangle");
    expect(first[0]!.backgroundColor).toBe("transparent");
    expect(first[0]!.strokeWidth).toBe(1);
    expect(first[0]!.customData?.pt?.id).toBe("a");
    expect(first[0]!.customData?.pt).not.toHaveProperty("x");
    expect(first[1]!.angle).toBeCloseTo(Math.PI / 2);
    expect(first[1]!.x).toBe(300);

    const extracted = extractDocument(first);
    expect(extracted.pages[0]!.id).toBe("page");
    expect(extracted.pages[0]!.nodes.map((n) => n.id)).toEqual(["a", "run"]);
    expect(extracted.pages[0]!.nodes[0]!.x).toBe(1);
    expect(extracted.pages[0]!.nodes[1]!.rotation).toBeCloseTo(90);

    const second = projectDocument(extracted, first);
    expect(second[0]!.id).toBe(first[0]!.id);
    expect(second[1]!.id).toBe(first[1]!.id);
    expect(second[1]!.customData?.pt?.id).toBe("run");
  });
});

describe("S19 stable mapping", () => {
  test("customData.pt.id stays run across project twice", () => {
    const doc = parsePtx(`<page id="p"><button id="run" x="300" y="260" width="100" height="40"/></page>`);
    const existing: HandleElement[] = [
      {
        id: "excal-keep",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        angle: 0,
        customData: { pt: { id: "run", type: "button", props: {} } },
      },
    ];
    const once = projectDocument(doc, existing);
    const twice = projectDocument(doc, once);
    expect(once[0]!.id).toBe("excal-keep");
    expect(twice[0]!.id).toBe("excal-keep");
    expect(twice[0]!.customData?.pt?.id).toBe("run");
    expect(twice[0]!.x).toBe(300);
  });
});

describe("S36 project nested children", () => {
  test("nested payload is one handle; extract keeps relative x/y", () => {
    const doc = parsePtx(`<page id="p">
  <card id="auth" title="Sign in" x="20" y="20" width="360" height="280">
    <input id="email" label="Email" x="16" y="56" width="328" height="40"/>
  </card>
</page>`);
    const handles = projectDocument(doc, []);
    expect(handles).toHaveLength(1);
    expect(handles[0]!.id).toBe("el_auth");
    expect(handles[0]!.x).toBe(20);
    expect(handles[0]!.customData?.pt?.children?.[0]?.type).toBe("input");
    expect(handles[0]!.customData?.pt?.children?.[0]?.x).toBe(16);
    const extracted = extractDocument(handles);
    expect(extracted.pages[0]!.nodes).toHaveLength(1);
    expect(extracted.pages[0]!.nodes[0]!.children?.[0]?.x).toBe(16);
    expect(extracted.pages[0]!.nodes[0]!.children?.[0]?.x).not.toBe(36);
  });
});

describe("projectDocument mapping rules", () => {
  test("preserves freehand and drops absent mapped handles", () => {
    const doc = parsePtx(`<page id="p"><button id="keep" x="8" y="9" width="10" height="11"/></page>`);
    const existing: HandleElement[] = [
      { id: "draw1", type: "rectangle", x: 9, y: 9, width: 1, height: 1, angle: 0 },
      {
        id: "gone",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        angle: 0,
        customData: { pt: { id: "missing", type: "button", props: {} } },
      },
    ];
    const out = projectDocument(doc, existing);
    expect(out.map((el) => el.id)).toEqual(["el_keep", "draw1"]);
  });

  test("extract skips deleted and payloads without pt; empty scene uses page id page", () => {
    const elements: HandleElement[] = [
      {
        id: "dead",
        type: "rectangle",
        x: 1,
        y: 1,
        width: 1,
        height: 1,
        angle: 0,
        isDeleted: true,
        customData: { pt: { id: "run", type: "button", props: {} } },
      },
      { id: "plain", type: "rectangle", x: 2, y: 2, width: 2, height: 2, angle: 0 },
    ];
    const extracted = extractDocument(elements);
    expect(extracted.pages[0]!.id).toBe("page");
    expect(extracted.pages[0]!.nodes).toEqual([]);
  });
});

describe("extract performance", () => {
  test("extract of 200 nodes is under 50ms", () => {
    const doc = parsePtx(
      `<page id="p">${Array.from({ length: 200 }, (_, i) => `<button id="b${i}" x="${i}" y="0" width="10" height="10"/>`).join("")}</page>`,
    );
    const handles = projectDocument(doc, []);
    const started = performance.now();
    const extracted = extractDocument(handles);
    expect(performance.now() - started).toBeLessThan(50);
    expect(extracted.pages[0]!.nodes).toHaveLength(200);
  });
});
