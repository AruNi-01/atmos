import type { ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { ptNode } from "./node";
import { clickRun, ControlRoot, renderTreeChildren } from "./runtime";

const formBBox = { width: 360, height: 140 };
const fieldBBox = { width: 280, height: 72 };
const buttonGroupBBox = { width: 240, height: 40 };
const inputGroupBBox = { width: 280, height: 40 };

function TreeRenderer({
  node,
  mode,
  onCommit,
  onAction,
  asForm,
}: PtRendererProps & { asForm?: boolean }): ReactElement {
  const body = renderTreeChildren(node, mode, onCommit, onAction);
  return (
    <ControlRoot node={node} mode={mode}>
      {asForm ? (
        <form
          style={{ position: "relative", width: "100%", height: "100%", margin: 0 }}
          onSubmit={(event) => event.preventDefault()}
        >
          {body}
        </form>
      ) : (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>{body}</div>
      )}
    </ControlRoot>
  );
}

export const formModule: PtComponentModule = {
  type: "form",
  defaultBBox: formBBox,
  defaultNode: (id) =>
    ptNode(id, "form", formBBox, {
      props: { label: "Form" },
      children: [
        ptNode(`${id}-email`, "input", { width: 328, height: 40 }, {
          x: 16,
          y: 16,
          props: { label: "Email", placeholder: "you@example.com" },
          value: "",
        }),
        ptNode(`${id}-submit`, "button", { width: 328, height: 40 }, {
          x: 16,
          y: 72,
          props: { label: "Submit" },
          events: clickRun,
        }),
      ],
    }),
  Renderer: (props) => <TreeRenderer {...props} asForm />,
  agentDescription: "Form tree. Nest form-group controls as children (input, button, field, …).",
  xmlExample: `<form id="signup" label="Form" x="0" y="0" width="360" height="140">
  <input id="signup-email" label="Email" x="16" y="16" width="328" height="40"/>
  <button id="signup-submit" label="Submit" x="16" y="72" width="328" height="40"/>
</form>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

export const fieldModule: PtComponentModule = {
  type: "field",
  defaultBBox: fieldBBox,
  defaultNode: (id) =>
    ptNode(id, "field", fieldBBox, {
      props: { label: "Field" },
      children: [
        ptNode(`${id}-label`, "label", { width: 280, height: 20 }, {
          x: 0,
          y: 0,
          props: { label: "Field" },
        }),
        ptNode(`${id}-input`, "input", { width: 280, height: 40 }, {
          x: 0,
          y: 28,
          props: { label: "Field", placeholder: "Value" },
          value: "",
        }),
      ],
    }),
  Renderer: TreeRenderer,
  agentDescription: "Labeled field tree. Typically a label child plus an input or select child.",
  xmlExample: `<field id="email-field" label="Field" x="0" y="0" width="280" height="72">
  <label id="email-field-label" label="Email" x="0" y="0" width="280" height="20"/>
  <input id="email-field-input" label="Email" x="0" y="28" width="280" height="40"/>
</field>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

export const buttonGroupModule: PtComponentModule = {
  type: "button-group",
  defaultBBox: buttonGroupBBox,
  defaultNode: (id) =>
    ptNode(id, "button-group", buttonGroupBBox, {
      props: { label: "Actions" },
      children: [
        ptNode(`${id}-one`, "button", { width: 112, height: 40 }, {
          x: 0,
          y: 0,
          props: { label: "One", variant: "outline" },
        }),
        ptNode(`${id}-two`, "button", { width: 112, height: 40 }, {
          x: 120,
          y: 0,
          props: { label: "Two" },
        }),
      ],
    }),
  Renderer: TreeRenderer,
  agentDescription: "Horizontal group of button children.",
  xmlExample: `<button-group id="actions" label="Actions" x="0" y="0" width="240" height="40">
  <button id="actions-one" label="One" x="0" y="0" width="112" height="40"/>
  <button id="actions-two" label="Two" x="120" y="0" width="112" height="40"/>
</button-group>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

export const inputGroupModule: PtComponentModule = {
  type: "input-group",
  defaultBBox: inputGroupBBox,
  defaultNode: (id) =>
    ptNode(id, "input-group", inputGroupBBox, {
      props: { label: "Search" },
      children: [
        ptNode(`${id}-input`, "input", { width: 200, height: 40 }, {
          x: 0,
          y: 0,
          props: { label: "Search", placeholder: "Search" },
          value: "",
        }),
        ptNode(`${id}-go`, "button", { width: 72, height: 40 }, {
          x: 208,
          y: 0,
          props: { label: "Go" },
        }),
      ],
    }),
  Renderer: TreeRenderer,
  agentDescription: "Input plus adjacent control (usually a button) as children.",
  xmlExample: `<input-group id="search" label="Search" x="0" y="0" width="280" height="40">
  <input id="search-input" label="Search" x="0" y="0" width="200" height="40"/>
  <button id="search-go" label="Go" x="208" y="0" width="72" height="40"/>
</input-group>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};
