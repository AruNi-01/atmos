import { describe, expect, test } from "bun:test";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "./shadcn-list";
import { catalogDisplayName } from "./labels";
import { getComponentTemplate, listComponentTypes } from "./registry";
import { catalogIconTypes } from "../embed/catalog-icons";
import { buildCatalogMenuItems } from "../embed/ComponentCatalog";
import { createPtDesignSession } from "../core/session";
import { encodeDesignIR } from "../ir/encode";

describe("catalog completeness", () => {
  test("every pinned basic id is registered", () => {
    const types = new Set(listComponentTypes().map((e) => e.componentType));
    const missing = SHADCN_BASIC_IDS.filter((id) => !types.has(id));
    expect(missing).toEqual([]);
  });

  test("required blocks are registered", () => {
    const types = new Set(listComponentTypes().map((e) => e.componentType));
    for (const id of REQUIRED_BLOCKS) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("every basic id and block can be placed into IR", () => {
    const session = createPtDesignSession();
    let x = 0;
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS]) {
      session.dispatch({ type: "place", componentType: id, at: { x, y: 0 } });
      x += 40;
    }
    const ir = encodeDesignIR(session.getScene());
    const types = new Set([
      ...ir.freeNodes.map((n) => n.componentType),
      ...ir.frames.flatMap((f) => f.nodes.map((n) => n.componentType)),
    ]);
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS]) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("wireframes default to artistic roughness", () => {
    const built = getComponentTemplate("button", {
      x: 0,
      y: 0,
      props: { label: "Go" },
    });
    expect(built.elements.length).toBeGreaterThan(0);
    expect(built.elements.every((el) => el.roughness === 1)).toBe(true);
  });

  test("button template uses bare componentType", () => {
    const built = getComponentTemplate("button", {
      x: 0,
      y: 0,
      props: { label: "Save" },
    });
    const root = built.elements.find((el) => el.id === built.rootId);
    expect(root?.customData?.pt?.componentType).toBe("button");
    expect(root?.customData?.pt?.componentType).not.toBe("pt.button");
  });

  test("official 2026 docs extras are registered", () => {
    const types = new Set(listComponentTypes().map((e) => e.componentType));
    for (const id of ["attachment", "bubble", "marker", "message", "message-scroller", "questionnaire"]) {
      expect(types.has(id)).toBe(true);
    }
  });

  test("placing dialog without variant yields trigger and open", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "dialog", at: { x: 0, y: 0 } });
    const nodes = session.getIR().freeNodes.filter((n) => n.componentType === "dialog");
    expect(nodes.map((n) => n.variant).sort()).toEqual(["open", "trigger"]);
  });

  test("explicit overlay variant places a single instance", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "dialog", at: { x: 0, y: 0 }, variant: "open" });
    expect(session.getIR().freeNodes.filter((n) => n.componentType === "dialog")).toHaveLength(1);
    expect(session.getIR().freeNodes[0]?.variant).toBe("open");
  });

  test("user-facing labels are title case and never raw block ids", () => {
    expect(catalogDisplayName("button")).toBe("Button");
    expect(catalogDisplayName("alert-dialog")).toBe("Alert Dialog");
    expect(catalogDisplayName("input-otp")).toBe("Input OTP");
    expect(catalogDisplayName("block.auth-form")).toBe("Auth Form");
    expect(catalogDisplayName("block.settings-shell")).toBe("Settings Shell");
    expect(catalogDisplayName("block.empty-state")).toBe("Empty State");
    expect(catalogDisplayName("block.nav-content")).toBe("Nav Content");
    const labels = listComponentTypes().map((e) => e.label);
    expect(labels).toContain("Auth Form");
    expect(labels.some((label) => label.startsWith("block."))).toBe(false);
    const iconTypes = new Set(catalogIconTypes());
    for (const id of [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS]) {
      expect(iconTypes.has(id)).toBe(true);
    }
  });

  test("variant types open a second-level slide menu", () => {
    const placed: Array<{ type: string; variant?: string }> = [];
    const menu = buildCatalogMenuItems(listComponentTypes(), (type, variant) => {
      placed.push({ type, variant });
    });
    const button = menu.find((item) => item.id === "button");
    const input = menu.find((item) => item.id === "input");
    const auth = menu.find((item) => item.id === "block.auth-form");
    expect(button?.label).toBe("Button");
    expect(button?.children?.map((child) => child.label)).toEqual([
      "All",
      "Default",
      "Secondary",
      "Outline",
      "Ghost",
      "Destructive",
      "Link",
    ]);
    expect(input?.children).toBeUndefined();
    expect(auth?.label).toBe("Auth Form");
    expect(auth?.children).toBeUndefined();
    const outline = button?.children?.find((child) => child.id === "button::outline");
    outline?.onSelect?.(outline);
    expect(placed).toEqual([{ type: "button", variant: "outline" }]);
  });

  test("placing attachment without variant yields image, uploading, and file", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "attachment", at: { x: 0, y: 0 } });
    const variants = session.getIR().freeNodes.filter((n) => n.componentType === "attachment").map((n) => n.variant);
    expect(variants.filter((v) => v === "image")).toHaveLength(3);
    expect(variants).toContain("uploading");
    expect(variants).toContain("file");
    expect(session.getIR().freeNodes.some((n) => n.props.label === "sales-dashboard.pdf")).toBe(true);
  });
});
