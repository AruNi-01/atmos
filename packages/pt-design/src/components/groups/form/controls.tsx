import type { CSSProperties, ReactElement } from "react";
import type { PtComponentModule, PtRendererProps } from "./contract";
import { ArtistInkHost } from "../../../embed/overlay/artist-ink";
import { CalendarGrid } from "./calendar-ui";
import { FIELD, ptNode } from "./node";
import { ControlRoot, fireAgentActions, propText } from "./runtime";

const buttonBBox = { width: 120, height: 40 };
const checkboxBBox = { width: 160, height: 28 };
const dateBBox = { width: 240, height: 40 };
const inputBBox = { width: 240, height: 40 };
const otpBBox = { width: 240, height: 44 };
const labelBBox = { width: 160, height: 24 };
const sliderBBox = { width: 240, height: 36 };
const switchBBox = { width: 140, height: 32 };
const textareaBBox = { width: 280, height: 88 };
const toggleBBox = { width: 88, height: 32 };

function buttonChrome(variant: string): CSSProperties {
  const ink = "var(--pt-ink, #1e1e1e)";
  if (variant === "ghost") {
    return { background: "transparent", color: ink };
  }
  if (variant === "destructive") {
    return { background: "transparent", color: "#dc2626" };
  }
  return { background: "transparent", color: ink };
}

function ButtonRenderer({ node, mode, onAction }: PtRendererProps): ReactElement {
  const variant = propText(node, "variant", "default");
  return (
    <ControlRoot node={node} mode={mode}>
      <ArtistInkHost seed={node.id}>
        <button
          type="button"
          style={{
            ...FIELD,
            ...buttonChrome(variant),
            cursor: "pointer",
            fontWeight: 500,
          }}
          onClick={() => fireAgentActions(node, "click", onAction)}
        >
          {propText(node, "label", "Button")}
        </button>
      </ArtistInkHost>
    </ControlRoot>
  );
}

export const buttonModule: PtComponentModule = {
  type: "button",
  defaultBBox: buttonBBox,
  defaultNode: (id) =>
    ptNode(id, "button", buttonBBox, {
      props: { label: "Button" },
    }),
  Renderer: ButtonRenderer,
  agentDescription: "Clickable button. Caption is props.label.",
  xmlExample: `<button id="btn" label="Button" x="0" y="0" width="120" height="40"/>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "variant", kind: "text" },
  ],
};

function CheckboxRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const checked = node.checked === true;
  return (
    <ControlRoot node={node} mode={mode}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, height: "100%", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            onCommit({ checked: event.target.checked });
            fireAgentActions(node, "change", onAction);
          }}
        />
        <span>{propText(node, "label", "Checkbox")}</span>
      </label>
    </ControlRoot>
  );
}

export const checkboxModule: PtComponentModule = {
  type: "checkbox",
  defaultBBox: checkboxBBox,
  defaultNode: (id) =>
    ptNode(id, "checkbox", checkboxBBox, {
      props: { label: "Checkbox" },
      checked: false,
    }),
  Renderer: CheckboxRenderer,
  agentDescription: "Checkbox control. checked is a boolean. Caption is props.label.",
  xmlExample: `<checkbox id="agree" label="I agree" checked="false" x="0" y="0" width="160" height="28"/>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "disabled", kind: "boolean" },
  ],
};

function DatePickerRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <input
        type="date"
        aria-label={propText(node, "label", "Date")}
        value={node.value ?? ""}
        style={FIELD}
        onChange={(event) => {
          onCommit({ value: event.target.value });
          fireAgentActions(node, "change", onAction);
        }}
      />
    </ControlRoot>
  );
}

export const datePickerModule: PtComponentModule = {
  type: "date-picker",
  defaultBBox: dateBBox,
  defaultNode: (id) =>
    ptNode(id, "date-picker", dateBBox, {
      props: { label: "Date" },
      value: "2026-09-02",
    }),
  Renderer: DatePickerRenderer,
  agentDescription: "Date picker using an operable date input. value is YYYY-MM-DD.",
  xmlExample: `<date-picker id="when" label="Date" value="2026-09-02" x="0" y="0" width="240" height="40"/>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

function InputRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <input
        type="text"
        aria-label={propText(node, "label", "Input")}
        placeholder={propText(node, "placeholder")}
        value={node.value ?? ""}
        style={FIELD}
        onChange={(event) => {
          onCommit({ value: event.target.value });
          fireAgentActions(node, "change", onAction);
        }}
      />
    </ControlRoot>
  );
}

export const inputModule: PtComponentModule = {
  type: "input",
  defaultBBox: inputBBox,
  defaultNode: (id) =>
    ptNode(id, "input", inputBBox, {
      props: { label: "Input", placeholder: "Type here" },
      value: "",
    }),
  Renderer: InputRenderer,
  agentDescription: "Single-line text input. value is the text. placeholder lives in props.",
  xmlExample: `<input id="email" label="Email" placeholder="you@example.com" value="" x="0" y="0" width="240" height="40"/>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "placeholder", kind: "text" },
  ],
};

function InputOtpRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const lengthRaw = Number(propText(node, "length", "6"));
  const length = Number.isFinite(lengthRaw) && lengthRaw > 0 ? Math.min(12, Math.floor(lengthRaw)) : 6;
  const chars = Array.from({ length }, (_, i) => (node.value ?? "")[i] ?? "");
  const commit = (nextChars: string[]) => {
    onCommit({ value: nextChars.join("") });
    fireAgentActions(node, "change", onAction);
  };
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ display: "flex", gap: 6, height: "100%", alignItems: "center" }} aria-label={propText(node, "label", "OTP")}>
        {chars.map((ch, index) => (
          <input
            key={index}
            inputMode="numeric"
            maxLength={1}
            value={ch}
            aria-label={`Digit ${index + 1}`}
            style={{ ...FIELD, textAlign: "center", padding: 0, fontVariantNumeric: "tabular-nums" }}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(-1);
              const copy = [...chars];
              copy[index] = next;
              commit(copy);
            }}
          />
        ))}
      </div>
    </ControlRoot>
  );
}

export const inputOtpModule: PtComponentModule = {
  type: "input-otp",
  defaultBBox: otpBBox,
  defaultNode: (id) =>
    ptNode(id, "input-otp", otpBBox, {
      props: { label: "Code", length: "6" },
      value: "",
    }),
  Renderer: InputOtpRenderer,
  agentDescription: "One-time-code input. value is the digits. props.length is the slot count.",
  xmlExample: `<input-otp id="code" label="Code" length="6" value="" x="0" y="0" width="240" height="44"/>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "length", kind: "number" },
  ],
};

function LabelRenderer({ node, mode }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {propText(node, "label", "Label")}
      </label>
    </ControlRoot>
  );
}

export const labelModule: PtComponentModule = {
  type: "label",
  defaultBBox: labelBBox,
  defaultNode: (id) => ptNode(id, "label", labelBBox, { props: { label: "Label" } }),
  Renderer: LabelRenderer,
  agentDescription: "Text label. Caption is props.label.",
  xmlExample: `<label id="email-label" label="Email" x="0" y="0" width="160" height="24"/>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

function SliderRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const min = propText(node, "min", "0");
  const max = propText(node, "max", "100");
  const minN = Number(min);
  const maxN = Number(max);
  const valueN = Number(node.value ?? "50");
  const lo = Number.isFinite(minN) ? minN : 0;
  const hi = Number.isFinite(maxN) && maxN !== lo ? maxN : lo + 100;
  const current = Number.isFinite(valueN) ? Math.min(hi, Math.max(lo, valueN)) : lo;
  const pct = ((current - lo) / (hi - lo)) * 100;
  const ink = "var(--pt-ink, #1e1e1e)";
  const paper = "var(--pt-paper, #fffef7)";
  return (
    <ControlRoot node={node} mode={mode}>
      <div
        style={{
          boxSizing: "border-box",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
        }}
      >
        <div
          style={{
            position: "relative",
            flex: 1,
            height: 20,
            minWidth: 0,
          }}
        >
          <div
            data-pt-slider-track=""
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: 10,
              marginTop: -5,
              boxSizing: "border-box",
              border: `1.5px solid ${ink}`,
              borderRadius: 999,
              overflow: "hidden",
              background: paper,
            }}
          >
            <div
              data-pt-slider-fill=""
              style={{
                width: `${pct}%`,
                height: "100%",
                background: `color-mix(in srgb, ${ink} 28%, ${paper})`,
              }}
            />
          </div>
          <div
            data-pt-slider-thumb=""
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: `${pct}%`,
              width: 16,
              height: 16,
              marginTop: -8,
              marginLeft: -8,
              boxSizing: "border-box",
              border: `1.5px solid ${ink}`,
              borderRadius: 999,
              background: paper,
              pointerEvents: "none",
            }}
          />
          <input
            type="range"
            aria-label={propText(node, "label", "Slider")}
            min={min}
            max={max}
            value={node.value ?? "50"}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              margin: 0,
              opacity: 0,
              cursor: "pointer",
              appearance: "none",
            }}
            onChange={(event) => {
              onCommit({ value: event.target.value });
              fireAgentActions(node, "change", onAction);
            }}
          />
        </div>
      </div>
    </ControlRoot>
  );
}

