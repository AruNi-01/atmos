import type { ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { LABEL_FIELD, TEXT_FIELDS, propString, spatialNode } from "./defaults";
import { OverlayFrame, overlayTokens } from "./shared";

function Bubble(props: PtRendererProps & { kind: "popover" | "hover-card" | "tooltip" }): ReactElement {
  const title = propString(props.node, "title", props.kind === "tooltip" ? "" : "Details");
  const description = propString(props.node, "description", "");
  const label = propString(props.node, "label", props.kind === "tooltip" ? "Tooltip" : "");
  const isTooltip = props.kind === "tooltip";

  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      role={isTooltip ? "tooltip" : "dialog"}
      style={
        isTooltip
          ? {
              borderRadius: 8,
              boxShadow: overlayTokens.shadow,
              justifyContent: "center",
            }
          : undefined
      }
    >
      <div style={{ padding: isTooltip ? "8px 12px" : 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {isTooltip ? (
          <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{title || label}</div>
            {description ? (
              <div style={{ fontSize: 13, color: overlayTokens.muted, lineHeight: 1.45 }}>{description}</div>
            ) : null}
            {label && props.kind === "popover" ? (
              <div style={{ fontSize: 12, color: overlayTokens.muted }}>{label}</div>
            ) : null}
          </>
        )}
      </div>
    </OverlayFrame>
  );
}

export const popoverModule: PtComponentModule = {
  type: "popover",
  defaultBBox: { width: 260, height: 160 },
  defaultNode: (id) =>
    spatialNode("popover", id, { width: 260, height: 160 }, {
      title: "Popover",
      description: "Extra content stays visible inside this overlay box.",
      label: "More",
    }),
  agentDescription: "In-place popover bubble rendered inside the overlay box. Never a document portal.",
  xmlExample: `<popover id="hint" title="Popover" description="Extra content stays visible inside this overlay box." label="More" x="24" y="24" width="260" height="160"/>`,
  inspectorFields: TEXT_FIELDS,
  Renderer: (props) => <Bubble {...props} kind="popover" />,
};

export const hoverCardModule: PtComponentModule = {
  type: "hover-card",
  defaultBBox: { width: 260, height: 140 },
  defaultNode: (id) =>
    spatialNode("hover-card", id, { width: 260, height: 140 }, {
      title: "Ada Lovelace",
      description: "Mathematician and writer. Profile preview stays in-canvas.",
      label: "Profile",
    }),
  agentDescription: "In-place hover-card bubble. Always expanded inside the overlay box; never a document portal.",
  xmlExample: `<hover-card id="profile" title="Ada Lovelace" description="Mathematician and writer. Profile preview stays in-canvas." label="Profile" x="24" y="24" width="260" height="140"/>`,
  inspectorFields: TEXT_FIELDS,
  Renderer: (props) => <Bubble {...props} kind="hover-card" />,
};

export const tooltipModule: PtComponentModule = {
  type: "tooltip",
  defaultBBox: { width: 220, height: 48 },
  defaultNode: (id) => spatialNode("tooltip", id, { width: 220, height: 48 }, { label: "Save changes" }),
  agentDescription: "In-place tooltip bubble inside the overlay box. Never a document portal and never hover-gated off-canvas.",
  xmlExample: `<tooltip id="save-tip" label="Save changes" x="24" y="24" width="220" height="48"/>`,
  inspectorFields: LABEL_FIELD,
  Renderer: (props) => <Bubble {...props} kind="tooltip" />,
};
