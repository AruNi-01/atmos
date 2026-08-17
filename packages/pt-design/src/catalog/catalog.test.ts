import { describe, expect, test } from "bun:test";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "./shadcn-list";
import { catalogDisplayName } from "./labels";
import { getComponentTemplate, listComponentTypes } from "./registry";
import { catalogIconTypes, catalogVariantIconName, catalogVariantIconTypes } from "../embed/catalog-icons";
import { buildCatalogMenuItems, searchCatalogEntries } from "../embed/ComponentCatalog";
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

  test("catalog can be listed by kind", () => {
    const basics = listComponentTypes("basic");
    const blocks = listComponentTypes("block");
    expect(basics.every((entry) => entry.kind === "basic")).toBe(true);
    expect(basics.some((entry) => entry.componentType.startsWith("block."))).toBe(false);
    expect(blocks.map((entry) => entry.componentType)).toEqual([...REQUIRED_BLOCKS]);
    expect(listComponentTypes()).toHaveLength(basics.length + blocks.length);
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
    const label = built.elements.find((el) => el.type === "text");
    expect(label?.fontFamily).toBe(2);
    expect(label?.lineHeight).toBe(1.25);
    expect(label?.text).toBe("Go");
    const root = built.elements.find((el) => el.id === built.rootId);
    expect(root).toBeDefined();
    expect(label?.height).toBeLessThan(root!.height);
    expect(label!.y).toBeGreaterThan(root!.y);
    expect(label!.y + label!.height).toBeLessThan(root!.y + root!.height);
    expect(Math.abs(label!.y - (root!.y + (root!.height - label!.height) / 2))).toBeLessThan(0.6);
  });

  test("dialog actions and table header sit in the middle of their bars", () => {
    const dialog = getComponentTemplate("alert-dialog", { x: 0, y: 0, variant: "open", props: {} });
    const cancel = dialog.elements.find((el) => el.type === "text" && el.text === "Cancel");
    const cancelBtn = dialog.elements.find(
      (el) => el.type === "rectangle" && el.x === cancel?.x && el.height === 28,
    );
    expect(cancel).toBeDefined();
    expect(cancelBtn).toBeDefined();
    expect(Math.abs(cancel!.y - (cancelBtn!.y + (cancelBtn!.height - cancel!.height) / 2))).toBeLessThan(0.6);

    const table = getComponentTemplate("table", { x: 0, y: 0, props: {} });
    const header = table.elements.find((el) => el.type === "text" && el.text?.includes("Name"));
    const headerBar = table.elements.find((el) => el.type === "rectangle" && el.height === 32 && el.y === 0);
    expect(header).toBeDefined();
    expect(headerBar).toBeDefined();
    expect(Math.abs(header!.y - (headerBar!.y + (headerBar!.height - header!.height) / 2))).toBeLessThan(0.6);
  });

  test("checkbox and switch IR bbox uses the advertised full bounds", () => {
    const session = createPtDesignSession();
    session.dispatch({ type: "place", componentType: "checkbox", at: { x: 0, y: 0 }, props: { label: "On" } });
    session.dispatch({ type: "place", componentType: "switch", at: { x: 0, y: 40 }, props: { label: "On" } });
    const ir = session.getIR();
    const checkbox = ir.freeNodes.find((n) => n.componentType === "checkbox");
    const sw = ir.freeNodes.find((n) => n.componentType === "switch");
    expect(checkbox?.bbox).toEqual({ x: 0, y: 0, w: 162, h: 20 });
    expect(sw?.bbox).toEqual({ x: 0, y: 40, w: 124, h: 20 });
    const checkboxRoot = getComponentTemplate("checkbox", { x: 0, y: 0, props: { label: "On" } });
    const switchRoot = getComponentTemplate("switch", { x: 0, y: 0, props: { label: "On" } });
    expect(checkboxRoot.width).toBe(162);
    expect(checkboxRoot.height).toBe(20);
    expect(switchRoot.width).toBe(124);
    expect(switchRoot.height).toBe(20);
    expect(checkboxRoot.elements.find((el) => el.id === checkboxRoot.rootId)?.width).toBe(162);
    expect(switchRoot.elements.find((el) => el.id === switchRoot.rootId)?.width).toBe(124);
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
    const variantKeys = button?.children?.map((child) => {
      const icon = child.icon as { props?: { variant?: string } } | undefined;
      return icon?.props?.variant;
    });
    expect(variantKeys).toEqual(["all", "default", "secondary", "outline", "ghost", "destructive", "link"]);
    expect(new Set(variantKeys).size).toBe(variantKeys?.length);
    expect(new Set(variantKeys?.map((key) => catalogVariantIconName(key ?? "default"))).size).toBe(
      variantKeys?.length,
    );
  });

  test("every catalog variant has a distinct icon mapping", () => {
    const names = catalogVariantIconTypes();
    expect(names).toContain("all");
    expect(names).toContain("trigger");
    expect(names).toContain("image");
    expect(new Set(names.map((name) => catalogVariantIconName(name))).size).toBe(names.length);
  });

  test("catalog search matches parents and auto-expands their variants", () => {
    const basics = listComponentTypes("basic");
    const button = searchCatalogEntries(basics, "button").find((group) => group.entry.componentType === "button");
    expect(button?.parentMatched).toBe(true);
    expect(button?.variants).toEqual(["default", "secondary", "outline", "ghost", "destructive", "link"]);
  });

  test("catalog search finds second-level variants without opening the parent name", () => {
    const basics = listComponentTypes("basic");
    const hits = searchCatalogEntries(basics, "outline");
    expect(hits.every((group) => group.parentMatched === false)).toBe(true);
    expect(hits.map((group) => group.entry.componentType).sort()).toEqual(["badge", "button", "toggle"]);
    expect(hits.every((group) => group.variants.includes("outline") && group.variants.length === 1)).toBe(true);
  });

  test("catalog search is empty when nothing matches", () => {
    expect(searchCatalogEntries(listComponentTypes("basic"), "zzzz-not-a-component")).toEqual([]);
  });

  test("component tab menu omits blocks and block tab lists required templates", () => {
    const componentMenu = buildCatalogMenuItems(listComponentTypes("basic"), () => undefined);
    const blockMenu = buildCatalogMenuItems(listComponentTypes("block"), () => undefined);
    expect(componentMenu.some((item) => item.id.startsWith("block."))).toBe(false);
    expect(componentMenu.some((item) => item.id === "button")).toBe(true);
    expect(blockMenu.map((item) => item.id)).toEqual([...REQUIRED_BLOCKS]);
    expect(blockMenu.map((item) => item.label)).toEqual([
      "Auth Form",
      "Settings Shell",
      "Empty State",
      "Nav Content",
    ]);
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
