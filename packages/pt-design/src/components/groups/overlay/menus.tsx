import type { ReactElement } from "react";
import type { PtNode, PtOption } from "../../../protocol";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { LABEL_FIELD, TEXT_FIELDS, propString, spatialNode } from "./defaults";
import { OverlayFrame, emitValue, overlayTokens } from "./shared";

function itemsOf(node: PtNode, fallback: PtOption[]): PtOption[] {
  return node.options && node.options.length > 0 ? node.options : fallback;
}

function MenuButton(props: {
  option: PtOption;
  onPick: (value: string) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => props.onPick(props.option.value)}
      style={{
        appearance: "none",
        width: "100%",
        textAlign: "left",
        border: "none",
        background: "transparent",
        color: overlayTokens.fg,
        cursor: "pointer",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 13,
        fontFamily: overlayTokens.font,
      }}
    >
      {props.option.label}
    </button>
  );
}

function VerticalMenu(props: PtRendererProps & { heading: string; fallback: PtOption[] }): ReactElement {
  const heading = propString(props.node, "label", props.heading);
  const items = itemsOf(props.node, props.fallback);
  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      role="menu"
    >
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2, minHeight: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: overlayTokens.muted, padding: "4px 10px" }}>
          {heading}
        </div>
        {items.map((option) => (
          <MenuButton
            key={option.value}
            option={option}
            onPick={(value) => emitValue(props.node, value, props.onCommit, props.onAction)}
          />
        ))}
      </div>
    </OverlayFrame>
  );
}

function BarMenu(props: PtRendererProps & { fallback: PtOption[]; role: string }): ReactElement {
  const items = itemsOf(props.node, props.fallback);
  const selected = props.node.value ?? items[0]?.value;
  const openItems = items;
  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      role={props.role}
    >
      <div style={{ display: "flex", gap: 4, padding: "8px 10px", borderBottom: `1px solid ${overlayTokens.border}` }}>
        {items.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitem"
            onClick={() => emitValue(props.node, option.value, props.onCommit, props.onAction)}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 500,
              background: option.value === selected ? overlayTokens.mutedBg : "transparent",
              color: overlayTokens.fg,
              fontFamily: overlayTokens.font,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div role="menu" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {openItems.map((option) => (
          <MenuButton
            key={`open-${option.value}`}
            option={option}
            onPick={(value) => emitValue(props.node, value, props.onCommit, props.onAction)}
          />
        ))}
      </div>
    </OverlayFrame>
  );
}

const FILE_ITEMS: PtOption[] = [
  { value: "open", label: "Open" },
  { value: "save", label: "Save" },
  { value: "export", label: "Export" },
];

const CONTEXT_ITEMS: PtOption[] = [
  { value: "cut", label: "Cut" },
  { value: "copy", label: "Copy" },
  { value: "paste", label: "Paste" },
];

const BAR_ITEMS: PtOption[] = [
  { value: "file", label: "File" },
  { value: "edit", label: "Edit" },
  { value: "view", label: "View" },
];

const NAV_ITEMS: PtOption[] = [
  { value: "home", label: "Home" },
  { value: "docs", label: "Docs" },
  { value: "pricing", label: "Pricing" },
];

export const dropdownMenuModule: PtComponentModule = {
  type: "dropdown-menu",
  defaultBBox: { width: 220, height: 180 },
  defaultNode: (id) =>
    spatialNode("dropdown-menu", id, { width: 220, height: 180 }, { label: "File" }, { options: FILE_ITEMS, value: "open" }),
  agentDescription: "In-place dropdown menu with clickable items. Expanded inside the overlay box; never an OS popup or document portal.",
  xmlExample: `<dropdown-menu id="file-menu" label="File" value="open" x="24" y="24" width="220" height="180">
  <option value="open">Open</option>
  <option value="save">Save</option>
  <option value="export">Export</option>
</dropdown-menu>`,
  inspectorFields: LABEL_FIELD,
  Renderer: (props) => <VerticalMenu {...props} heading="Menu" fallback={FILE_ITEMS} />,
};

export const contextMenuModule: PtComponentModule = {
  type: "context-menu",
  defaultBBox: { width: 220, height: 180 },
  defaultNode: (id) =>
    spatialNode(
      "context-menu",
      id,
      { width: 220, height: 180 },
      { label: "Context menu" },
      { options: CONTEXT_ITEMS, value: "copy" },
    ),
  agentDescription: "In-place context menu with clickable items inside the overlay box. Never a document portal.",
  xmlExample: `<context-menu id="canvas-menu" label="Context menu" value="copy" x="24" y="24" width="220" height="180">
  <option value="cut">Cut</option>
  <option value="copy">Copy</option>
  <option value="paste">Paste</option>
</context-menu>`,
  inspectorFields: LABEL_FIELD,
  Renderer: (props) => <VerticalMenu {...props} heading="Context menu" fallback={CONTEXT_ITEMS} />,
};

export const menubarModule: PtComponentModule = {
  type: "menubar",
  defaultBBox: { width: 420, height: 160 },
  defaultNode: (id) =>
    spatialNode("menubar", id, { width: 420, height: 160 }, { label: "Menubar" }, { options: BAR_ITEMS, value: "file" }),
  agentDescription: "In-place menubar with always-visible items. Clicking an item commits value. Never a document portal.",
  xmlExample: `<menubar id="app-menu" label="Menubar" value="file" x="24" y="24" width="420" height="160">
  <option value="file">File</option>
  <option value="edit">Edit</option>
  <option value="view">View</option>
</menubar>`,
  inspectorFields: LABEL_FIELD,
  Renderer: (props) => <BarMenu {...props} fallback={BAR_ITEMS} role="menubar" />,
};

export const navigationMenuModule: PtComponentModule = {
  type: "navigation-menu",
  defaultBBox: { width: 420, height: 160 },
  defaultNode: (id) =>
    spatialNode(
      "navigation-menu",
      id,
      { width: 420, height: 160 },
      { label: "Navigation" },
      { options: NAV_ITEMS, value: "home" },
    ),
  agentDescription: "In-place navigation menu with clickable links expanded inside the overlay box. Never a document portal.",
  xmlExample: `<navigation-menu id="site-nav" label="Navigation" value="home" x="24" y="24" width="420" height="160">
  <option value="home">Home</option>
  <option value="docs">Docs</option>
  <option value="pricing">Pricing</option>
</navigation-menu>`,
  inspectorFields: TEXT_FIELDS,
  Renderer: (props) => <BarMenu {...props} fallback={NAV_ITEMS} role="navigation" />,
};
