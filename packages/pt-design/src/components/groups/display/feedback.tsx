import { AlertCircle, LoaderCircle } from "lucide-react";
import type { ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { FILL, T, TITLE_FIELDS, ptNode } from "./node";
import { ControlRoot, propText } from "./runtime";

const alertBBox = { width: 320, height: 72 };
const emptyBBox = { width: 280, height: 140 };
const progressBBox = { width: 220, height: 16 };
const skeletonBBox = { width: 200, height: 16 };
const spinnerBBox = { width: 24, height: 24 };

function AlertRenderer({ node, mode }: PtRendererProps): ReactElement {
  const destructive = propText(node, "variant") === "destructive";
  return (
    <ControlRoot node={node} mode={mode} role="alert">
      <div
        style={{
          ...FILL,
          display: "flex",
          gap: 10,
          padding: "10px 12px",
          borderRadius: T.radius,
          border: `1px solid ${destructive ? T.destructive : T.border}`,
          background: destructive ? T.destructiveBg : T.mutedBg,
          color: destructive ? T.destructive : T.fg,
        }}
      >
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{propText(node, "title", "Alert")}</strong>
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            {propText(node, "description", "Something needs attention.")}
          </span>
        </div>
      </div>
    </ControlRoot>
  );
}

export const alertModule: PtComponentModule = {
  type: "alert",
  defaultBBox: alertBBox,
  defaultNode: (id) =>
    ptNode(id, "alert", alertBBox, {
      props: { title: "Alert", description: "Something needs attention.", variant: "default" },
    }),
  Renderer: AlertRenderer,
  agentDescription: "Inline alert with title and description. variant may be destructive.",
  xmlExample: `<alert id="notice" title="Alert" description="Something needs attention." x="0" y="0" width="320" height="72"/>`,
  inspectorFields: TITLE_FIELDS.concat([{ key: "variant", kind: "text" }]),
};

function EmptyRenderer({ node, mode }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        style={{
          ...FILL,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: T.mutedBg,
          border: `1px dashed ${T.border}`,
          borderRadius: T.radius,
          textAlign: "center",
          padding: 16,
        }}
      >
        <strong style={{ fontSize: 14 }}>{propText(node, "title", "No results")}</strong>
        <span style={{ fontSize: 12, color: T.muted }}>
          {propText(node, "description", "Try a different search.")}
        </span>
      </div>
    </ControlRoot>
  );
}

export const emptyModule: PtComponentModule = {
  type: "empty",
  defaultBBox: emptyBBox,
  defaultNode: (id) =>
    ptNode(id, "empty", emptyBBox, {
      props: { title: "No results", description: "Try a different search." },
    }),
  Renderer: EmptyRenderer,
  agentDescription: "Empty-state panel with title and description.",
  xmlExample: `<empty id="none" title="No results" description="Try a different search." x="0" y="0" width="280" height="140"/>`,
  inspectorFields: TITLE_FIELDS,
};

function ProgressRenderer({ node, mode }: PtRendererProps): ReactElement {
  const raw = Number(node.value ?? propText(node, "value", "45"));
  const n = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0;
  return (
    <ControlRoot node={node} mode={mode}>
      <progress
        value={n}
        max={100}
        aria-label={propText(node, "label", "Progress")}
        style={{ width: "100%", height: 10, accentColor: T.primary }}
      />
    </ControlRoot>
  );
}

export const progressModule: PtComponentModule = {
  type: "progress",
  defaultBBox: progressBBox,
  defaultNode: (id) => ptNode(id, "progress", progressBBox, { props: { label: "Progress" }, value: "45" }),
  Renderer: ProgressRenderer,
  agentDescription: "Progress bar. value is 0–100.",
  xmlExample: `<progress id="load" label="Progress" value="45" x="0" y="0" width="220" height="16"/>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

function SkeletonRenderer({ node, mode }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        aria-hidden="true"
        style={{
          ...FILL,
          borderRadius: 6,
          background: "linear-gradient(90deg, #e4e4e7 0%, #f4f4f5 50%, #e4e4e7 100%)",
        }}
      />
    </ControlRoot>
  );
}

export const skeletonModule: PtComponentModule = {
  type: "skeleton",
  defaultBBox: skeletonBBox,
  defaultNode: (id) => ptNode(id, "skeleton", skeletonBBox, { props: {} }),
  Renderer: SkeletonRenderer,
  agentDescription: "Loading placeholder bar.",
  xmlExample: `<skeleton id="sk" x="0" y="0" width="200" height="16"/>`,
  inspectorFields: [],
};

function SpinnerRenderer({ node, mode }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        role="status"
        aria-label={propText(node, "label", "Loading")}
        style={{ ...FILL, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <LoaderCircle size={18} color={T.muted} />
      </div>
    </ControlRoot>
  );
}

export const spinnerModule: PtComponentModule = {
  type: "spinner",
  defaultBBox: spinnerBBox,
  defaultNode: (id) => ptNode(id, "spinner", spinnerBBox, { props: { label: "Loading" } }),
  Renderer: SpinnerRenderer,
  agentDescription: "Loading spinner.",
  xmlExample: `<spinner id="wait" label="Loading" x="0" y="0" width="24" height="24"/>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};
