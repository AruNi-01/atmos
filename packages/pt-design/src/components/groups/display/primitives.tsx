import type { CSSProperties, ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { COPY_FIELDS, FILL, FONT, LABEL_FIELD, T, TITLE_FIELDS, ptNode } from "./node";
import { ControlRoot, emit, ghostBtn, propText } from "./runtime";

const avatarBBox = { width: 40, height: 40 };
const badgeBBox = { width: 72, height: 24 };
const kbdBBox = { width: 48, height: 24 };
const sepBBox = { width: 240, height: 8 };
const aspectBBox = { width: 240, height: 135 };
const typeBBox = { width: 360, height: 100 };
const itemBBox = { width: 280, height: 56 };
const dirBBox = { width: 200, height: 48 };
const markerBBox = { width: 280, height: 28 };

function AvatarRenderer({ node, mode }: PtRendererProps): ReactElement {
  const fallback = propText(node, "fallback", propText(node, "label", "AL"));
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        aria-hidden="true"
        style={{
          ...FILL,
          borderRadius: "50%",
          background: T.mutedBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          color: T.fg,
        }}
      >
        {fallback.slice(0, 2).toUpperCase()}
      </div>
    </ControlRoot>
  );
}

export const avatarModule: PtComponentModule = {
  type: "avatar",
  defaultBBox: avatarBBox,
  defaultNode: (id) => ptNode(id, "avatar", avatarBBox, { props: { fallback: "AL" } }),
  Renderer: AvatarRenderer,
  agentDescription: "Circular avatar with initials from props.fallback.",
  xmlExample: `<avatar id="user" fallback="AL" x="0" y="0" width="40" height="40"/>`,
  inspectorFields: [{ key: "fallback", kind: "text" }],
};

function BadgeRenderer({ node, mode }: PtRendererProps): ReactElement {
  const variant = propText(node, "variant", "default");
  const destructive = variant === "destructive";
  return (
    <ControlRoot node={node} mode={mode}>
      <span
        style={{
          ...FILL,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: T.radius,
          padding: "0 8px",
          fontSize: 12,
          fontWeight: 500,
          background: destructive ? T.destructive : variant === "secondary" ? T.mutedBg : T.primary,
          color: destructive || variant === "default" ? T.primaryFg : T.fg,
          border: variant === "outline" ? `1px solid ${T.border}` : "1px solid transparent",
        }}
      >
        {propText(node, "label", "Badge")}
      </span>
    </ControlRoot>
  );
}

export const badgeModule: PtComponentModule = {
  type: "badge",
  defaultBBox: badgeBBox,
  defaultNode: (id) => ptNode(id, "badge", badgeBBox, { props: { label: "Badge" } }),
  Renderer: BadgeRenderer,
  agentDescription: "Status badge. Caption is props.label. Optional variant.",
  xmlExample: `<badge id="status" label="Badge" x="0" y="0" width="72" height="24"/>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "variant", kind: "text" },
  ],
};

function KbdRenderer({ node, mode }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <kbd
        style={{
          ...FILL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${T.border}`,
          borderBottomWidth: 2,
          borderRadius: T.radius,
          background: T.mutedBg,
          fontSize: 11,
          fontFamily: FONT,
        }}
      >
        {propText(node, "label", "⌘K")}
      </kbd>
    </ControlRoot>
  );
}

export const kbdModule: PtComponentModule = {
  type: "kbd",
  defaultBBox: kbdBBox,
  defaultNode: (id) => ptNode(id, "kbd", kbdBBox, { props: { label: "⌘K" } }),
  Renderer: KbdRenderer,
  agentDescription: "Keyboard shortcut chip. Caption is props.label.",
  xmlExample: `<kbd id="shortcut" label="⌘K" x="0" y="0" width="48" height="24"/>`,
  inspectorFields: LABEL_FIELD,
};

function SeparatorRenderer({ node, mode }: PtRendererProps): ReactElement {
  const vertical = propText(node, "orientation") === "vertical";
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        role="separator"
        aria-orientation={vertical ? "vertical" : "horizontal"}
        style={{
          width: vertical ? 1 : "100%",
          height: vertical ? "100%" : 1,
          background: T.border,
          margin: vertical ? "0 auto" : "3px 0",
        }}
      />
    </ControlRoot>
  );
}

export const separatorModule: PtComponentModule = {
  type: "separator",
  defaultBBox: sepBBox,
  defaultNode: (id) => ptNode(id, "separator", sepBBox, { props: { orientation: "horizontal" } }),
  Renderer: SeparatorRenderer,
  agentDescription: "Visual divider. props.orientation is horizontal or vertical.",
  xmlExample: `<separator id="div" orientation="horizontal" x="0" y="0" width="240" height="8"/>`,
  inspectorFields: [{ key: "orientation", kind: "text" }],
};

function AspectRatioRenderer({ node, mode }: PtRendererProps): ReactElement {
  const ratio = propText(node, "ratio", "16/9");
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        style={{
          ...FILL,
          background: T.mutedBg,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: T.muted,
          fontSize: 13,
        }}
      >
        {ratio}
      </div>
    </ControlRoot>
  );
}