export const sliderModule: PtComponentModule = {
  type: "slider",
  defaultBBox: sliderBBox,
  defaultNode: (id) =>
    ptNode(id, "slider", sliderBBox, {
      props: { label: "Slider", min: "0", max: "100" },
      value: "50",
    }),
  Renderer: SliderRenderer,
  agentDescription: "Range slider. value is a number string. min/max live in props.",
  xmlExample: `<slider id="volume" label="Volume" min="0" max="100" value="50" x="0" y="0" width="240" height="36"/>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "min", kind: "number" },
    { key: "max", kind: "number" },
  ],
};

function SwitchRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const on = node.checked === true;
  return (
    <ControlRoot node={node} mode={mode}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={propText(node, "label", "Switch")}
          style={{
            width: 44,
            height: 24,
            border: "1.5px solid var(--pt-ink, #1e1e1e)",
            borderRadius: 999,
            padding: 2,
            background: on ? "var(--pt-ink, #1e1e1e)" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: on ? "flex-end" : "flex-start",
          }}
          onClick={() => {
            onCommit({ checked: !on });
            fireAgentActions(node, "change", onAction);
          }}
        >
          <span
            aria-hidden
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              background: "#fff",
              display: "block",
            }}
          />
        </button>
        <span>{propText(node, "label", "Switch")}</span>
      </div>
    </ControlRoot>
  );
}

export const switchModule: PtComponentModule = {
  type: "switch",
  defaultBBox: switchBBox,
  defaultNode: (id) =>
    ptNode(id, "switch", switchBBox, {
      props: { label: "Switch" },
      checked: false,
    }),
  Renderer: SwitchRenderer,
  agentDescription: "Boolean switch with role=switch. checked is a boolean.",
  xmlExample: `<switch id="notify" label="Notifications" checked="false" x="0" y="0" width="140" height="32"/>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

function TextareaRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  return (
    <ControlRoot node={node} mode={mode}>
      <textarea
        aria-label={propText(node, "label", "Textarea")}
        placeholder={propText(node, "placeholder")}
        value={node.value ?? ""}
        style={{ ...FIELD, padding: 8, resize: "none" }}
        onChange={(event) => {
          onCommit({ value: event.target.value });
          fireAgentActions(node, "change", onAction);
        }}
      />
    </ControlRoot>
  );
}

export const textareaModule: PtComponentModule = {
  type: "textarea",
  defaultBBox: textareaBBox,
  defaultNode: (id) =>
    ptNode(id, "textarea", textareaBBox, {
      props: { label: "Notes", placeholder: "Write a note" },
      value: "",
    }),
  Renderer: TextareaRenderer,
  agentDescription: "Multiline text area. value is the text.",
  xmlExample: `<textarea id="notes" label="Notes" placeholder="Write a note" value="" x="0" y="0" width="280" height="88"/>`,
  inspectorFields: [
    { key: "label", kind: "text" },
    { key: "placeholder", kind: "text" },
  ],
};

function ToggleRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
  const pressed = node.checked === true;
  return (
    <ControlRoot node={node} mode={mode}>
      <button
        type="button"
        aria-pressed={pressed}
        style={{
          ...FIELD,
          cursor: "pointer",
          background: pressed ? "var(--pt-ink, #1e1e1e)" : "var(--pt-paper, #fffef7)",
          color: pressed ? "var(--pt-paper, #fffef7)" : "var(--pt-ink, #1e1e1e)",
          fontWeight: 500,
        }}
        onClick={() => {
          onCommit({ checked: !pressed });
          fireAgentActions(node, "change", onAction);
        }}
      >
        {propText(node, "label", "Toggle")}
      </button>
    </ControlRoot>
  );
}

export const toggleModule: PtComponentModule = {
  type: "toggle",
  defaultBBox: toggleBBox,
  defaultNode: (id) =>
    ptNode(id, "toggle", toggleBBox, {
      props: { label: "Toggle" },
      checked: false,
    }),
  Renderer: ToggleRenderer,
  agentDescription: "Pressed/unpressed toggle button. checked is a boolean.",
  xmlExample: `<toggle id="bold" label="Bold" checked="false" x="0" y="0" width="88" height="32"/>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};

export const calendarModule: PtComponentModule = {
  type: "calendar",
  defaultBBox: { width: 280, height: 280 },
  defaultNode: (id) =>
    ptNode(id, "calendar", { width: 280, height: 280 }, {
      props: { label: "Calendar" },
      value: "2026-09-02",
    }),
  Renderer: function CalendarRenderer({ node, mode, onCommit, onAction }: PtRendererProps): ReactElement {
    return (
      <ControlRoot node={node} mode={mode}>
        <CalendarGrid
          value={node.value}
          onPick={(iso) => {
            onCommit({ value: iso });
            fireAgentActions(node, "change", onAction);
          }}
        />
      </ControlRoot>
    );
  },
  agentDescription: "In-tree month calendar grid. value is YYYY-MM-DD. Click a day to commit.",
  xmlExample: `<calendar id="day" label="Calendar" value="2026-09-02" x="0" y="0" width="280" height="280"/>`,
  inspectorFields: [{ key: "label", kind: "text" }],
};
