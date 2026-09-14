import type { ReactElement } from "react";
import type { PtNode } from "../../../protocol";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { TEXT_FIELDS, propString, spatialNode } from "./defaults";
import { OverlayFrame, overlayTokens } from "./shared";

function ToastRow(props: { title: string; description?: string }): ReactElement {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "10px 12px",
        borderRadius: 10,
        background: overlayTokens.bg,
        border: `1px solid ${overlayTokens.border}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{props.title}</div>
      {props.description ? (
        <div style={{ fontSize: 12, color: overlayTokens.muted, lineHeight: 1.4 }}>{props.description}</div>
      ) : null}
    </div>
  );
}

function ToastPanel(props: PtRendererProps): ReactElement {
  const title = propString(props.node, "title", propString(props.node, "label", "Notification"));
  const description = propString(props.node, "description", "Saved just now.");
  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      role="status"
      style={{ boxShadow: overlayTokens.shadow, justifyContent: "center" }}
    >
      <div style={{ padding: 10 }}>
        <ToastRow title={title} description={description} />
      </div>
    </OverlayFrame>
  );
}

function sonnerItems(node: PtNode): { title: string; description: string }[] {
  if (node.options && node.options.length > 0) {
    return node.options.map((option) => ({ title: option.label, description: "" }));
  }
  return [
    {
      title: propString(node, "title", "Notification"),
      description: propString(node, "description", "Changes synced."),
    },
  ];
}

function SonnerPanel(props: PtRendererProps): ReactElement {
  const items = sonnerItems(props.node);
  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      role="status"
      style={{ background: overlayTokens.mutedBg, boxShadow: "none" }}
    >
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, index) => (
          <ToastRow key={`${item.title}-${index}`} title={item.title} description={item.description} />
        ))}
      </div>
    </OverlayFrame>
  );
}

export const toastModule: PtComponentModule = {
  type: "toast",
  defaultBBox: { width: 320, height: 72 },
  defaultNode: (id) =>
    spatialNode("toast", id, { width: 320, height: 72 }, {
      title: "Saved",
      description: "Your changes are stored on this canvas.",
      label: "Toast",
    }),
  agentDescription: "In-place toast notification bar inside the overlay box. Never a viewport portal.",
  xmlExample: `<toast id="saved" title="Saved" description="Your changes are stored on this canvas." label="Toast" x="24" y="24" width="320" height="72"/>`,
  inspectorFields: TEXT_FIELDS,
  Renderer: ToastPanel,
};

export const sonnerModule: PtComponentModule = {
  type: "sonner",
  defaultBBox: { width: 320, height: 140 },
  defaultNode: (id) =>
    spatialNode(
      "sonner",
      id,
      { width: 320, height: 140 },
      { title: "Notifications", description: "Stacked in-place toasts.", label: "Sonner" },
      {
        options: [
          { value: "saved", label: "Saved" },
          { value: "synced", label: "Changes synced" },
        ],
      },
    ),
  agentDescription: "In-place stacked toast notifications (sonner). Rendered in-tree, never a viewport portal.",
  xmlExample: `<sonner id="toasts" title="Notifications" description="Stacked in-place toasts." label="Sonner" x="24" y="24" width="320" height="140">
  <option value="saved">Saved</option>
  <option value="synced">Changes synced</option>
</sonner>`,
  inspectorFields: TEXT_FIELDS,
  Renderer: SonnerPanel,
};