export const aspectRatioModule: PtComponentModule = {
  type: "aspect-ratio",
  defaultBBox: aspectBBox,
  defaultNode: (id) => ptNode(id, "aspect-ratio", aspectBBox, { props: { ratio: "16/9" } }),
  Renderer: AspectRatioRenderer,
  agentDescription: "Fixed-ratio media frame. props.ratio is like 16/9.",
  xmlExample: `<aspect-ratio id="hero" ratio="16/9" x="0" y="0" width="240" height="135"/>`,
  inspectorFields: [{ key: "ratio", kind: "text" }],
};

function TypographyRenderer({ node, mode }: PtRendererProps): ReactElement {
  const title = propText(node, "title", propText(node, "label", "Taxing Laughter"));
  const body = propText(node, "description", "The joke tax is a terrible idea.");
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ ...FILL, display: "flex", flexDirection: "column", gap: 8, padding: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.45 }}>{body}</p>
      </div>
    </ControlRoot>
  );
}

export const typographyModule: PtComponentModule = {
  type: "typography",
  defaultBBox: typeBBox,
  defaultNode: (id) =>
    ptNode(id, "typography", typeBBox, {
      props: { title: "Taxing Laughter", description: "The joke tax is a terrible idea." },
    }),
  Renderer: TypographyRenderer,
  agentDescription: "Heading plus body copy. props.title and props.description.",
  xmlExample: `<typography id="intro" title="Taxing Laughter" description="The joke tax is a terrible idea." x="0" y="0" width="360" height="100"/>`,
  inspectorFields: TITLE_FIELDS,
};

function ItemRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <button
        type="button"
        onClick={() => emit(node, { value: node.id }, onCommit, onAction)}
        style={{
          ...FILL,
          display: "flex",
          alignItems: "center",
          gap: 12,
          textAlign: "left",
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          background: T.bg,
          padding: "8px 12px",
          cursor: "pointer",
          fontFamily: FONT,
          color: T.fg,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: T.mutedBg,
            flexShrink: 0,
          }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {propText(node, "title", propText(node, "label", "Item"))}
          </span>
          <span style={{ fontSize: 12, color: T.muted }}>
            {propText(node, "description", "Supporting text")}
          </span>
        </span>
      </button>
    </ControlRoot>
  );
}

export const itemModule: PtComponentModule = {
  type: "item",
  defaultBBox: itemBBox,
  defaultNode: (id) =>
    ptNode(id, "item", itemBBox, {
      props: { title: "Item", description: "Supporting text", label: "Item" },
    }),
  Renderer: ItemRenderer,
  agentDescription: "List row with title and description. Click commits value to the item id.",
  xmlExample: `<item id="row" title="Item" description="Supporting text" x="0" y="0" width="280" height="56"/>`,
  inspectorFields: TITLE_FIELDS,
};

function DirectionRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const dir = node.value === "rtl" ? "rtl" : "ltr";
  const chip = (next: "ltr" | "rtl"): CSSProperties => ({
    ...ghostBtn,
    background: dir === next ? T.primary : T.bg,
    color: dir === next ? T.primaryFg : T.fg,
    border: `1px solid ${dir === next ? T.primary : T.border}`,
  });
  return (
    <ControlRoot node={node} mode={mode}>
      <div dir={dir} style={{ ...FILL, display: "flex", alignItems: "center", gap: 8, padding: "0 8px" }}>
        <button type="button" style={chip("ltr")} onClick={() => emit(node, { value: "ltr" }, onCommit, onAction, "change")}>
          LTR
        </button>
        <button type="button" style={chip("rtl")} onClick={() => emit(node, { value: "rtl" }, onCommit, onAction, "change")}>
          RTL
        </button>
      </div>
    </ControlRoot>
  );
}

export const directionModule: PtComponentModule = {
  type: "direction",
  defaultBBox: dirBBox,
  defaultNode: (id) => ptNode(id, "direction", dirBBox, { props: { label: "Text direction" }, value: "ltr" }),
  Renderer: DirectionRenderer,
  agentDescription: "LTR / RTL toggle. value is ltr or rtl.",
  xmlExample: `<direction id="dir" label="Text direction" value="ltr" x="0" y="0" width="200" height="48"/>`,
  inspectorFields: LABEL_FIELD,
};

function MarkerRenderer({ node, mode }: PtRendererProps): ReactElement {
  const label = propText(node, "label", "Today");
  const separator = propText(node, "variant", "status") === "separator";
  return (
    <ControlRoot node={node} mode={mode}>
      {separator ? (
        <div style={{ ...FILL, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, height: 1, background: T.border }} />
          <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
          <span style={{ flex: 1, height: 1, background: T.border }} />
        </div>
      ) : (
        <div style={{ ...FILL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.muted }}>
          {label}
        </div>
      )}
    </ControlRoot>
  );
}

export const markerModule: PtComponentModule = {
  type: "marker",
  defaultBBox: markerBBox,
  defaultNode: (id) => ptNode(id, "marker", markerBBox, { props: { label: "Alex joined the thread", variant: "status" } }),
  Renderer: MarkerRenderer,
  agentDescription: "Inline status or date separator. props.variant is status or separator.",
  xmlExample: `<marker id="join" label="Alex joined the thread" variant="status" x="0" y="0" width="280" height="28"/>`,
  inspectorFields: COPY_FIELDS.concat([{ key: "variant", kind: "text" }]),
};
