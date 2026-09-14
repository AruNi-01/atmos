import type { CSSProperties, ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { InTreeListbox } from "./listbox";
import { FONT, pairOptions, ptNode } from "./node";
import { ControlRoot, fireAgentActions, propText } from "./runtime";

const selectBBox = { width: 240, height: 40 };
const radioBBox = { width: 200, height: 88 };
const toggleGroupBBox = { width: 220, height: 36 };

function listRenderer(kind: "select" | "combobox", placeholder: string) {
  return function ListRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
    return (
      <ControlRoot node={node} mode={mode}>
        <InTreeListbox
          id={node.id}
          value={node.value}
          options={node.options ?? []}
          placeholder={placeholder}
          kind={kind}
          onSelect={(next) => {
            onCommit({ value: next });
            fireAgentActions(node, "change", onAction);
          }}
        />
      </ControlRoot>
    );
  };
}

export const comboboxModule: PtComponentModule = {
  type: "combobox",
  defaultBBox: selectBBox,
  defaultNode: (id) =>
    ptNode(id, "combobox", selectBBox, {
      props: { label: "Combobox" },
      value: "a",
      options: pairOptions(),
    }),
  Renderer: listRenderer("combobox", "Search"),
  agentDescription:
    "Searchable in-tree listbox. Use option children. Never a native OS select menu.",
  xmlExample: `<combobox id="model" label="Model" value="a" x="0" y="0" width="240" height="40">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</combobox>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

export const nativeSelectModule: PtComponentModule = {
  type: "native-select",
  defaultBBox: selectBBox,
  defaultNode: (id) =>
    ptNode(id, "native-select", selectBBox, {
      props: { label: "Native select" },
      value: "a",
      options: pairOptions(),
    }),
  Renderer: listRenderer("select", "Choose"),
  agentDescription:
    "Select-looking control with an in-tree listbox. Never renders a native OS select popup.",
  xmlExample: `<native-select id="theme" label="Theme" value="a" x="0" y="0" width="240" height="40">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</native-select>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

export const selectModule: PtComponentModule = {
  type: "select",
  defaultBBox: selectBBox,
  defaultNode: (id) =>
    ptNode(id, "select", selectBBox, {
      props: { label: "Select" },
      value: "a",
      options: pairOptions(),
    }),
  Renderer: listRenderer("select", "Select"),
  agentDescription: "In-tree listbox select. Use option children. Never a native OS <select>.",
  xmlExample: `<select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
  <option value="gpt-5.6">GPT-5.6</option>
  <option value="claude">Claude</option>
</select>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

function RadioGroupRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const name = propText(node, "name", node.id);
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        role="radiogroup"
        aria-label={propText(node, "label", "Options")}
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, height: "100%" }}
      >
        {(node.options ?? []).map((opt) => (
          <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={node.value === opt.value}
              onChange={() => {
                onCommit({ value: opt.value });
                fireAgentActions(node, "change", onAction);
              }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </ControlRoot>
  );
}

export const radioGroupModule: PtComponentModule = {
  type: "radio-group",
  defaultBBox: radioBBox,
  defaultNode: (id) =>
    ptNode(id, "radio-group", radioBBox, {
      props: { label: "Options", name: `${id}-group` },
      value: "a",
      options: pairOptions(),
    }),
  Renderer: RadioGroupRenderer,
  agentDescription: "Radio group. options are {value,label}. props.name groups the radios. value is the selected option.",
  xmlExample: `<radio-group id="plan" label="Plan" name="plan" value="a" x="0" y="0" width="200" height="88">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</radio-group>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "name", kind: "text" },
  ],
};

const chip = (pressed: boolean): CSSProperties => ({
  flex: 1,
  height: "100%",
  border: "1.5px solid var(--pt-ink, #1e1e1e)",
  background: pressed ? "var(--pt-ink, #1e1e1e)" : "var(--pt-paper, #fffef7)",
  color: pressed ? "var(--pt-paper, #fffef7)" : "var(--pt-ink, #1e1e1e)",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 500,
});

function ToggleGroupRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const options = node.options ?? [];
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        role="group"
        aria-label={propText(node, "label", "Toggles")}
        style={{ display: "flex", height: "100%", overflow: "hidden", borderRadius: 8 }}
      >
        {options.map((opt, index) => {
          const pressed = node.value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={pressed}
              style={{
                ...chip(pressed),
                borderLeft: index === 0 ? "1px solid rgba(0,0,0,0.12)" : "none",
                borderRadius: 0,
              }}
              onClick={() => {
                onCommit({ value: opt.value });
                fireAgentActions(node, "change", onAction);
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </ControlRoot>
  );
}

export const toggleGroupModule: PtComponentModule = {
  type: "toggle-group",
  defaultBBox: toggleGroupBBox,
  defaultNode: (id) =>
    ptNode(id, "toggle-group", toggleGroupBBox, {
      props: { label: "Align" },
      value: "a",
      options: pairOptions(),
    }),
  Renderer: ToggleGroupRenderer,
  agentDescription: "Single-select toggle group. options are {value,label}. value is the pressed option.",
  xmlExample: `<toggle-group id="align" label="Align" value="a" x="0" y="0" width="220" height="36">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</toggle-group>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};
