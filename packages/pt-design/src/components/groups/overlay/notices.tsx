import { useState, type ReactElement } from "react";
import type { PtNode } from "../../../protocol";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { TEXT_FIELDS, propString, spatialNode } from "./defaults";
import { OverlayFrame, ghostButtonStyle, overlayTokens } from "./shared";

function ToastRow(props: { title: string; description?: string; onClose: () => void }): ReactElement {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        borderRadius: overlayTokens.radius,
        background: overlayTokens.bg,
        border: `1px solid ${overlayTokens.border}`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{props.title}</div>
        {props.description ? (
          <div style={{ fontSize: 12, color: overlayTokens.muted, lineHeight: 1.4 }}>{props.description}</div>
        ) : null}
      </div>
      <button type="button" onClick={props.onClose} style={{ ...ghostButtonStyle(), padding: "4px 8px", flexShrink: 0 }}>
        Close
      </button>
    </div>
  );
}

function ToastPanel(props: PtRendererProps): ReactElement {
  const [visible, setVisible] = useState(true);
  const title = propString(props.node, "title", propString(props.node, "label", "Notification"));
  const description = propString(props.node, "description", "Saved just now.");
  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
      role="status"
      style={{ justifyContent: "center" }}
    >
      <div style={{ padding: 10 }}>
        {visible ? <ToastRow title={title} description={description} onClose={() => setVisible(false)} /> : null}
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
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(() => new Set());
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
        {items.map((item, index) =>
          dismissed.has(index) ? null : (
            <ToastRow
              key={`${item.title}-${index}`}
              title={item.title}
              description={item.description}
              onClose={() =>
                setDismissed((prev) => {
                  const next = new Set(prev);
                  next.add(index);
                  return next;
                })
              }
            />
          ),
        )}
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
