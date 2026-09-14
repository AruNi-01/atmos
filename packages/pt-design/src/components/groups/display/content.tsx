import type { CSSProperties, ReactElement } from "react";
import type { PtNode, PtOption } from "../../../protocol";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { FILL, FONT, T, TITLE_FIELDS, ptNode } from "./node";
import { ControlRoot, DisplayChild, emit, patchChild, propText, renderTreeChildren } from "./runtime";

const cardBBox = { width: 360, height: 200 };
const tableBBox = { width: 360, height: 160 };
const questBBox = { width: 320, height: 220 };
const resizableBBox = { width: 320, height: 160 };
const scrollBBox = { width: 200, height: 160 };

function CardRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        style={{
          ...FILL,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          background: T.bg,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 16px 8px" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{propText(node, "title", "Card")}</div>
          {propText(node, "description") ? (
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{propText(node, "description")}</div>
          ) : null}
        </div>
        <div style={{ position: "relative", width: "100%", height: "calc(100% - 56px)" }}>
          {renderTreeChildren(node, mode, onCommit, onAction)}
        </div>
      </div>
    </ControlRoot>
  );
}

export const cardModule: PtComponentModule = {
  type: "card",
  defaultBBox: cardBBox,
  defaultNode: (id) =>
    ptNode(id, "card", cardBBox, {
      props: { title: "Sign in", description: "Use your work email." },
      children: [
        ptNode(`${id}-body`, "typography", { width: 328, height: 72 }, {
          x: 16,
          y: 72,
          props: { title: "Welcome back", description: "Continue to your workspace." },
        }),
      ],
    }),
  Renderer: CardRenderer,
  agentDescription: "Card with title, optional description, and nested children.",
  xmlExample: `<card id="auth" title="Sign in" x="20" y="20" width="360" height="200">
  <typography id="auth-body" title="Welcome back" description="Continue to your workspace." x="16" y="72" width="328" height="72"/>
</card>`,
  inspectorFields: TITLE_FIELDS.concat([{ key: "action", kind: "text" }]),
};

function tableColumns(node: PtNode): PtOption[] {
  if (node.options && node.options.length >= 2) return node.options;
  return [
    { value: "name", label: "Name" },
    { value: "role", label: "Role" },
  ];
}

function tableRows(node: PtNode): PtNode[] {
  if ((node.children ?? []).length >= 2) return node.children ?? [];
  return [
    ptNode(`${node.id}-r1`, "item", { width: 1, height: 1 }, { props: { label: "Ada Lovelace", description: "Admin" } }),
    ptNode(`${node.id}-r2`, "item", { width: 1, height: 1 }, { props: { label: "Grace Hopper", description: "Editor" } }),
  ];
}

function cellText(row: PtNode, column: PtOption, index: number): string {
  const fromProp = row.props[column.value];
  if (fromProp !== null && fromProp !== undefined && fromProp !== "") return String(fromProp);
  if (index === 0) return propText(row, "label", propText(row, "title", ""));
  if (index === 1) return propText(row, "description", "");
  return "";
}

const thTd: CSSProperties = {
  borderBottom: `1px solid ${T.border}`,
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 13,
  fontFamily: FONT,
};

