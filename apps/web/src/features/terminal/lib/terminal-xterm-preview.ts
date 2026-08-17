import type { IBufferCell, Terminal } from "@xterm/xterm";

const DEFAULT_FG = "#d4d4d8";
const DEFAULT_BG = "#09090b";

const ANSI_16 = [
  "#09090b",
  "#ef4444",
  "#22c55e",
  "#eab308",
  "#3b82f6",
  "#a855f7",
  "#06b6d4",
  "#e4e4e7",
  "#71717a",
  "#f87171",
  "#4ade80",
  "#facc15",
  "#60a5fa",
  "#c084fc",
  "#22d3ee",
  "#fafafa",
];

export function ansiPaletteColor(index: number): string {
  const i = Math.max(0, Math.floor(index));
  if (i < 16) return ANSI_16[i] ?? DEFAULT_FG;
  if (i < 232) {
    const n = i - 16;
    const r = Math.floor(n / 36);
    const g = Math.floor((n % 36) / 6);
    const b = n % 6;
    const to = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${to(r)},${to(g)},${to(b)})`;
  }
  const gray = 8 + (i - 232) * 10;
  return `rgb(${gray},${gray},${gray})`;
}

export function xtermCellCssColor(
  isDefault: boolean,
  isRgb: boolean,
  value: number,
  fallback: string,
): string {
  if (isDefault) return fallback;
  if (isRgb) {
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgb(${r},${g},${b})`;
  }
  return ansiPaletteColor(value);
}

/** Paint the visible xterm buffer into a card that matches the live pane shape. */
export function renderXtermBufferPreview(
  term: Pick<Terminal, "cols" | "rows" | "buffer">,
  width: number,
  height: number,
): string | null {
  const cols = Math.max(1, term.cols);
  const rows = Math.max(1, term.rows);
  const outW = Math.max(1, Math.round(width));
  const outH = Math.max(1, Math.round(height));
  const buf = term.buffer.active;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(outW * dpr);
  canvas.height = Math.round(outH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = DEFAULT_BG;
  ctx.fillRect(0, 0, outW, outH);

  const cellW = outW / cols;
  const cellH = outH / rows;
  const fontSize = Math.max(5, Math.floor(cellH * 0.78));
  ctx.font = `${fontSize}px "Hack Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = "middle";

  const cell: IBufferCell = buf.getNullCell();
  const start = buf.viewportY;
  for (let y = 0; y < rows; y += 1) {
    const line = buf.getLine(start + y);
    if (!line) continue;
    for (let x = 0; x < cols; x += 1) {
      const current = line.getCell(x, cell);
      if (!current) continue;
      const width = current.getWidth();
      if (width === 0) continue;
      let bg = xtermCellCssColor(
        current.isBgDefault(),
        current.isBgRGB(),
        current.getBgColor(),
        DEFAULT_BG,
      );
      let fg = xtermCellCssColor(
        current.isFgDefault(),
        current.isFgRGB(),
        current.getFgColor(),
        DEFAULT_FG,
      );
      if (current.isInverse()) {
        const swap = bg;
        bg = fg;
        fg = swap;
      }
      const px = x * cellW;
      const py = y * cellH;
      if (bg !== DEFAULT_BG) {
        ctx.fillStyle = bg;
        ctx.fillRect(px, py, cellW * width, cellH);
      }
      if (current.isInvisible()) continue;
      const chars = current.getChars();
      if (!chars) continue;
      ctx.fillStyle = current.isDim() ? "rgba(212,212,216,0.55)" : fg;
      ctx.fillText(chars, px, py + cellH / 2, cellW * width);
    }
  }

  try {
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  }
}
