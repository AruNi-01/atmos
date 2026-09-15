import { useState, type ReactElement } from "react";
import type { PtOption } from "../../../protocol";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { TEXT_FIELDS, propString, spatialNode } from "./defaults";
import { ContentShell, OverlayFrame, emitValue, overlayTokens } from "./shared";

const COMMAND_ITEMS: PtOption[] = [
  { value: "open-file", label: "Open file" },
  { value: "save", label: "Save" },
  { value: "toggle-theme", label: "Toggle theme" },
];

function CommandPanel(props: PtRendererProps): ReactElement {
  const [query, setQuery] = useState(props.node.value ?? "");
  const items = (props.node.options && props.node.options.length > 0 ? props.node.options : COMMAND_ITEMS).filter(
    (option) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q);
    },
  );
  const placeholder = propString(props.node, "label", "Search commands");

  return (
    <OverlayFrame
      node={props.node}
      mode={props.mode}
      onCommit={props.onCommit}
      onAction={props.onAction}
    >
      <ContentShell open role="dialog" style={{ padding: 0 }}>
        <input
          type="search"
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{
            appearance: "none",
            border: "none",
            borderBottom: `1px solid ${overlayTokens.border}`,
            borderRadius: 0,
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: overlayTokens.font,
            color: overlayTokens.fg,
            background: overlayTokens.bg,
            outline: "none",
          }}
        />
        <div role="listbox" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2, overflow: "auto", flex: 1 }}>
          {items.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              onClick={() => emitValue(props.node, option.value, props.onCommit, props.onAction)}
              style={{
                appearance: "none",
                textAlign: "left",
                border: "none",
                background: option.value === props.node.value ? overlayTokens.mutedBg : "transparent",
                color: overlayTokens.fg,
                cursor: "pointer",
                borderRadius: overlayTokens.radius,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: overlayTokens.font,
                textTransform: "none",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </ContentShell>
    </OverlayFrame>
  );
}

export const commandModule: PtComponentModule = {
  type: "command",
  defaultBBox: { width: 320, height: 280 },
  defaultNode: (id) =>
    spatialNode(
      "command",
      id,
      { width: 320, height: 280 },
      {
        title: "Command",
        description: "Search and run a command in-place.",
        label: "Search commands",
      },
      { options: COMMAND_ITEMS },
    ),
  agentDescription: "In-place command palette with a search field and result list inside the overlay box. Never a document portal.",
  xmlExample: `<command id="palette" title="Command" description="Search and run a command in-place." label="Search commands" x="24" y="24" width="320" height="280">
  <option value="open-file">Open file</option>
  <option value="save">Save</option>
  <option value="toggle-theme">Toggle theme</option>
</command>`,
  inspectorFields: TEXT_FIELDS,
  Renderer: CommandPanel,
};