function TableRenderer({ node, mode }: PtRendererProps): ReactElement {
  const columns = tableColumns(node);
  const rows = tableRows(node);
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ ...FILL, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: T.radius }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: T.bg }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.value} style={{ ...thTd, background: T.mutedBg, fontWeight: 600 }}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-pt-child={row.id}>
                {columns.map((column, index) => (
                  <td key={column.value} style={thTd}>
                    {cellText(row, column, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ControlRoot>
  );
}

function tableDefault(id: string, type: "table" | "data-table") {
  return ptNode(id, type, tableBBox, {
    props: { title: type === "data-table" ? "Data table" : "Table" },
    options: [
      { value: "name", label: "Name" },
      { value: "role", label: "Role" },
    ],
    children: [
      ptNode(`${id}-r1`, "item", { width: 328, height: 1 }, {
        x: 16,
        y: 40,
        props: { label: "Ada Lovelace", description: "Admin", name: "Ada Lovelace", role: "Admin" },
      }),
      ptNode(`${id}-r2`, "item", { width: 328, height: 1 }, {
        x: 16,
        y: 80,
        props: { label: "Grace Hopper", description: "Editor", name: "Grace Hopper", role: "Editor" },
      }),
    ],
  });
}

export const tableModule: PtComponentModule = {
  type: "table",
  defaultBBox: tableBBox,
  defaultNode: (id) => tableDefault(id, "table"),
  Renderer: TableRenderer,
  agentDescription: "HTML table. options are columns; item children are rows.",
  xmlExample: `<table id="people" x="0" y="0" width="360" height="160">
  <option value="name">Name</option>
  <option value="role">Role</option>
  <item id="people-r1" label="Ada Lovelace" description="Admin" x="16" y="40" width="328" height="1"/>
  <item id="people-r2" label="Grace Hopper" description="Editor" x="16" y="80" width="328" height="1"/>
</table>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};

export const dataTableModule: PtComponentModule = {
  type: "data-table",
  defaultBBox: tableBBox,
  defaultNode: (id) => tableDefault(id, "data-table"),
  Renderer: TableRenderer,
  agentDescription: "Data table with column options and row children. Renders a real HTML table.",
  xmlExample: `<data-table id="grid" x="0" y="0" width="360" height="160">
  <option value="name">Name</option>
  <option value="role">Role</option>
  <item id="grid-r1" label="Ada Lovelace" description="Admin" x="16" y="40" width="328" height="1"/>
  <item id="grid-r2" label="Grace Hopper" description="Editor" x="16" y="80" width="328" height="1"/>
</data-table>`,
  inspectorFields: [{ key: "title", kind: "text" }],
};

function QuestionnaireRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const options =
    node.options && node.options.length >= 2
      ? node.options
      : [
          { value: "dashboard", label: "Dashboard" },
          { value: "chat", label: "Chat app" },
        ];
  const selected = node.value ?? "";
  return (
    <ControlRoot node={node} mode={mode}>
      <fieldset
        style={{
          ...FILL,
          margin: 0,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <legend style={{ fontSize: 11, color: T.muted }}>Question</legend>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{propText(node, "title", "What are you building?")}</div>
        {propText(node, "description") ? (
          <div style={{ fontSize: 12, color: T.muted }}>{propText(node, "description")}</div>
        ) : null}
        {options.map((option) => (
          <label
            key={option.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${selected === option.value ? T.primary : T.border}`,
              background: selected === option.value ? T.mutedBg : T.bg,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <input
              type="radio"
              name={node.id}
              value={option.value}
              checked={selected === option.value}
              onChange={() => emit(node, { value: option.value }, onCommit, onAction, "change")}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    </ControlRoot>
  );
}

export const questionnaireModule: PtComponentModule = {
  type: "questionnaire",
  defaultBBox: questBBox,
  defaultNode: (id) =>
    ptNode(id, "questionnaire", questBBox, {
      props: { title: "What are you building?", description: "Pick one to continue." },
      value: "dashboard",
      options: [
        { value: "dashboard", label: "Dashboard" },
        { value: "chat", label: "Chat app" },
      ],
    }),
  Renderer: QuestionnaireRenderer,
  agentDescription: "Single-choice question. options are answers; Interact commits value.",
  xmlExample: `<questionnaire id="q1" title="What are you building?" value="dashboard" x="0" y="0" width="320" height="220">
  <option value="dashboard">Dashboard</option>
  <option value="chat">Chat app</option>
</questionnaire>`,
  inspectorFields: TITLE_FIELDS,
};

function ResizableRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const splitRaw = Number(node.props.split ?? node.value ?? 40);
  const split = Number.isFinite(splitRaw) ? Math.min(80, Math.max(20, splitRaw)) : 40;
  const kids = node.children ?? [];
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ ...FILL, display: "flex", border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden" }}>
        <div style={{ width: `${split}%`, background: T.mutedBg, padding: 12, overflow: "auto" }}>
          {kids[0] ? (
            <div data-pt-child={kids[0].id} style={{ height: "100%" }}>
              <DisplayChild
                node={kids[0]}
                mode={mode}
                onCommit={(patch) => onCommit({ children: patchChild(node.children, kids[0]!.id, patch) })}
                onAction={onAction}
              />
            </div>
          ) : (
            <div>Sidebar</div>
          )}
        </div>
        <input
          type="range"
          min={20}
          max={80}
          value={split}
          aria-label="Resize"
          onChange={(event) =>
            emit(node, { value: event.target.value, props: { ...node.props, split: Number(event.target.value) } }, onCommit, onAction, "change")
          }
          style={{ width: 8, writingMode: "vertical-lr", cursor: "col-resize", padding: 0, margin: 0 }}
        />
        <div style={{ flex: 1, padding: 12, overflow: "auto" }}>
          {kids[1] ? (
            <div data-pt-child={kids[1].id} style={{ height: "100%" }}>
              <DisplayChild
                node={kids[1]}
                mode={mode}
                onCommit={(patch) => onCommit({ children: patchChild(node.children, kids[1]!.id, patch) })}
                onAction={onAction}
              />
            </div>
          ) : (
            <div>Content</div>
          )}
        </div>
      </div>
    </ControlRoot>
  );
}

