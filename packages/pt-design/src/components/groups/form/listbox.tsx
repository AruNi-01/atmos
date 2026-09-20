import { useState, type CSSProperties, type ReactElement } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { PtOption } from "../../../protocol";
import { SKETCH_RADIUS_CSS } from "../../sketch";
import { FONT } from "./node";

const triggerStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  margin: 0,
  border: "none",
  borderRadius: SKETCH_RADIUS_CSS,
  padding: "0 10px",
  background: "transparent",
  color: "var(--pt-ink, #1e1e1e)",
  fontFamily: FONT,
  fontSize: 14,
  textAlign: "left",
  cursor: "pointer",
};

const listStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: "100%",
  zIndex: 2,
  margin: 0,
  padding: 4,
  listStyle: "none",
  background: "var(--pt-paper, #fffef7)",
  border: "1px solid var(--pt-ink, #1e1e1e)",
  borderRadius: SKETCH_RADIUS_CSS,
  boxShadow: "2px 3px 0 color-mix(in srgb, var(--pt-ink, #1e1e1e) 18%, transparent)",
  maxHeight: 180,
  overflow: "auto",
};

const optionStyle = (selected: boolean, hovered: boolean): CSSProperties => ({
  padding: "8px 10px",
  borderRadius: SKETCH_RADIUS_CSS,
  cursor: "pointer",
  background:
    selected
      ? "color-mix(in srgb, var(--pt-ink, #1e1e1e) 14%, var(--pt-paper, #fffef7))"
      : hovered
        ? "color-mix(in srgb, var(--pt-ink, #1e1e1e) 8%, var(--pt-paper, #fffef7))"
        : "transparent",
  fontFamily: FONT,
  fontSize: 14,
});

export function InTreeListbox({
  id,
  value,
  options,
  placeholder,
  kind,
  onSelect,
}: {
  id: string;
  value?: string;
  options: PtOption[];
  placeholder: string;
  kind: "select" | "combobox";
  onSelect: (next: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const selected = options.find((opt) => opt.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const needle = query.trim().toLowerCase();
  const filtered =
    kind === "combobox" && needle
      ? options.filter(
          (opt) => opt.label.toLowerCase().includes(needle) || opt.value.toLowerCase().includes(needle),
        )
      : options;
  const shown = filtered.length > 0 ? filtered : options;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {kind === "combobox" ? (
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          value={query}
          placeholder={placeholder}
          style={{ ...triggerStyle, cursor: "text" }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      ) : (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          style={triggerStyle}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown size={14} aria-hidden />
        </button>
      )}
      <ul id={`${id}-listbox`} role="listbox" hidden={!open} style={listStyle}>
        {shown.map((opt, index) => (
          <li
            key={`${opt.value}-${index}`}
            id={`${id}-opt-${index}`}
            data-pt-list-option=""
            data-selected={opt.value === value ? "" : undefined}
            role="option"
            aria-selected={opt.value === value}
            style={optionStyle(opt.value === value, hovered === index)}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => {
              setQuery(opt.label);
              setOpen(false);
              setHovered(null);
              onSelect(opt.value);
            }}
          >
            {opt.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
