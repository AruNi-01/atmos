import type { KeyboardEvent, ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { TEXT_FIELDS, propString, spatialNode } from "./defaults";
import {
  ContentShell,
  OverlayFrame,
  OverlayTrigger,
  emitValue,
  ghostButtonStyle,
  overlayTokens,
  overlayVisible,
  primaryButtonStyle,
  useOverlayOpen,
} from "./shared";

type Surface = "dialog" | "alert-dialog" | "sheet" | "drawer";

function ConfirmPanel(props: PtRendererProps & { surface: Surface }): ReactElement {
  const [open, setOpen] = useOverlayOpen(props.mode);
  const visible = overlayVisible(props.mode, open);
  const title = propString(props.node, "title", "Dialog");
  const description = propString(props.node, "description", "Confirm to continue.");
  const triggerLabel = propString(props.node, "label", "Open");
  const destructive = props.surface === "alert-dialog";
  const isDrawer = props.surface === "drawer";
  const isSheet = props.surface === "sheet";

  const close = (): void => setOpen(false);
  const onConfirm = (): void => {
    emitValue(props.node, "confirm", props.onCommit, props.onAction);
    close();
  };
  const onCancel = (): void => {
    emitValue(props.node, "cancel", props.onCommit, props.onAction);
    close();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") close();
  };

  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      onKeyDown={onKeyDown}
    >
      <OverlayTrigger
        label={triggerLabel}
        open={visible}
        popup="dialog"
        onClick={() => setOpen((prev) => !prev)}
      />
      <ContentShell
        open={visible}
        role="dialog"
        style={
          isSheet
            ? { borderRadius: `0 ${overlayTokens.radius} ${overlayTokens.radius} 0`, boxShadow: overlayTokens.shadow }
            : isDrawer
              ? { borderRadius: `${overlayTokens.radius} ${overlayTokens.radius} 0 0` }
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
              margin: "0 auto 8px",
              flexShrink: 0,
            }}
          />
        ) : null}
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 13, color: overlayTokens.muted, lineHeight: 1.45, flex: 1 }}>{description}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={onCancel} style={ghostButtonStyle()}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={primaryButtonStyle(destructive)}>
            Confirm
          </button>
        </div>
      </ContentShell>
    </OverlayFrame>
  );
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