export const resizableModule: PtComponentModule = {
  type: "resizable",
  defaultBBox: resizableBBox,
  defaultNode: (id) =>
    ptNode(id, "resizable", resizableBBox, {
      props: { split: 40 },
      value: "40",
      children: [
        ptNode(`${id}-left`, "typography", { width: 120, height: 80 }, {
          x: 8,
          y: 8,
          props: { title: "Sidebar", description: "Left pane" },
        }),
        ptNode(`${id}-right`, "typography", { width: 160, height: 80 }, {
          x: 148,
          y: 8,
          props: { title: "Content", description: "Right pane" },
        }),
      ],
    }),
  Renderer: ResizableRenderer,
  agentDescription: "Two-pane split. Interact range commits value/props.split (percent).",
  xmlExample: `<resizable id="split" value="40" split="40" x="0" y="0" width="320" height="160">
  <typography id="split-left" title="Sidebar" x="8" y="8" width="120" height="80"/>
  <typography id="split-right" title="Content" x="148" y="8" width="160" height="80"/>
</resizable>`,
  inspectorFields: [{ key: "split", kind: "number" }],
};

function ScrollAreaRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const lines = ["Tag 1", "Tag 2", "Tag 3", "Tag 4", "Tag 5", "Tag 6", "Tag 7", "Tag 8"];
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        style={{
          ...FILL,
          overflow: "auto",
          border: `1px solid ${T.border}`,
          borderRadius: T.radius,
          padding: 10,
          fontSize: 13,
        }}
      >
        {(node.children ?? []).length > 0
          ? renderTreeChildren(node, mode, onCommit, onAction)
          : lines.map((line) => (
              <div key={line} style={{ padding: "6px 4px", borderBottom: `1px solid ${T.border}` }}>
                {line}
              </div>
            ))}
      </div>
    </ControlRoot>
  );
}

export const scrollAreaModule: PtComponentModule = {
  type: "scroll-area",
  defaultBBox: scrollBBox,
  defaultNode: (id) =>
    ptNode(id, "scroll-area", scrollBBox, {
      children: [
        ptNode(`${id}-copy`, "typography", { width: 168, height: 220 }, {
          x: 8,
          y: 8,
          props: {
            title: "Tags",
            description: "Alpha\nBeta\nGamma\nDelta\nEpsilon\nZeta\nEta\nTheta",
          },
        }),
      ],
    }),
  Renderer: ScrollAreaRenderer,
  agentDescription: "Scrollable region. Nested children render inside an overflow box.",
  xmlExample: `<scroll-area id="list" x="0" y="0" width="200" height="160">
  <typography id="list-copy" title="Tags" description="Alpha" x="8" y="8" width="168" height="220"/>
</scroll-area>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};
