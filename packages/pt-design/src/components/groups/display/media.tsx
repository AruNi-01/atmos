import { File, Paperclip } from "lucide-react";
import type { ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { COPY_FIELDS, FILL, LABEL_FIELD, T, TITLE_FIELDS, ptNode } from "./node";
import { ControlRoot, emit, propText, renderFlowChildren } from "./runtime";

const chartBBox = { width: 320, height: 180 };
const attachBBox = { width: 280, height: 72 };
const bubbleBBox = { width: 220, height: 56 };
const messageBBox = { width: 280, height: 72 };
const scrollerBBox = { width: 300, height: 220 };

function ChartRenderer({ node, mode }: PtRendererProps): ReactElement {
  const values =
    node.options && node.options.length > 0
      ? node.options.map((option) => Number(option.value) || 0)
      : [40, 80, 55, 110, 70];
  const max = Math.max(1, ...values);
  const w = 320;
  const h = 180;
  const pad = 24;
  const barW = Math.max(12, (w - pad * 2) / values.length - 12);
  const labels = node.options?.map((option) => option.label) ?? values.map((_, i) => String(i + 1));
  const points = values.map((value, i) => {
    const x = pad + i * ((w - pad * 2) / values.length) + barW / 2;
    const y = h - pad - (value / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <ControlRoot node={node} mode={mode}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" role="img" aria-label={propText(node, "title", "Chart")}>
        <rect x="0" y="0" width={w} height={h} fill={T.bg} rx={T.radius} />
        {values.map((value, i) => {
          const x = pad + i * ((w - pad * 2) / values.length);
          const bh = (value / max) * (h - pad * 2);
          return (
            <rect
              key={`${labels[i]}-${i}`}
              x={x}
              y={h - pad - bh}
              width={barW}
              height={bh}
              fill={T.accent}
              rx="3"
            />
          );
        })}
        <polyline fill="none" stroke={T.primary} strokeWidth="2" points={points.join(" ")} />
      </svg>
    </ControlRoot>
  );
}

export const chartModule: PtComponentModule = {
  type: "chart",
  defaultBBox: chartBBox,
  defaultNode: (id) =>
    ptNode(id, "chart", chartBBox, {
      props: { title: "Chart" },
      options: [
        { value: "40", label: "Mon" },
        { value: "80", label: "Tue" },
        { value: "55", label: "Wed" },
        { value: "110", label: "Thu" },
        { value: "70", label: "Fri" },
      ],
    }),
  Renderer: ChartRenderer,
  agentDescription: "Bar and line chart drawn as SVG. option values are numeric heights.",
  xmlExample: `<chart id="usage" title="Chart" x="0" y="0" width="320" height="180">
  <option value="40">Mon</option>
  <option value="80">Tue</option>
</chart>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};

function AttachmentRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const name = propText(node, "label", "workspace.png");
  const meta = propText(node, "description", "PNG · 820 KB");
  const variant = propText(node, "variant", "file");
  return (
    <ControlRoot node={node} mode={mode}>
      <button
        type="button"
        onClick={() => emit(node, { value: name }, onCommit, onAction)}
        style={{
          ...FILL,
          display: "flex",
          alignItems: "center",
          gap: 12,
          textAlign: "left",
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          background: T.bg,
          padding: "0 12px",
          cursor: "pointer",
          color: T.fg,
        }}
      >
        {variant === "image" ? (
          <span style={{ width: 40, height: 40, borderRadius: T.radius, background: T.mutedBg, flexShrink: 0 }} />
        ) : variant === "uploading" ? (
          <Paperclip size={18} />
        ) : (
          <File size={18} />
        )}
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
          <span style={{ fontSize: 12, color: T.muted }}>{meta}</span>
        </span>
      </button>
    </ControlRoot>
  );
}

export const attachmentModule: PtComponentModule = {
  type: "attachment",
  defaultBBox: attachBBox,
  defaultNode: (id) =>
    ptNode(id, "attachment", attachBBox, {
      props: { label: "workspace.png", description: "PNG · 820 KB", variant: "file" },
    }),
  Renderer: AttachmentRenderer,
  agentDescription: "File or image attachment chip. label is the filename.",
  xmlExample: `<attachment id="file" label="workspace.png" description="PNG · 820 KB" variant="file" x="0" y="0" width="280" height="72"/>`,
  inspectorFields: COPY_FIELDS.concat([{ key: "variant", kind: "text" }]),
};

function BubbleRenderer({ node, mode }: PtRendererProps): ReactElement {
  const sent = propText(node, "variant") === "sent";
  const text = propText(node, "label", sent ? "Sounds good." : "Can you review this?");
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        style={{
          ...FILL,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderRadius: T.radius,
          background: sent ? T.primary : T.mutedBg,
          color: sent ? T.primaryFg : T.fg,
          fontSize: 13,
        }}
      >
        {text}
      </div>
    </ControlRoot>
  );
}

export const bubbleModule: PtComponentModule = {
  type: "bubble",
  defaultBBox: bubbleBBox,
  defaultNode: (id) =>
    ptNode(id, "bubble", bubbleBBox, {
      props: { label: "Can you review this?", variant: "received" },
    }),
  Renderer: BubbleRenderer,
  agentDescription: "Chat bubble. props.variant is received or sent.",
  xmlExample: `<bubble id="msg" label="Can you review this?" variant="received" x="0" y="0" width="220" height="56"/>`,
  inspectorFields: LABEL_FIELD.concat([{ key: "variant", kind: "text" }]),
};

function MessageRenderer({ node, mode }: PtRendererProps): ReactElement {
  const assistant = propText(node, "variant", "user") === "assistant";
  const role = propText(node, "title", assistant ? "Assistant" : "You");
  const body = propText(node, "description", assistant ? "Here is a draft." : "Please summarize.");
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ ...FILL, display: "flex", gap: 10, padding: "8px 4px" }}>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: assistant ? T.accent : T.mutedBg,
            flexShrink: 0,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: T.muted }}>{role}</span>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: T.radius,
              background: assistant ? T.mutedBg : T.primary,
              color: assistant ? T.fg : T.primaryFg,
              fontSize: 13,
            }}
          >
            {body}
          </div>
        </div>
      </div>
    </ControlRoot>
  );
}

export const messageModule: PtComponentModule = {
  type: "message",
  defaultBBox: messageBBox,
  defaultNode: (id) =>
    ptNode(id, "message", messageBBox, {
      props: { title: "You", description: "Please summarize.", variant: "user" },
    }),
  Renderer: MessageRenderer,
  agentDescription: "Chat message with role title and body description.",
  xmlExample: `<message id="u1" title="You" description="Please summarize." variant="user" x="0" y="0" width="280" height="72"/>`,
  inspectorFields: TITLE_FIELDS.concat([{ key: "variant", kind: "text" }]),
};

function MessageScrollerRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        style={{
          ...FILL,
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 11, color: T.muted, textAlign: "center", padding: "8px 0" }}>Today</div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
          {renderFlowChildren(node, mode, onCommit, onAction)}
        </div>
      </div>
    </ControlRoot>
  );
}

export const messageScrollerModule: PtComponentModule = {
  type: "message-scroller",
  defaultBBox: scrollerBBox,
  defaultNode: (id) =>
    ptNode(id, "message-scroller", scrollerBBox, {
      children: [
        ptNode(`${id}-m1`, "bubble", { width: 200, height: 48 }, {
          x: 12,
          y: 32,
          props: { label: "Can you review this?", variant: "received" },
        }),
        ptNode(`${id}-m2`, "bubble", { width: 200, height: 48 }, {
          x: 88,
          y: 92,
          props: { label: "On it.", variant: "sent" },
        }),
      ],
    }),
  Renderer: MessageScrollerRenderer,
  agentDescription: "Scrollable chat thread. Nest bubble or message children.",
  xmlExample: `<message-scroller id="thread" x="0" y="0" width="300" height="220">
  <bubble id="thread-m1" label="Can you review this?" variant="received" x="12" y="32" width="200" height="48"/>
  <bubble id="thread-m2" label="On it." variant="sent" x="88" y="92" width="200" height="48"/>
</message-scroller>`,
  inspectorFields: LABEL_FIELD,
};
