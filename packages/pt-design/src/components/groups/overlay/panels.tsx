import type { ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { TEXT_FIELDS, propString, spatialNode } from "./defaults";
import { OverlayFrame, emitValue, overlayTokens } from "./shared";

type Surface = "dialog" | "alert-dialog" | "sheet" | "drawer";

function ConfirmPanel(props: PtRendererProps & { surface: Surface }): ReactElement {
  const title = propString(props.node, "title", "Dialog");
  const description = propString(props.node, "description", "Confirm to continue.");
  const label = propString(props.node, "label", "Confirm");
  const destructive = props.surface === "alert-dialog";
  const isDrawer = props.surface === "drawer";
  const isSheet = props.surface === "sheet";

  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      role="dialog"
      style={
        isSheet
          ? { borderRadius: "0 12px 12px 0", boxShadow: overlayTokens.shadow }
          : isDrawer
            ? { borderRadius: "12px 12px 0 0", justifyContent: "flex-end" }
            : undefined
      }
    >
      {isDrawer ? (
        <div
          aria-hidden="true"
          style={{
            width: 36,
            height: 4,
            borderRadius: 999,
            background: overlayTokens.mutedBg,
            margin: "8px auto 0",
          }}
        />
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 13, color: overlayTokens.muted, lineHeight: 1.45, flex: 1 }}>{description}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {destructive ? (
            <button
              type="button"
              onClick={() => emitValue(props.node, "cancel", props.onCommit, props.onAction)}
              style={ghostButtonStyle()}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => emitValue(props.node, "confirm", props.onCommit, props.onAction)}
            style={primaryButtonStyle(destructive)}
          >
            {label}
          </button>
        </div>
      </div>
    </OverlayFrame>
  );
}

function primaryButtonStyle(destructive: boolean) {
  return {
    appearance: "none" as const,
    cursor: "pointer",
    borderRadius: overlayTokens.radius,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: overlayTokens.font,
    background: overlayTokens.bg,
    color: destructive ? overlayTokens.destructive : overlayTokens.fg,
    border: `1.5px solid ${destructive ? overlayTokens.destructive : overlayTokens.border}`,
  };
}

function ghostButtonStyle() {
  return {
    appearance: "none" as const,
    border: `1.5px dashed ${overlayTokens.border}`,
    cursor: "pointer",
    borderRadius: overlayTokens.radius,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: overlayTokens.font,
    background: overlayTokens.bg,
    color: overlayTokens.fg,
  };
}

function panelModule(
  type: Surface,
  bbox: { width: number; height: number },
  copy: { title: string; description: string; label: string },
  agentDescription: string,
  xmlExample: string,
): PtComponentModule {
  return {
    type,
    defaultBBox: bbox,
    defaultNode: (id) => spatialNode(type, id, bbox, copy),
    agentDescription,
    xmlExample,
    inspectorFields: TEXT_FIELDS,
    Renderer: (props) => <ConfirmPanel {...props} surface={type} />,
  };
}

export const dialogModule: PtComponentModule = panelModule(
  "dialog",
  { width: 320, height: 200 },
  {
    title: "Dialog",
    description: "Review the details and confirm to continue.",
    label: "Confirm",
  },
  "In-place dialog panel with title, description, and a confirm control. Renders inside the overlay box; never portals to the document.",
  `<dialog id="welcome" title="Dialog" description="Review the details and confirm to continue." label="Confirm" x="40" y="40" width="320" height="200"/>`,
);

export const alertDialogModule: PtComponentModule = panelModule(
  "alert-dialog",
  { width: 320, height: 200 },
  {
    title: "Are you sure?",
    description: "This action cannot be undone.",
    label: "Continue",
  },
  "In-place alert dialog with title, description, cancel, and a confirm control. Expanded inside the canvas node; never a document portal.",
  `<alert-dialog id="confirm-delete" title="Are you sure?" description="This action cannot be undone." label="Continue" x="40" y="40" width="320" height="200"/>`,
);

export const sheetModule: PtComponentModule = panelModule(
  "sheet",
  { width: 320, height: 360 },
  {
    title: "Sheet",
    description: "A side panel that stays expanded inside this overlay box.",
    label: "Done",
  },
  "In-place sheet panel with title, description, and a confirm control. Not a viewport portal.",
  `<sheet id="details" title="Sheet" description="A side panel that stays expanded inside this overlay box." label="Done" x="24" y="24" width="320" height="360"/>`,
);

export const drawerModule: PtComponentModule = panelModule(
  "drawer",
  { width: 320, height: 220 },
  {
    title: "Drawer",
    description: "A bottom panel expanded inside this overlay box.",
    label: "Done",
  },
  "In-place drawer panel with title, description, and a confirm control. Renders in-tree, never as a document portal.",
  `<drawer id="filters" title="Drawer" description="A bottom panel expanded inside this overlay box." label="Done" x="24" y="240" width="320" height="220"/>`,
);
