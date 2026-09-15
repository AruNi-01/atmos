import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHART_IDS } from "../catalog/chart-list";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "../catalog/shadcn-list";
import { PtDesignError, catalogIdToXmlTag, parsePtx, serializePtx, xmlTagToCatalogId } from "./index";
import type { PtNode } from "./schema";

const GOLDEN = `<page id="model-config">
  <select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
  </select>
  <button id="run" label="Run" x="300" y="260" width="100" height="40">
    <on event="click">
      <action type="agent" name="run"/>
    </on>
  </button>
  <card id="auth" title="Sign in" x="20" y="20" width="360" height="280">
    <input id="email" label="Email" x="16" y="56" width="328" height="40"/>
    <button id="submit" label="Continue" x="16" y="220" width="328" height="40"/>
  </card>
</page>
`;

function expectCode(fn: () => unknown, code: string): PtDesignError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PtDesignError);
    const err = error as PtDesignError;
    expect(err.code).toBe(code);
    return err;
  }
  throw new Error(`expected PtDesignError ${code}`);
}

function pageXml(inner: string): string {
  return `<page id="p">${inner}</page>`;
}

function spatial(id: string, extra = ""): string {
  return `id="${id}" x="0" y="0" width="10" height="10"${extra}`;
}

describe("catalog XML tags", () => {
  test("maps frozen ids including dotted blocks", () => {
    expect(catalogIdToXmlTag("button")).toBe("button");
    expect(catalogIdToXmlTag("alert-dialog")).toBe("alert-dialog");
    expect(catalogIdToXmlTag("block.auth-form")).toBe("block-auth-form");
    expect(xmlTagToCatalogId("button")).toBe("button");
    expect(xmlTagToCatalogId("alert-dialog")).toBe("alert-dialog");
    expect(xmlTagToCatalogId("block-auth-form")).toBe("block.auth-form");
    expect(catalogIdToXmlTag("chart")).toBe("chart");
    expect(catalogIdToXmlTag("chart.area-default")).toBe("chart-area-default");
    expect(xmlTagToCatalogId("chart")).toBe("chart");
    expect(xmlTagToCatalogId("chart-area-default")).toBe("chart.area-default");
    expect(xmlTagToCatalogId("nope")).toBeNull();
  });

  test("frozen catalog tags do not collide", () => {
    const tags = [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS, ...CHART_IDS].map(catalogIdToXmlTag);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("S1 PTX round-trip", () => {
  test("parse → serialize → parse preserves golden AST", () => {
    const first = parsePtx(GOLDEN);
    const xml = serializePtx(first);
    const second = parsePtx(xml);
    expect(second).toEqual(first);
    const page = first.pages[0];
    expect(page.id).toBe("model-config");
    expect(page.nodes.map((n) => n.id)).toEqual(["model", "run", "auth"]);
    const select = page.nodes[0]!;
    expect(select.type).toBe("select");
    expect(select.x).toBe(300);
    expect(select.y).toBe(200);
    expect(select.width).toBe(240);
    expect(select.height).toBe(40);
    expect(select.rotation).toBe(0);
    expect(select.value).toBe("claude");
    expect(select.props.label).toBe("Model");
    expect(select.options).toEqual([
      { value: "gpt-5.6", label: "GPT-5.6" },
      { value: "claude", label: "Claude" },
    ]);
    const run = page.nodes[1]!;
    expect(run.events).toEqual([{ event: "click", actions: [{ type: "agent", name: "run" }] }]);
    const card = page.nodes[2]!;
    expect(card.props.title).toBe("Sign in");
    expect(card.children?.map((n) => n.id)).toEqual(["email", "submit"]);
  });
});

describe("S4 spatial on the node", () => {
  test("button spatial attrs become numbers", () => {
    const doc = parsePtx(pageXml(`<button id="run" x="580" y="180" width="120" height="40"/>`));
    const node = doc.pages[0]!.nodes[0]!;
    expect(node.x).toBe(580);
    expect(node.y).toBe(180);
    expect(node.width).toBe(120);
    expect(node.height).toBe(40);
    expect(node.rotation).toBe(0);
  });
});

describe("S7 / S8 options", () => {
  test("S7 option without value is invalid_option", () => {
    expectCode(
      () => parsePtx(pageXml(`<select ${spatial("s")}><option>Claude</option></select>`)),
      "invalid_option",
    );
  });

  test("S8 value + text become option pair", () => {
    const doc = parsePtx(pageXml(`<select ${spatial("s")}><option value="claude">Claude</option></select>`));
    expect(doc.pages[0]!.nodes[0]!.options).toEqual([{ value: "claude", label: "Claude" }]);
  });
});

describe("S13 orphan snippets", () => {
  test("option / on / action as root fail invalid_ptx", () => {
    expectCode(() => parsePtx(`<option value="x">X</option>`), "invalid_ptx");
    expectCode(() => parsePtx(`<on event="click"><action type="agent" name="run"/></on>`), "invalid_ptx");
    expectCode(() => parsePtx(`<action type="agent" name="run"/>`), "invalid_ptx");
  });
});

describe("S35 pretty stable XML", () => {
  test("serialize twice yields identical bytes and reserved attr order", () => {
    const doc = parsePtx(
      pageXml(
        `<button id="b" name="n" variant="primary" label="Go" value="v" checked="true" x="1" y="2" width="3" height="4" rotation="5"/>`,
      ),
    );
    const once = serializePtx(doc);
    const twice = serializePtx(parsePtx(once));
    expect(twice).toBe(once);
    const line = once.trim().split("\n")[1]!;
    const keys = ["id", "label", "value", "checked", "x", "y", "width", "height", "rotation", "name", "variant"];
    let last = -1;
    for (const key of keys) {
      const at = line.indexOf(`${key}="`);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });
});

describe("S36 nested children", () => {
  test("card input children round-trip with relative spatial", () => {
    const doc = parsePtx(
      pageXml(
        `<card id="auth" title="Sign in" x="20" y="20" width="360" height="280"><input id="email" label="Email" x="16" y="56" width="328" height="40"/></card>`,
      ),
    );
    const card = doc.pages[0]!.nodes[0]!;
    expect(card.children?.[0]?.type).toBe("input");
    expect(card.children?.[0]?.x).toBe(16);
    expect(card.children?.[0]?.y).toBe(56);
    const again = parsePtx(serializePtx(doc));
    expect(again.pages[0]!.nodes[0]!.children?.[0]?.x).toBe(16);
    expect(again.pages[0]!.nodes[0]!.children?.[0]?.x).not.toBe(20 + 16);
  });
});

describe("S37 dotted block XML tags", () => {
  test("REQUIRED_BLOCKS parse and serialize dashed tags", () => {
    for (const id of REQUIRED_BLOCKS) {
      const tag = catalogIdToXmlTag(id);
      const doc = parsePtx(pageXml(`<${tag} id="a" x="0" y="0" width="320" height="200"/>`));
      expect(doc.pages[0]!.nodes[0]!.type).toBe(id);
      expect(serializePtx(doc)).toContain(`<${tag} `);
      expect(serializePtx(doc)).not.toContain(`<${id}`);
    }
  });

  test("unknown tag is invalid_ptx", () => {
    expectCode(() => parsePtx(pageXml(`<nope id="a" x="0" y="0" width="1" height="1"/>`)), "invalid_ptx");
  });
});

describe("frozen catalog ids", () => {
  test("every frozen id parses as a minimal self-closing node", () => {
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS, ...CHART_IDS]) {
      const tag = catalogIdToXmlTag(id);
      const doc = parsePtx(pageXml(`<${tag} id="n" x="1" y="2" width="3" height="4"/>`));
      const node: PtNode = doc.pages[0]!.nodes[0]!;
      expect(node.type).toBe(id);
      expect(node.id).toBe("n");
    }
  });
});

describe("PTX grammar", () => {
  test("ignores XML declaration and rejects doctype, entity, percent entity", () => {
    const doc = parsePtx(`<?xml version="1.0" encoding="UTF-8"?>${pageXml(`<button ${spatial("b")}/>`)}`);
    expect(doc.pages[0]!.nodes[0]!.type).toBe("button");
    expectCode(() => parsePtx(`<!DOCTYPE page>${pageXml(`<button ${spatial("b")}/>`)}`), "invalid_ptx");
    expectCode(() => parsePtx(`<!ENTITY foo "bar">${pageXml(`<button ${spatial("b")}/>`)}`), "invalid_ptx");
    expectCode(() => parsePtx(pageXml(`<button ${spatial("b")}>%foo;</button>`)), "invalid_ptx");
  });

  test("duplicate ids and missing spatial fail invalid_ptx", () => {
    expectCode(
      () => parsePtx(pageXml(`<button ${spatial("dup")}/><input ${spatial("dup")}/>`)),
      "invalid_ptx",
    );
    expectCode(() => parsePtx(pageXml(`<button id="b" y="0" width="1" height="1"/>`)), "invalid_ptx");
  });

  test("checked boolean attr and nested duplicate ids", () => {
    const doc = parsePtx(pageXml(`<checkbox ${spatial("c")} checked/>`));
    expect(doc.pages[0]!.nodes[0]!.checked).toBe(true);
    expectCode(
      () =>
        parsePtx(
          pageXml(`<card ${spatial("c")}><input ${spatial("c")}/></card>`),
        ),
      "invalid_ptx",
    );
  });
});

describe("protocol barrel", () => {
  test("index does not import node:fs or bundle", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
    expect(src).not.toMatch(/node:fs/);
    expect(src).not.toMatch(/from ["']\.\/bundle["']/);
    expect(src).not.toMatch(/readBundle|writeBundle/);
  });
});
