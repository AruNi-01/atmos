import { useState, type CSSProperties, type ReactElement } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SKETCH_RADIUS } from "../../sketch";
import { FONT } from "./node";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function parseIsoDate(value: string | undefined): { y: number; m: number; d: number } | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m: m - 1, d };
}

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthCells(y: number, m: number): Array<number | null> {
  const firstDow = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const navBtn: CSSProperties = {
  width: 28,
  height: 28,
  flexShrink: 0,
  border: "1px solid var(--pt-ink, #1e1e1e)",
  borderRadius: SKETCH_RADIUS,
  background: "var(--pt-paper, #fffef7)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--pt-ink, #1e1e1e)",
};

const dayBtn = (selected: boolean): CSSProperties => ({
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  padding: 0,
  overflow: "hidden",
  border: selected ? "1px solid var(--pt-ink, #1e1e1e)" : "1px solid transparent",
  borderRadius: SKETCH_RADIUS,
  background: selected ? "color-mix(in srgb, var(--pt-ink, #1e1e1e) 12%, var(--pt-paper, #fffef7))" : "transparent",
  color: "var(--pt-ink, #1e1e1e)",
  cursor: "pointer",
  fontFamily: FONT,
  fontSize: 12,
});

export function CalendarGrid({
  value,
  onPick,
}: {
  value?: string;
  onPick: (iso: string) => void;
}): ReactElement {
  const selected = parseIsoDate(value);
  const [view, setView] = useState(() => ({
    y: selected?.y ?? 2026,
    m: selected?.m ?? 8,
  }));
  const cells = monthCells(view.y, view.m);

  return (
    <div
      role="grid"
      aria-label="Calendar"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        padding: 6,
        overflow: "hidden",
        boxSizing: "border-box",
        fontFamily: FONT,
        background: "var(--pt-paper, #fffef7)",
        border: "none",
        borderRadius: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
        <button
          type="button"
          aria-label="Previous month"
          style={navBtn}
          onClick={() =>
            setView((prev) => {
              const m = prev.m - 1;
              return m < 0 ? { y: prev.y - 1, m: 11 } : { y: prev.y, m };
            })
          }
        >
          <ChevronLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontSize: 13, fontWeight: 600 }}>
          {MONTHS[view.m]} {view.y}
        </div>
        <button
          type="button"
          aria-label="Next month"
          style={navBtn}
          onClick={() =>
            setView((prev) => {
              const m = prev.m + 1;
              return m > 11 ? { y: prev.y + 1, m: 0 } : { y: prev.y, m };
            })
          }
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridTemplateRows: "auto repeat(6, minmax(0, 1fr))",
          gap: 2,
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {WEEKDAYS.map((day) => (
          <div key={day} style={{ textAlign: "center", fontSize: 11, color: "#71717a", overflow: "hidden" }}>
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          if (day == null) return <div key={`e-${index}`} />;
          const iso = toIso(view.y, view.m, day);
          const isSelected = selected != null && iso === value;
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              style={dayBtn(isSelected)}
              onClick={() => onPick(iso)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
